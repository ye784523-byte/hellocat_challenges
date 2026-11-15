import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const publicDir = path.resolve(import.meta.dirname, '..', 'public');

async function readPublic(name) {
  return fs.readFile(path.join(publicDir, name), 'utf8');
}

/** The stylesheet without comments, so documentation cannot match a rule. */
async function readRules() {
  const css = await readPublic('styles.css');
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The ids the client toggles with the `hidden` attribute. */
async function hiddenToggledIds() {
  const app = await readPublic('app.js');
  const ids = new Set();
  for (const match of app.matchAll(/\$?\('([a-z0-9-]+)'\)\.hidden/g)) {
    ids.add(match[1]);
  }
  return [...ids];
}

test('the hidden attribute wins over the layout rules of the application', async () => {
  const css = await readRules();

  const rule = css.match(/\[hidden\]\s*\{([^}]*)\}/);
  assert.ok(rule, 'styles.css must contain a [hidden] rule');
  assert.match(rule[1], /display:\s*none\s*!important/, 'the [hidden] rule must use display: none !important');
});

test('every element toggled with hidden exists in the page', async () => {
  const html = await readPublic('index.html');
  const ids = await hiddenToggledIds();

  assert.ok(ids.length > 0, 'the client toggles elements with the hidden attribute');
  for (const id of ids) {
    assert.ok(html.includes(`id="${id}"`), `the page must contain an element with id "${id}"`);
  }
});

test('the elements that are toggled with hidden declare a display value', async () => {
  const css = await readRules();
  const html = await readPublic('index.html');
  const ids = await hiddenToggledIds();

  // A class that sets a display value would defeat the user agent rule for
  // the [hidden] attribute, which is why the explicit override is required.
  const displayClasses = new Set();
  for (const match of css.matchAll(/\.([a-z0-9_-]+)\s*\{[^}]*display:\s*(flex|grid|block|inline-flex)/gi)) {
    displayClasses.add(match[1]);
  }

  const affected = [];
  for (const id of ids) {
    const element = html.match(new RegExp(`<[^>]*id="${id}"[^>]*>`));
    if (!element) continue;
    const className = element[0].match(/class="([^"]*)"/)?.[1] ?? '';
    for (const name of className.split(/\s+/).filter(Boolean)) {
      if (displayClasses.has(name)) affected.push(`${id}.${name}`);
    }
  }

  // This is the trap the application fell into: .boot is a grid and .shell
  // and .flagbar are flex, so the overlay never disappeared.
  assert.ok(affected.includes('boot.boot'), 'the boot overlay is expected to set a display value');
  assert.ok(affected.includes('shell.shell'), 'the shell is expected to set a display value');
});

test('the brief takes two fifths of the width and the terminal the rest', async () => {
  const css = await readRules();

  const layout = css.match(/\.layout\s*\{([^}]*)\}/);
  assert.ok(layout, 'styles.css must contain a .layout rule');
  assert.match(
    layout[1],
    /grid-template-columns:\s*40%\s+60%/,
    'the panel takes 40% of the width and the terminal 60%',
  );
});

test('the challenge brief is rendered in the left panel', async () => {
  const html = await readPublic('index.html');
  const css = await readRules();

  // The panel holds the brief of the loaded challenge.
  assert.match(html, /class="info" id="info"/, 'the panel must hold the challenge info');
  assert.match(html, /id="info-objective"/, 'the brief must show the objective');
  assert.match(html, /id="info-description"/, 'the brief must show the description');
  assert.match(html, /id="info-prerequisites"/, 'the brief must show the prerequisites');
  assert.match(html, /id="info-hints"/, 'the brief must show the hints');
  assert.match(html, /id="info-xp"/, 'the brief must show the reward');

  // The panel comes before the stage in the document.
  const panel = html.indexOf('class="panel"');
  const stage = html.indexOf('class="stage"');
  assert.ok(panel >= 0 && stage > panel, 'the panel must be on the left of the terminal');

  assert.match(css, /\.info\s*\{/, 'the stylesheet must style the brief');
});

test('the terminal page keeps its working directory visible', async () => {
  const html = await readPublic('index.html');
  const app = await readPublic('app.js');

  assert.match(html, /id="stage-path"/, 'the stage must show the working directory');
  assert.match(app, /renderPath/, 'the client must update the working directory');
});

test('the client walks the command history with the arrow keys', async () => {
  const app = await readPublic('app.js');

  assert.match(app, /\\u001b\[A/, 'the up arrow must walk the history');
  assert.match(app, /\\u001b\[B/, 'the down arrow must walk the history');
  assert.match(app, /state\.history/, 'the client must keep the history of the session');
  assert.match(app, /payload\.history/, 'the client must seed the history from the server');
});
