import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createWebServer } from '../server.js';
import { loadWebConfig, assertWebConfig } from '../lib/config.js';
import { isLoopbackAddress, resolveCookieSecure, resolveRequestScheme } from '../lib/proxy.js';
import { silentLogger } from './helpers.js';

const SESSION_SECRET = 'web-test-session-secret-32-chars-long';
const FLAG_SECRET = 'web-test-flag-secret-at-least-16-chars';
const CLIENT_ID = '1570057590900264970';
const CLIENT_SECRET = 'a'.repeat(64);
const DISCORD_USER = { id: '222222222222222222', username: 'hellocat', global_name: 'Hello Cat' };

/* --------------------------------------------------------------- fake discord */

/** Minimal stand-in for the Discord OAuth2 token and user endpoints. */
async function startDiscord({ clientSecret = CLIENT_SECRET, accessToken = 'test-access-token' } = {}) {
  const received = [];
  const server = await new Promise((resolve) => {
    const instance = http.createServer((request, response) => {
      const chunks = [];
      request.on('data', (chunk) => chunks.push(chunk));
      request.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        received.push({ url: request.url, body, headers: request.headers });

        if (request.url === '/api/oauth2/token') {
          const params = new URLSearchParams(body);
          if (params.get('client_secret') !== clientSecret || params.get('client_id') !== CLIENT_ID) {
            response.writeHead(401, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ error: 'invalid_client' }));
            return;
          }
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ access_token: accessToken, token_type: 'Bearer' }));
          return;
        }

        if (request.url === '/api/v10/users/@me') {
          if (request.headers.authorization !== `Bearer ${accessToken}`) {
            response.writeHead(401, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ error: 'unauthorized' }));
            return;
          }
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify(DISCORD_USER));
          return;
        }

        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'not_found' }));
      });
    });
    instance.listen(0, '127.0.0.1', () => resolve(instance));
  });

  const { port } = server.address();
  return {
    port,
    received,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

/** Route Discord traffic to the local stub for the duration of a test. */
function useDiscordStub(discord) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const target = typeof input === 'string' ? input : input?.url ?? String(input);
    if (target.startsWith('https://discord.com/')) {
      const parsed = new URL(target);
      return original(`http://127.0.0.1:${discord.port}${parsed.pathname}${parsed.search}`, init);
    }
    return original(input, init);
  };
  return () => {
    globalThis.fetch = original;
  };
}

/* ------------------------------------------------------------------- helpers */

async function startServer(overrides = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hellocat-auth-'));
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
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    sessionSecret: SESSION_SECRET,
    FLAG_SECRET,
    GUILD_ID: '',
    DISCORD_TOKEN: '',
    requireGuild: false,
    cookieSecure: false,
    trustProxy: true,
    sessionTtlSeconds: 3600,
    NODE_ENV: 'test',
    ...overrides,
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

/** Minimal cookie jar that honours the Secure attribute like a browser. */
function createJar() {
  const jar = new Map();

  function store(response) {
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair, ...attributes] = raw.split(';').map((part) => part.trim());
      const index = pair.indexOf('=');
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      const secure = attributes.some((attribute) => attribute.toLowerCase() === 'secure');
      const expired = attributes.some((attribute) => /^max-age=0$/i.test(attribute));
      if (!value || expired) jar.delete(name);
      else jar.set(name, { value, secure });
    }
  }

  return {
    store,
    header(secureChannel = false) {
      const pairs = [...jar.entries()]
        .filter(([, entry]) => !entry.secure || secureChannel)
        .map(([name, entry]) => `${name}=${entry.value}`);
      return pairs.join('; ');
    },
    get(name) {
      return jar.get(name)?.value ?? null;
    },
  };
}

function parseSetCookies(response) {
  return response.headers.getSetCookie?.() ?? [];
}

/* --------------------------------------------------------------------- tests */

