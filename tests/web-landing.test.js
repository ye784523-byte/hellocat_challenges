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

test('the landing page carries the matrix theme', async () => {
  const html = await readPublic('landing.html');
  const css = await readPublic('landing.css');
  const js = await readPublic('landing.js');

  assert.match(html, /id="rain"/, 'the page must host the rain canvas');
  assert.match(html, /class="scanlines"/, 'the page must carry the scanline overlay');
  assert.match(css, /\.rain\s*\{/, 'the stylesheet must style the rain canvas');
  assert.match(css, /--green:\s*#00ff88/, 'the stylesheet must keep the terminal green');
  assert.match(js, /GLYPHS/, 'the script must draw the falling glyphs');
  assert.match(js, /prefers-reduced-motion/, 'the rain must respect the motion preference');
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
