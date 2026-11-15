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