test('the OAuth handshake issues a session cookie and signs the operator in', async () => {
  const discord = await startDiscord();
  const restore = useDiscordStub(discord);
  const server = await startServer();
  const jar = createJar();

  try {
    const login = await fetch(`${server.base}/auth/login`, { redirect: 'manual' });
    assert.equal(login.status, 302);

    const location = new URL(login.headers.get('location'));
    assert.equal(location.origin, 'https://discord.com');
    assert.equal(location.pathname, '/oauth2/authorize');
    assert.equal(location.searchParams.get('client_id'), CLIENT_ID);
    assert.equal(location.searchParams.get('response_type'), 'code');
    assert.equal(location.searchParams.get('scope'), 'identify');
    assert.equal(location.searchParams.get('redirect_uri'), server.config.redirectUri);

    const state = location.searchParams.get('state');
    assert.ok(state && state.length >= 32);

    jar.store(login);
    assert.ok(jar.get('hc_oauth_state'), 'the state cookie must be issued with the login redirect');

    const callback = await fetch(`${server.base}/auth/callback?code=valid-code&state=${state}`, {
      redirect: 'manual',
      headers: { cookie: jar.header() },
    });
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get('location'), '/terminal');

    const sessionCookie = parseSetCookies(callback).find((cookie) => cookie.startsWith('hc_session='));
    assert.ok(sessionCookie, 'a session cookie must be issued after a successful exchange');
    assert.match(sessionCookie, /HttpOnly/);
    assert.match(sessionCookie, /SameSite=Lax/);
    assert.match(sessionCookie, /Path=\//);

    jar.store(callback);

    const home = await fetch(`${server.base}/terminal`, { redirect: 'manual', headers: { cookie: jar.header() } });
    assert.equal(home.status, 200);
    assert.match(await home.text(), /HELLO CAT/);

    const session = await fetch(`${server.base}/api/session`, { headers: { cookie: jar.header() } });
    assert.equal(session.status, 200);
    const payload = await session.json();
    assert.equal(payload.user.id, DISCORD_USER.id);
    assert.equal(payload.user.username, 'Hello Cat');
  } finally {
    restore();
    await server.cleanup();
    await discord.close();
  }
});

test('the token exchange sends the redirect URI that was used for the authorize request', async () => {
  const discord = await startDiscord();
  const restore = useDiscordStub(discord);
  const server = await startServer({ redirectUri: '' });
  const jar = createJar();

  try {
    const login = await fetch(`${server.base}/auth/login`, { redirect: 'manual' });
    const location = new URL(login.headers.get('location'));
    const state = location.searchParams.get('state');
    const redirectUri = location.searchParams.get('redirect_uri');

    assert.equal(redirectUri, `${server.base}/auth/callback`, 'an unset redirect URI is derived from the request host');

    jar.store(login);
    await fetch(`${server.base}/auth/callback?code=valid-code&state=${state}`, {
      redirect: 'manual',
      headers: { cookie: jar.header() },
    });

    const tokenRequest = discord.received.find((entry) => entry.url === '/api/oauth2/token');
    assert.ok(tokenRequest, 'the authorization code must be exchanged with Discord');
    const params = new URLSearchParams(tokenRequest.body);
    assert.equal(params.get('grant_type'), 'authorization_code');
    assert.equal(params.get('code'), 'valid-code');
    assert.equal(params.get('client_id'), CLIENT_ID);
    assert.equal(params.get('client_secret'), CLIENT_SECRET);
    assert.equal(params.get('redirect_uri'), redirectUri);
  } finally {
    restore();
    await server.cleanup();
    await discord.close();
  }
});

test('a rejected OAuth client secret renders an error page instead of a login loop', async () => {
  const discord = await startDiscord({ clientSecret: 'a-different-secret' });
  const restore = useDiscordStub(discord);
  const server = await startServer();
  const jar = createJar();

  try {
    const login = await fetch(`${server.base}/auth/login`, { redirect: 'manual' });
    const state = new URL(login.headers.get('location')).searchParams.get('state');
    jar.store(login);

    const callback = await fetch(`${server.base}/auth/callback?code=valid-code&state=${state}`, {
      redirect: 'manual',
      headers: { cookie: jar.header() },
    });

    assert.notEqual(callback.status, 302, 'a failed sign-in must not redirect back into the sign-in flow');
    assert.equal(callback.status, 502);
    const body = await callback.text();
    assert.match(body, /Sign-in failed/);
    assert.match(body, /invalid_client/);
    assert.match(body, /href="\/auth\/login"/);
    assert.ok(!parseSetCookies(callback).some((cookie) => cookie.startsWith('hc_session=')), 'no session may be issued');
  } finally {
    restore();
    await server.cleanup();
    await discord.close();
  }
});

