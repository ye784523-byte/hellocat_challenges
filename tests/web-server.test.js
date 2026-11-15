import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWebServer } from '../server.js';
import { sign } from '../lib/auth.js';
import { silentLogger } from './helpers.js';

const FLAG_SECRET = 'web-test-secret-at-least-16-chars';
const SESSION_SECRET = 'web-test-session-secret-32-chars-long';

async function startServer() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hellocat-web-'));
  const publicDir = path.resolve(import.meta.dirname, '..', 'public');

  const config = {
    dataDir,
    logDir: dataDir,
    backupDir: dataDir,
    challengesDir: path.resolve(import.meta.dirname, '..', 'challenges'),
    labDir: path.resolve(import.meta.dirname, '..', 'web', 'labs'),
    publicDir,
    webPort: 0,
    webHost: '127.0.0.1',
    webBaseUrl: 'http://127.0.0.1',
    redirectUri: 'http://127.0.0.1/auth/callback',
    officialSiteUrl: 'https://helloc.at',
    discordInviteUrl: 'https://discord.gg/hellocat',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    sessionSecret: SESSION_SECRET,
    FLAG_SECRET,
    GUILD_ID: '',
    DISCORD_TOKEN: '',
    requireGuild: false,
    cookieSecure: false,
    sessionTtlSeconds: 3600,
    NODE_ENV: 'test',
  };

  const app = await createWebServer({ config, logger: silentLogger });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const { port } = app.server.address();

  return {
    app,
    config,
    base: `http://127.0.0.1:${port}`,
    async cleanup() {
      await app.shutdown().catch(() => {});
      await new Promise((resolve) => app.server.close(resolve));
      await fs.rm(dataDir, { recursive: true, force: true });
    },
  };
}

function cookieFor(userId) {
  return `hc_session=${sign(
    { sub: userId, username: 'test-operator', iat: Date.now(), exp: Date.now() + 3_600_000 },
    SESSION_SECRET,
  )}`;
}

test('web server rejects unauthenticated API calls', async () => {
  const server = await startServer();
  try {
    const response = await fetch(`${server.base}/api/session`);
    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(payload.code, 'unauthenticated');
  } finally {
    await server.cleanup();
  }
});

test('web server serves the public landing page without a session', async () => {
  const server = await startServer();
  try {
    const response = await fetch(`${server.base}/`, { redirect: 'manual' });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /HELLO CAT/);
    assert.match(html, /helloc\.at/, 'the copyright must name the official site');
    assert.match(html, /rel="canonical" href="http:\/\/127\.0\.0\.1"/, 'the canonical address is the served site');
    assert.match(html, /Discord is the only supported platform/i);
    // The template placeholders must not survive the rendering.
    assert.equal(html.includes('{{'), false);
  } finally {
    await server.cleanup();
  }
});

test('web server redirects the terminal to Discord sign-in', async () => {
  const server = await startServer();
  try {
    const response = await fetch(`${server.base}/terminal`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/auth/login');
  } finally {
    await server.cleanup();
  }
});

test('web server serves the terminal for a signed-in operator', async () => {
  const server = await startServer();
  try {
    const response = await fetch(`${server.base}/terminal`, {
      headers: { cookie: cookieFor('user-1') },
      redirect: 'manual',
    });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /HELLO CAT/);
  } finally {
    await server.cleanup();
  }
});

