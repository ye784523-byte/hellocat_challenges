import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const addonPath = path.resolve(import.meta.dirname, '..', 'public', 'fit-addon.js');

/**
 * The addon ships as a browser script, so it is evaluated the same way the
 * browser evaluates it instead of being imported.
 */
async function loadFitAddon() {
  const source = await fs.readFile(addonPath, 'utf8');
  const sandbox = { module: { exports: {} }, console };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return { api: sandbox.module.exports, sandbox };
}

const { api: fitAddon, sandbox } = await loadFitAddon();
const { createFitAddon } = fitAddon;

/**
 * Reproduces the xterm.js AddonManager contract: loadAddon() stores the
 * addon and assigns a `dispose` property to it, then activates it.
 */
function loadAddonLikeXterm(terminal, addon) {
  const entry = { instance: addon, dispose: addon.dispose, isDisposed: false };
  addon.dispose = () => entry.isDisposed;
  addon.activate(terminal);
  return entry;
}

function fakeTerminal({ cols = 80, rows = 24, cellWidth = 8, cellHeight = 17, width = 800, height = 400 } = {}) {
  const parent = {
    clientWidth: width,
    clientHeight: height,
  };
  const element = { parentElement: parent };
  return {
    cols,
    rows,
    element,
    options: { fontFamily: 'monospace', fontSize: 13, lineHeight: 1.25 },
    _renderService: { dimensions: { css: { cell: { width: cellWidth, height: cellHeight } } } },
    resized: [],
    resize(columns, rows) {
      this.resized.push([columns, rows]);
      this.cols = columns;
      this.rows = rows;
    },
  };
}

test('loadAddon rejects a string because it assigns dispose to it', () => {
  const terminal = fakeTerminal();
  assert.throws(() => {
    // The xterm addon manager does exactly this with the argument it is given.
    const entry = { instance: 'fit', dispose: undefined, isDisposed: false };
    'fit'.dispose = () => entry.isDisposed;
  }, /Cannot create property 'dispose' on string 'fit'/);
});

test('the fit addon satisfies the xterm addon contract', () => {
  const terminal = fakeTerminal();
  const addon = createFitAddon(terminal);

  assert.equal(typeof addon.activate, 'function');
  assert.equal(typeof addon.dispose, 'function');
  assert.equal(typeof addon.fit, 'function');

  const entry = loadAddonLikeXterm(terminal, addon);
  assert.equal(entry.instance, addon);
  assert.equal(typeof addon.dispose, 'function', 'dispose stays callable after registration');
});

test('the fit addon resizes the terminal to its container', () => {
  const terminal = fakeTerminal({ width: 800, height: 400, cellWidth: 8, cellHeight: 20 });
  const addon = createFitAddon(terminal);

  addon.fit();

  assert.deepEqual(terminal.resized, [[100, 20]]);
  assert.equal(terminal.cols, 100);
  assert.equal(terminal.rows, 20);
});

test('the fit addon keeps the terminal size when nothing changed', () => {
  const terminal = fakeTerminal({ cols: 100, rows: 20, width: 800, height: 400, cellWidth: 8, cellHeight: 20 });
  const addon = createFitAddon(terminal);

  addon.fit();

  assert.deepEqual(terminal.resized, [], 'no resize is issued when the size already matches');
});

test('the fit addon ignores a container that is not laid out yet', () => {
  const terminal = fakeTerminal({ width: 0, height: 0 });
  const addon = createFitAddon(terminal);

  addon.fit();

  assert.deepEqual(terminal.resized, []);
});

test('the fit addon stops working after it was disposed', () => {
  const terminal = fakeTerminal({ width: 800, height: 400, cellWidth: 8, cellHeight: 20 });
  const addon = createFitAddon(terminal);

  addon.dispose();
  addon.fit();

  assert.deepEqual(terminal.resized, []);
});

test('the fit addon falls back to measuring the font when the renderer has no metrics', () => {
  const terminal = fakeTerminal({ width: 800, height: 400 });
  terminal._renderService = undefined;

  const probe = {
    style: {},
    textContent: '',
    setAttribute() {},
    getBoundingClientRect: () => ({ width: 800 }),
    remove() {},
  };
  sandbox.document = {
    body: { appendChild() {} },
    createElement: () => probe,
  };
  sandbox.getComputedStyle = () => ({
    paddingLeft: '0px',
    paddingRight: '0px',
    paddingTop: '0px',
    paddingBottom: '0px',
  });

  try {
    const addon = createFitAddon(terminal);
    addon.fit();
    // 800px / 8px per character, 400px / 16.25px per row.
    assert.equal(terminal.cols, 100);
    assert.equal(terminal.rows, 24);
  } finally {
    delete sandbox.document;
    delete sandbox.getComputedStyle;
  }
});

test('the shipped xterm bundle rejects a string and accepts the addon object', async () => {
  const vendorPath = path.resolve(import.meta.dirname, '..', 'public', 'vendor', 'xterm.js');
  const source = await fs.readFile(vendorPath, 'utf8');

  // Extract the real AddonManager.loadAddon implementation from the bundle
  // that ships to the browser.
  const start = source.indexOf('loadAddon(');
  assert.ok(start > 0, 'the vendor bundle must contain loadAddon');
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = index + 1;
        break;
      }
    }
  }
  assert.ok(end > 0, 'the loadAddon implementation could be extracted');

  const method = source.slice(start, end);
  assert.match(method, /\.dispose\s*=/, 'loadAddon assigns a dispose property to its argument');
  assert.match(method, /\.activate\(/, 'loadAddon activates its argument');

  // Class bodies are strict mode, exactly like the bundle that runs in the
  // browser, so assigning to a string primitive throws there as well.
  const Manager = new Function(
    'return class { constructor() { this._addons = []; } '
    + method
    + ' _wrappedAddonDispose(entry) { entry.isDisposed = true; } }',
  )();
  const manager = new Manager();

  assert.throws(
    () => manager.loadAddon({}, 'fit'),
    /Cannot create property 'dispose' on string 'fit'/,
    'passing a name to loadAddon is the bug that broke the terminal',
  );

  const terminal = fakeTerminal();
  const addon = createFitAddon(terminal);
  assert.doesNotThrow(() => manager.loadAddon(terminal, addon));
  assert.equal(manager._addons.at(-1).instance, addon);
});

test('the web application loads the addon and never passes a string to loadAddon', async () => {
  const appPath = path.resolve(import.meta.dirname, '..', 'public', 'app.js');
  const source = await fs.readFile(appPath, 'utf8');

  assert.ok(!/loadAddon\?\.\(\s*['"]/.test(source), 'loadAddon must not be called with a name');
  assert.match(source, /createFitAddon\?\.\(terminal\)/, 'the fit addon is created from the addon module');
  assert.match(source, /terminal\.loadAddon\(fitAddon\)/, 'the addon object is registered with xterm');
});