test('a Discord authorization error is reported on a public page', async () => {
  const server = await startServer();
  try {
    const response = await fetch(
      `${server.base}/auth/callback?error=access_denied&error_description=The+user+denied+the+request`,
      { redirect: 'manual' },
    );
    assert.equal(response.status, 400);
    const body = await response.text();
    assert.match(body, /access_denied/);
    assert.match(body, /Sign-in failed/);
  } finally {
    await server.cleanup();
  }
});

test('the OAuth state must match the state cookie and may only be used once', async () => {
  const discord = await startDiscord();
  const restore = useDiscordStub(discord);
  const server = await startServer();
  const jar = createJar();

  /** Start a fresh handshake and return its state plus the issued cookie. */
  async function beginLogin() {
    const login = await fetch(`${server.base}/auth/login`, { redirect: 'manual' });
    const state = new URL(login.headers.get('location')).searchParams.get('state');
    return { login, state };
  }

  try {
    // A state that was issued to another browser must not be accepted.
    const mine = await beginLogin();
    const foreign = await beginLogin();
    jar.store(mine.login);

    const mismatched = await fetch(`${server.base}/auth/callback?code=valid-code&state=${foreign.state}`, {
      redirect: 'manual',
      headers: { cookie: jar.header() },
    });
    assert.equal(mismatched.status, 400);
    assert.match(await mismatched.text(), /could not be verified/);

    // A callback without the state cookie is rejected as well.
    const withoutCookie = await beginLogin();
    const noCookie = await fetch(`${server.base}/auth/callback?code=valid-code&state=${withoutCookie.state}`, {
      redirect: 'manual',
    });
    assert.equal(noCookie.status, 400);
    assert.match(await noCookie.text(), /cookie was missing/);

    // A valid handshake signs the operator in.
    const valid = await beginLogin();
    jar.store(valid.login);
    const first = await fetch(`${server.base}/auth/callback?code=valid-code&state=${valid.state}`, {
      redirect: 'manual',
      headers: { cookie: jar.header() },
    });
    assert.equal(first.status, 302);

    // The state is single use: replaying the valid pair fails.
    const replay = await fetch(`${server.base}/auth/callback?code=valid-code&state=${valid.state}`, {
      redirect: 'manual',
      headers: { cookie: jar.header() },
    });
    assert.equal(replay.status, 400);
    assert.match(await replay.text(), /expired or was already used/);
  } finally {
    restore();
    await server.cleanup();
    await discord.close();
  }
});

