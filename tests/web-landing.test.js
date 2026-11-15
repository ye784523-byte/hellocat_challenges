import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const publicDir = path.resolve(import.meta.dirname, '..', 'public');

async function readPublic(name) {
  return fs.readFile(path.join(publicDir, name), 'utf8');
}

test('the landing page states the official site in the copyright', async () => {
  const html = await readPublic('landing.html');

  assert.match(html, /\{\{OFFICIAL_SITE_URL\}\}/, 'the official site must be a template placeholder');
  assert.match(html, /rel="canonical" href="\{\{SITE_URL\}\}"/, 'the canonical address is the served site');
  assert.match(
    html,
    /footer__legal[\s\S]*\{\{OFFICIAL_SITE_URL\}\}/,
    'the official site belongs in the copyright',
  );
});

test('the landing page says that Discord is the only supported platform', async () => {
  const html = await readPublic('landing.html');

  assert.match(
    html,
    /DISCORD IS THE ONLY SUPPORTED PLATFORM/,
    'the platform policy must be stated in capitals',
  );
  assert.match(html, /\{\{DISCORD_INVITE_URL\}\}/, 'the invite must be a template placeholder');
});

test('the landing page explains why Hello Cat exists and how to join', async () => {
  const html = await readPublic('landing.html');

  assert.match(html, /id="why"/, 'the page must explain why the project exists');
  assert.match(html, /id="join"/, 'the page must explain how to join');
  assert.match(html, /id="faq"/, 'the page must answer the usual questions');
  assert.match(html, /id="range"/, 'the page must show the range');
  assert.match(html, /id="terminal"/, 'the page must present the web terminal');
  assert.match(html, /\{\{TERMINAL_URL\}\}/, 'the page must link to the terminal application');
});

test('the landing page carries the range theme', async () => {
  const html = await readPublic('landing.html');
  const css = await readPublic('landing.css');
  const js = await readPublic('landing.js');

  // The matrix theme is gone: no rain canvas, no scanline overlay.
  assert.doesNotMatch(html, /id="rain"/, 'the rain canvas must be gone');
  assert.doesNotMatch(html, /class="scanlines"/, 'the scanline overlay must be gone');
  assert.doesNotMatch(css, /\.rain\s*\{/, 'the stylesheet must not style a rain canvas');

  // The range theme: a lime accent on a near-black canvas, one pixel borders.
  assert.match(css, /--green:\s*#9ee15d/, 'the stylesheet must keep the range green');
  assert.match(css, /--bg:\s*#0b0d0c/, 'the stylesheet must keep the near-black canvas');
  assert.match(css, /\.backdrop__grid\s*\{/, 'the stylesheet must draw the background grid');

  // The two calls to action are the two buttons of the page.
  assert.match(html, /JOIN HELLO CAT/, 'the page must offer the Discord invite');
  assert.match(html, /CONNECT 2 TERMINAL/, 'the page must offer the terminal');
  assert.match(html, /class="dock"/, 'the page must keep the actions within reach on a phone');

  // The page is built for the phone first and widens from there.
  assert.match(
    html,
    /name="viewport" content="width=device-width, initial-scale=1/,
    'the page must declare a mobile viewport',
  );
  assert.match(css, /@media \(min-width: 760px\)/, 'the stylesheet must have a desktop breakpoint');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, 'the motion must be optional');

  assert.match(js, /prefers-reduced-motion/, 'the script must respect the motion preference');
  assert.match(js, /dock--visible/, 'the script must control the mobile dock');
});

test('the landing page never advertises a platform other than Discord', async () => {
  const html = await readPublic('landing.html');

  // The community lives in Discord, so no other client may be promised.
  for (const forbidden of ['telegram', 't.me/', 'whatsapp', 'slack', 'instagram', 'tiktok']) {
    assert.equal(html.toLowerCase().includes(forbidden), false, `the page must not mention ${forbidden}`);
  }
});

test('the landing page declares the placeholders the server fills in', async () => {
  const html = await readPublic('landing.html');
  const placeholders = [...html.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((match) => match[1]);

  assert.deepEqual(
    [...new Set(placeholders)].sort(),
    ['DISCORD_INVITE_URL', 'OFFICIAL_SITE_URL', 'SITE_URL', 'TERMINAL_URL'],
  );
});