test('the old application link points at the terminal', async () => {
  const server = await startServer();
  try {
    const response = await fetch(`${server.base}/index.html`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/terminal');
  } finally {
    await server.cleanup();
  }
});

test('the public range counters expose counts but no challenge data', async () => {
  const server = await startServer();
  try {
    const response = await fetch(`${server.base}/api/public/stats`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(typeof payload.total, 'number');
    assert.equal(typeof payload.categories, 'object');
    assert.equal(typeof payload.difficulties, 'object');
    // Only counters: no title, no flag and no hash may leave the server.
    assert.equal(JSON.stringify(payload).includes('flag'), false);
    assert.equal(JSON.stringify(payload).includes('HC{'), false);
  } finally {
    await server.cleanup();
  }
});

test('terminal API runs commands for the signed-in operator', async () => {
  const server = await startServer();
  try {
    const cookie = cookieFor('user-2');
    const response = await fetch(`${server.base}/api/terminal/exec`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ command: 'echo hello from the lab' }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.match(payload.stdout, /hello from the lab/);
    assert.equal(payload.code, 0);
    assert.match(payload.prompt, /analyst/);
    assert.match(payload.prompt, /@/);
  } finally {
    await server.cleanup();
  }
});

test('flag submission is verified and recorded against the shared store', async () => {
  const server = await startServer();
  try {
    const { services } = server.app;
    await services.challengeService.create(
      {
        title: 'Web Terminal Smoke Test',
        description: 'A challenge created to exercise the web flag submission pipeline.',
        objective: 'Submit the flag.',
        category: 'Linux',
        difficulty: 'Easy',
        xp: 100,
        flag: 'HC{web_smoke_test}',
        hints: [],
        maxAttempts: 3,
        authorId: 'test',
        authorName: 'Test',
      },
      { id: 'HC-900' },
    );
    await services.challengeService.publish('HC-900');

    const cookie = cookieFor('user-3');

    const start = await fetch(`${server.base}/api/challenges/start`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'HC-900' }),
    });
    assert.equal(start.status, 200);

    const wrong = await fetch(`${server.base}/api/flag`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ flag: 'HC{not_the_flag}' }),
    });
    assert.equal(wrong.status, 400);

    const right = await fetch(`${server.base}/api/flag`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ flag: 'HC{web_smoke_test}' }),
    });
    assert.equal(right.status, 200);
    const payload = await right.json();
    assert.equal(payload.ok, true);
    assert.match(payload.message, /solved/i);

    // Progress is shared with the Discord bot's storage.
    const solved = await services.challengeService.submissionsRepo.solved('user-3', 'HC-900');
    assert.equal(solved, true);
  } finally {
    await server.cleanup();
  }
});

test('challenge catalogue lists the lab challenges', async () => {
  const server = await startServer();
  try {
    const cookie = cookieFor('user-4');
    const response = await fetch(`${server.base}/api/challenges`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(Array.isArray(payload.challenges));
  } finally {
    await server.cleanup();
  }
});

test('a gated challenge stays sealed until its prerequisite is captured', async () => {
  const server = await startServer();
  try {
    const { services } = server.app;
    const gate = {
      title: 'First Contact',
      description: 'The challenge that opens the chain.',
      objective: 'Submit the first token.',
      category: 'Linux',
      difficulty: 'Easy',
      xp: 100,
      flag: 'HC{first_token}',
      hints: [],
      maxAttempts: 3,
      authorId: 'test',
      authorName: 'Test',
    };
    await services.challengeService.create(gate, { id: 'HC-901' });
    await services.challengeService.create(
      { ...gate, title: 'Second Contact', flag: 'HC{second_token}', prerequisites: ['HC-901'] },
      { id: 'HC-902' },
    );
    await services.challengeService.publish('HC-901');
    await services.challengeService.publish('HC-902');

    const cookie = cookieFor('user-5');

    const catalogue = await (await fetch(`${server.base}/api/challenges`, { headers: { cookie } })).json();
    const gated = catalogue.challenges.find((challenge) => challenge.id === 'HC-902');
    assert.equal(gated.locked, true);
    assert.deepEqual(gated.missingPrerequisites, ['HC-901']);

    const blockedStart = await fetch(`${server.base}/api/challenges/start`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'HC-902' }),
    });
    assert.equal(blockedStart.status, 400);
    const blockedPayload = await blockedStart.json();
    assert.match(blockedPayload.message, /locked/i);

    // Clearing the prerequisite unseals the environment.
    await services.challengeService.submit({
      userId: 'user-5',
      challengeId: 'HC-901',
      flag: 'HC{first_token}',
    });

    const allowedStart = await fetch(`${server.base}/api/challenges/start`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'HC-902' }),
    });
    assert.equal(allowedStart.status, 200);
  } finally {
    await server.cleanup();
  }
});

test('health endpoint is public', async () => {
  const server = await startServer();
  try {
    const response = await fetch(`${server.base}/healthz`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status, 'ok');
  } finally {
    await server.cleanup();
  }
});