test('HTTPS requests behind a trusted proxy receive a Secure session cookie', async () => {
  const discord = await startDiscord();
  const restore = useDiscordStub(discord);
  const server = await startServer({ cookieSecure: 'auto', trustProxy: true });
  const jar = createJar();

  try {
    const login = await fetch(`${server.base}/auth/login`, {
      redirect: 'manual',
      headers: { 'x-forwarded-proto': 'https' },
    });
    const state = new URL(login.headers.get('location')).searchParams.get('state');
    jar.store(login);

    const stateCookie = parseSetCookies(login).find((cookie) => cookie.startsWith('hc_oauth_state='));
    assert.match(stateCookie, /Secure/);
    assert.match(stateCookie, /HttpOnly/);
    assert.match(stateCookie, /SameSite=Lax/);

    const callback = await fetch(`${server.base}/auth/callback?code=valid-code&state=${state}`, {
      redirect: 'manual',
      headers: { cookie: jar.header(true), 'x-forwarded-proto': 'https' },
    });
    assert.equal(callback.status, 302);

    const sessionCookie = parseSetCookies(callback).find((cookie) => cookie.startsWith('hc_session='));
    assert.match(sessionCookie, /Secure/, 'a session issued over HTTPS must be Secure');
    assert.match(sessionCookie, /HttpOnly/);
    assert.match(sessionCookie, /SameSite=Lax/);
    assert.match(sessionCookie, /Path=\//);
  } finally {
    restore();
    await server.cleanup();
    await discord.close();
  }
});

test('plain HTTP requests do not receive a Secure cookie', async () => {
  const server = await startServer({ cookieSecure: 'auto', trustProxy: true });
  try {
    const login = await fetch(`${server.base}/auth/login`, { redirect: 'manual' });
    const stateCookie = parseSetCookies(login).find((cookie) => cookie.startsWith('hc_oauth_state='));
    assert.ok(stateCookie);
    assert.ok(!/Secure/i.test(stateCookie), 'a cookie sent over plain HTTP must not be Secure');
  } finally {
    await server.cleanup();
  }
});

test('a forwarded protocol header from a remote peer is ignored', () => {
  const remoteRequest = {
    headers: { 'x-forwarded-proto': 'https' },
    socket: { remoteAddress: '203.0.113.7', encrypted: false },
  };

  assert.equal(isLoopbackAddress('203.0.113.7'), false);
  assert.equal(resolveRequestScheme(remoteRequest, { trustProxy: true }), 'http');
  assert.equal(resolveCookieSecure(remoteRequest, { trustProxy: true, cookieSecure: 'auto' }), false);

  const localRequest = {
    headers: { 'x-forwarded-proto': 'https' },
    socket: { remoteAddress: '::ffff:127.0.0.1', encrypted: false },
  };
  assert.equal(resolveRequestScheme(localRequest, { trustProxy: true }), 'https');
  assert.equal(resolveCookieSecure(localRequest, { trustProxy: true, cookieSecure: 'auto' }), true);

  const untrusted = {
    headers: { 'x-forwarded-proto': 'https' },
    socket: { remoteAddress: '127.0.0.1', encrypted: false },
  };
  assert.equal(resolveRequestScheme(untrusted, { trustProxy: false }), 'http');
  assert.equal(resolveCookieSecure(untrusted, { trustProxy: false, cookieSecure: 'auto' }), false);
  assert.equal(resolveCookieSecure(untrusted, { trustProxy: false, cookieSecure: true }), true);
});

test('the session cookie is rejected when it was signed with another secret', async () => {
  const server = await startServer();
  try {
    const { sign } = await import('../lib/auth.js');
    const foreign = sign({ sub: '1', username: 'x', exp: Date.now() + 60_000 }, 'another-secret-value-32-characters');
    const response = await fetch(`${server.base}/terminal`, {
      redirect: 'manual',
      headers: { cookie: `hc_session=${foreign}` },
    });
    assert.equal(response.status, 401, 'a foreign session must not silently redirect into a sign-in loop');
    assert.match(await response.text(), /session cookie was rejected/);
  } finally {
    await server.cleanup();
  }
});

test('the credential probe reports a wrong client secret before a user signs in', async () => {
  const discord = await startDiscord({ clientSecret: 'the-real-secret' });
  const restore = useDiscordStub(discord);
  const { DiscordAuth } = await import('../lib/auth.js');

  try {
    const auth = new DiscordAuth({
      clientId: CLIENT_ID,
      clientSecret: 'the-wrong-secret',
      redirectUri: 'http://127.0.0.1/auth/callback',
      sessionSecret: SESSION_SECRET,
      logger: silentLogger,
    });

    const probe = await auth.verifyClientCredentials();
    assert.equal(probe.ok, false);
    assert.equal(probe.reason, 'invalid_client');
    assert.match(probe.detail, /invalid_client/);

    const good = new DiscordAuth({
      clientId: CLIENT_ID,
      clientSecret: 'the-real-secret',
      redirectUri: 'http://127.0.0.1/auth/callback',
      sessionSecret: SESSION_SECRET,
      logger: silentLogger,
    });
    const accepted = await good.verifyClientCredentials();
    assert.equal(accepted.ok, true);
  } finally {
    restore();
    await discord.close();
  }
});

test('the guild gate denies non members but survives an unreachable guild', async () => {
  const { DiscordAuth } = await import('../lib/auth.js');
  const original = globalThis.fetch;

  function stub(guildVisible, memberStatus) {
    globalThis.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input?.url ?? String(input);
      if (url.includes('/members/')) {
        return new Response('{}', { status: memberStatus });
      }
      if (url.includes('/guilds/')) {
        return new Response('{}', { status: guildVisible ? 200 : 404 });
      }
      return original(input);
    };
  }

  try {
    const auth = new DiscordAuth({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      redirectUri: 'http://127.0.0.1/auth/callback',
      sessionSecret: SESSION_SECRET,
      guildId: '1570465542102319146',
      botToken: 'bot-token',
      requireGuild: true,
      logger: silentLogger,
    });

    // The bot is in the guild, the user is not: access is denied.
    stub(true, 404);
    const denied = await auth.checkMembership('222222222222222222');
    assert.equal(denied.ok, false);
    assert.match(denied.message, /member of the Hello Cat Discord server/);

    // The bot cannot see the guild at all: a misconfiguration must not lock
    // every operator out.
    stub(false, 404);
    const allowed = await auth.checkMembership('222222222222222222');
    assert.equal(allowed.ok, true);
    assert.equal(allowed.reason, 'guild-unknown');
  } finally {
    globalThis.fetch = original;
  }
});

test('the web configuration refuses to start without usable OAuth credentials', () => {
  const base = {
    DISCORD_TOKEN: 'bot-token',
    FLAG_SECRET,
    SESSION_SECRET,
    CLIENT_ID,
    DISCORD_CLIENT_SECRET: CLIENT_SECRET,
  };

  const withSecret = loadWebConfig(base, '/tmp/hello-cat-test');
  assert.equal(withSecret.clientId, CLIENT_ID);
  assert.equal(withSecret.clientSecret, CLIENT_SECRET);
  assert.equal(withSecret.cookieSecure, 'auto');
  assert.equal(withSecret.trustProxy, true);
  assert.equal(assertWebConfig(withSecret), true);

  const missingSecret = loadWebConfig({ ...base, DISCORD_CLIENT_SECRET: '' }, '/tmp/hello-cat-test');
  assert.equal(missingSecret.clientSecret, '');
  assert.throws(() => assertWebConfig(missingSecret), /DISCORD_CLIENT_SECRET is required/);

  const botTokenAsSecret = loadWebConfig(
    { ...base, DISCORD_CLIENT_SECRET: 'bot-token' },
    '/tmp/hello-cat-test',
  );
  assert.throws(() => assertWebConfig(botTokenAsSecret), /must not be the bot token/);

  const explicit = loadWebConfig(
    { ...base, DISCORD_CLIENT_SECRET: 'secret', WEB_COOKIE_SECURE: 'false', WEB_TRUST_PROXY: 'no' },
    '/tmp/hello-cat-test',
  );
  assert.equal(explicit.cookieSecure, false);
  assert.equal(explicit.trustProxy, false);
});

test('the web configuration derives the redirect URI from the public URL', () => {
  const base = { DISCORD_TOKEN: 'bot-token', FLAG_SECRET, SESSION_SECRET, CLIENT_ID, DISCORD_CLIENT_SECRET: 'secret' };

  const explicit = loadWebConfig({ ...base, WEB_REDIRECT_URI: 'https://term.example.com/auth/callback' }, '/tmp/x');
  assert.equal(explicit.redirectUri, 'https://term.example.com/auth/callback');

  const fromBase = loadWebConfig({ ...base, WEB_BASE_URL: 'https://term.example.com' }, '/tmp/x');
  assert.equal(fromBase.redirectUri, 'https://term.example.com/auth/callback');

  const derived = loadWebConfig(base, '/tmp/x');
  assert.equal(derived.redirectUri, '', 'an unset redirect URI is derived per request');
});
