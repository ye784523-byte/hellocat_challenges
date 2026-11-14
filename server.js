/**
 * HTTP server for the Hello Cat web terminal.
 *
 * Routes:
 *   GET  /                     the public landing page (the official site)
 *   GET  /terminal             the terminal application (requires sign-in)
 *   GET  /auth/login           start the Discord OAuth2 handshake
 *   GET  /auth/callback        finish the handshake and set the session cookie
 *   GET  /auth/logout          clear the session cookie
 *   GET  /api/public/stats     the range counters used by the landing page
 *   GET  /api/session          current operator profile and progress
 *   GET  /api/challenges       the challenge catalogue
 *   POST /api/challenges/start load a challenge environment
 *   POST /api/flag             submit a flag
 *   POST /api/hint              reveal a hint
 *   POST /api/terminal/exec    run a command inside the terminal
 *   GET  /api/terminal/events  server-sent events for the terminal
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DiscordAuth,
  fingerprint,
  parseCookies,
  safeEquals,
  serializeCookie,
  verifySigned,
} from './lib/auth.js';
import { loadLabDefinitions } from './lib/labs.js';
import {
  isTrustedProxyRequest as isTrustedProxy,
  resolveCookieSecure,
  resolveRequestScheme,
} from './lib/proxy.js';
import { SessionStore } from './lib/session.js';
import { commandCatalogue } from './lib/commands/index.js';
import { createStorage, initStorage, flushStorage } from './src/storage/index.js';
import { createServices } from './src/services/index.js';
import { createLogger } from './src/utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
};

const SESSION_COOKIE = 'hc_session';
const STATE_COOKIE = 'hc_oauth_state';
const STATE_TTL_SECONDS = 600;

/** The landing page is the public front door, the terminal sits behind it. */
const LANDING_PATH = '/';
const TERMINAL_PATH = '/terminal';

/** Fallbacks for deployments that do not configure the public addresses. */
const DEFAULT_OFFICIAL_SITE_URL = 'https://helloc.at';
const DEFAULT_DISCORD_INVITE_URL = 'https://discord.gg/hellocat';

export async function createWebServer({ config, logger }) {
  const storage = createStorage({ dataDir: config.dataDir, logger });
  await initStorage(storage, { logger });

  const services = createServices({
    storage,
    config,
    logger,
    client: { channels: { cache: new Map() } },
  });

  const labs = await loadLabDefinitions(config.labDir);
  logger.info('Lab environments loaded', { count: labs.size });

  const sessions = new SessionStore({
    challengeService: services.challengeService,
    labs,
    services,
    logger,
  });

  const auth = new DiscordAuth({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    sessionSecret: config.sessionSecret,
    guildId: config.GUILD_ID,
    botToken: config.DISCORD_TOKEN,
    requireGuild: config.requireGuild,
    logger,
  });

  /** Server-sent event subscribers, keyed by operator id. */
  const subscribers = new Map();

  function broadcast(userId, event, data) {
    for (const client of subscribers.get(userId) ?? []) {
      client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  }

  const server = http.createServer(async (request, response) => {
    try {
      await handle(request, response);
    } catch (error) {
      logger.error('Unhandled web request error', {
        path: request.url,
        error: error.message,
        stack: error.stack,
      });
      if (!response.headersSent) {
        sendJson(response, 500, { error: 'Internal server error' });
      } else {
        response.end();
      }
    }
  });

  async function handle(request, response) {
    const url = new URL(request.url, config.webBaseUrl || `http://localhost:${config.webPort}`);
    const cookies = parseCookies(request.headers.cookie);

    if (url.pathname === '/healthz') {
      return sendJson(response, 200, { status: 'ok', uptime: Math.round(process.uptime()) });
    }

    if (url.pathname === '/auth/login') {
      return handleLogin(request, response);
    }
    if (url.pathname === '/auth/callback') {
      return handleCallback(request, response, cookies, url);
    }
    if (url.pathname === '/auth/logout') {
      response.setHeader(
        'Set-Cookie',
        serializeCookie(SESSION_COOKIE, '', cookieOptions(request, { maxAge: 0 })),
      );
      return sendJson(response, 200, { ok: true });
    }

    // An authentication failure is reported on the landing page. It must stay
    // reachable without a session, otherwise the redirect back to /auth/login
    // turns every failure into an endless sign-in loop.
    const errorMessage = url.searchParams.get('error');
    if (errorMessage && (url.pathname === LANDING_PATH || url.pathname === TERMINAL_PATH)) {
      logger.warn('Authentication error page requested', {
        stage: 'auth.error_page',
        reason: 'error_query',
      });
      return sendAuthError(response, 400, errorMessage);
    }

    // The public range counters are the only API the landing page may read.
    // They carry counts, never challenge content.
    if (url.pathname === '/api/public/stats' && request.method === 'GET') {
      return handlePublicStats(response);
    }

    const operator = readOperator(cookies);
    const needsAuth = url.pathname.startsWith('/api/') || url.pathname === TERMINAL_PATH;

    if (needsAuth && !operator) {
      if (url.pathname.startsWith('/api/')) {
        return sendJson(response, 401, { error: 'Sign in with Discord to use the terminal.', code: 'unauthenticated' });
      }
      // A cookie that is present but rejected means the session cannot be
      // renewed silently. Show the reason instead of bouncing to sign-in,
      // which would loop back into the same broken session.
      if (cookies[SESSION_COOKIE]) {
        logger.warn('Session cookie rejected', {
          stage: 'auth.session',
          reason: 'invalid-or-expired-session-cookie',
        });
        response.setHeader(
          'Set-Cookie',
          serializeCookie(SESSION_COOKIE, '', cookieOptions(request, { maxAge: 0 })),
        );
        return sendAuthError(
          response,
          401,
          'Your session cookie was rejected (it may have expired or been signed with a different secret). Sign in again to continue.',
        );
      }
      response.statusCode = 302;
      response.setHeader('Location', '/auth/login');
      response.end();
      return undefined;
    }

    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, response, url, operator);
    }

    // The landing page is the official site: it is public, always.
    if (url.pathname === LANDING_PATH || url.pathname === '/landing.html') {
      return serveLanding(request, response);
    }

    // The terminal application lives behind the sign-in gate.
    if (url.pathname === TERMINAL_PATH) {
      return serveFile(request, response, 'index.html');
    }

    // Old links pointed at the application at the root of the site.
    if (url.pathname === '/index.html') {
      response.statusCode = 302;
      response.setHeader('Location', TERMINAL_PATH);
      response.end();
      return undefined;
    }

    return serveStatic(request, response, url.pathname);
  }

  /* -------------------------------------------------------------- landing */

  /**
   * The landing page is a template: the invite link, the official site and
   * the terminal address come from the configuration, so the page never has to
   * hard-code a deployment detail.
   */
  async function serveLanding(request, response) {
    const template = await fs.readFile(path.join(config.publicDir, 'landing.html'), 'utf8');
    const officialSite = config.officialSiteUrl || DEFAULT_OFFICIAL_SITE_URL;
    const invite = config.discordInviteUrl || DEFAULT_DISCORD_INVITE_URL;
    // The address the site is actually served from.
    const site = String(config.webBaseUrl || '').replace(/\/+$/, '');
    const body = template
      .replaceAll('{{OFFICIAL_SITE_URL}}', escapeHtml(officialSite))
      .replaceAll('{{DISCORD_INVITE_URL}}', escapeHtml(invite))
      .replaceAll('{{SITE_URL}}', escapeHtml(site))
      .replaceAll('{{TERMINAL_URL}}', TERMINAL_PATH);

    const etag = `W/"landing-${Buffer.byteLength(body).toString(16)}"`;
    response.setHeader('ETag', etag);
    response.setHeader('Cache-Control', 'no-cache');

    if (request.headers['if-none-match'] === etag) {
      response.statusCode = 304;
      response.end();
      return;
    }

    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
    });
    response.end(body);
  }

  /** The range counters on the landing page: counts only, no challenge data. */
  async function handlePublicStats(response) {
    const catalogue = await services.challengeService.list();
    const categories = {};
    const difficulties = {};

    for (const challenge of catalogue) {
      categories[challenge.category] = (categories[challenge.category] ?? 0) + 1;
      difficulties[challenge.difficulty] = (difficulties[challenge.difficulty] ?? 0) + 1;
    }

    return sendJson(response, 200, {
      total: catalogue.length,
      categories,
      difficulties,
    });
  }

  /* ------------------------------------------------------------------- auth */

  function handleLogin(request, response) {
    if (!auth.configured) {
      logger.error('Discord sign-in requested but the OAuth client is not configured', {
        stage: 'auth.login',
        reason: 'missing-client-credentials',
        clientIdConfigured: Boolean(config.clientId),
        clientSecretConfigured: Boolean(config.clientSecret),
      });
      return sendAuthError(
        response,
        503,
        'Discord sign-in is not configured on this server. Set DISCORD_CLIENT_SECRET (and CLIENT_ID) in the environment and restart.',
      );
    }

    const redirectUri = resolveRedirectUri(request);
    const state = auth.createState({ redirectUri });
    const secure = isSecureRequest(request);

    response.setHeader(
      'Set-Cookie',
      serializeCookie(STATE_COOKIE, state, cookieOptions(request, { maxAge: STATE_TTL_SECONDS })),
    );
    response.statusCode = 302;
    response.setHeader('Location', auth.authorizeUrl(state, { redirectUri }));
    response.setHeader('Cache-Control', 'no-store');
    response.end();

    logger.info('Discord sign-in started', {
      stage: 'auth.login',
      stateFingerprint: fingerprint(state),
      redirectUri,
      secureCookie: secure,
      trustedProxy: isTrustedProxyRequest(request),
    });
  }

  async function handleCallback(request, response, cookies, url) {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');
    const stateFingerprint = fingerprint(state);

    logger.info('Discord sign-in callback received', {
      stage: 'auth.callback',
      hasCode: Boolean(code),
      hasState: Boolean(state),
      stateFingerprint,
      discordError: error ?? null,
    });

    if (error) {
      logger.warn('Discord returned an error during authorization', {
        stage: 'auth.callback',
        reason: 'discord_error',
        discordError: error,
      });
      const detail = errorDescription ? `${error}: ${errorDescription}` : error;
      return sendAuthError(response, 400, `Discord refused the authorization request (${detail}).`);
    }

    if (!code) {
      logger.warn('Discord callback did not include an authorization code', {
        stage: 'auth.callback',
        reason: 'missing-code',
      });
      return sendAuthError(response, 400, 'Discord did not return an authorization code. Please try again.');
    }

    const record = auth.consumeState(state);
    if (!record) {
      logger.warn('Discord callback rejected', {
        stage: 'auth.callback',
        reason: 'unknown-or-expired-state',
        stateFingerprint,
      });
      return sendAuthError(
        response,
        400,
        'This sign-in attempt expired or was already used. Please start the sign-in again.',
      );
    }

    // Double submit check: the state has to match the cookie that was handed
    // out with this browser. Without it a state issued to another browser
    // could be replayed here (login CSRF).
    const cookieState = cookies[STATE_COOKIE];
    if (!cookieState) {
      logger.warn('Discord callback rejected', {
        stage: 'auth.callback',
        reason: 'missing-state-cookie',
        stateFingerprint,
      });
      return sendAuthError(
        response,
        400,
        'The sign-in cookie was missing or blocked by the browser. Allow cookies for this site and try again.',
      );
    }
    if (!safeEquals(cookieState, state)) {
      logger.warn('Discord callback rejected', {
        stage: 'auth.callback',
        reason: 'state-cookie-mismatch',
        stateFingerprint,
      });
      return sendAuthError(response, 400, 'The sign-in attempt could not be verified. Please try again.');
    }

    try {
      const { profile } = await auth.exchangeCode(code, { redirectUri: record.redirectUri });
      logger.info('Discord profile retrieved', {
        stage: 'auth.profile',
        userId: profile.id,
        username: profile.username,
      });

      const membership = await auth.checkMembership(profile.id);
      if (!membership.ok) {
        logger.warn('Discord sign-in denied by the guild gate', {
          stage: 'auth.membership',
          userId: profile.id,
        });
        return sendAuthError(response, 403, membership.message);
      }

      const token = auth.createSessionToken(profile, { ttlSeconds: config.sessionTtlSeconds });
      const secure = isSecureRequest(request);
      response.setHeader('Set-Cookie', [
        serializeCookie(SESSION_COOKIE, token, cookieOptions(request, { maxAge: config.sessionTtlSeconds })),
        serializeCookie(STATE_COOKIE, '', cookieOptions(request, { maxAge: 0 })),
      ]);
      response.statusCode = 302;
      response.setHeader('Location', TERMINAL_PATH);
      response.setHeader('Cache-Control', 'no-store');
      response.end();

      logger.info('Discord session established', {
        stage: 'auth.session',
        userId: profile.id,
        username: profile.username,
        expiresInSeconds: config.sessionTtlSeconds,
        secureCookie: secure,
        sessionCookie: SESSION_COOKIE,
      });
    } catch (callbackError) {
      logger.error('Discord sign-in failed', {
        stage: 'auth.exchange',
        reason: callbackError.message,
        stateFingerprint,
      });
      return sendAuthError(response, 502, callbackError.message);
    }
  }

  function readOperator(cookies) {
    const token = cookies[SESSION_COOKIE];
    if (!token) return null;
    const payload = verifySigned(token, config.sessionSecret);
    if (!payload?.sub) {
      logger.debug('Session cookie rejected', {
        stage: 'auth.session',
        reason: 'invalid-signature-or-expired',
      });
      return null;
    }
    return { id: payload.sub, username: payload.username, avatar: payload.avatar };
  }

  /* ------------------------------------------------------- request plumbing */

  /**
   * The redirect URI has to match the one registered in the Discord developer
   * portal exactly. When it is not configured it is derived from the host the
   * browser used, which keeps ephemeral tunnel URLs working.
   */
  function resolveRedirectUri(request) {
    if (config.redirectUri) return config.redirectUri;
    const host = request.headers.host ?? `localhost:${config.webPort}`;
    return `${resolveRequestScheme(request, config)}://${host}/auth/callback`;
  }

  function isSecureRequest(request) {
    return resolveCookieSecure(request, config);
  }

  function isTrustedProxyRequest(request) {
    return isTrustedProxy(request, config);
  }

  function cookieOptions(request, overrides = {}) {
    return {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      secure: isSecureRequest(request),
      domain: config.cookieDomain || undefined,
      ...overrides,
    };
  }

  /* -------------------------------------------------------------------- api */

  async function handleApi(request, response, url, operator) {
    const { pathname } = url;

    if (pathname === '/api/session' && request.method === 'GET') {
      const session = sessions.ensure(operator.id, operator.username);
      const progress = await services.challengeService.userProgress(operator.id);
      const profile = await services.playerService.getUser(operator.id);
      return sendJson(response, 200, {
        user: {
          id: operator.id,
          username: operator.username,
          avatar: operator.avatar,
          xp: profile?.xp ?? 0,
          coins: 0,
        },
        challenge: session.challengeId,
        cwd: session.shell.cwd,
        hostname: session.shell.hostname,
        prompt: session.shell.prompt(),
        progress,
        commands: commandCatalogue(),
      });
    }

    if (pathname === '/api/challenges' && request.method === 'GET') {
      const session = sessions.ensure(operator.id, operator.username);
      const list = await session.listChallenges();
      const solved = new Set(await session.solvedChallengeIds());
      return sendJson(response, 200, {
        challenges: list.map((challenge) => ({
          ...challenge,
          solved: solved.has(challenge.id),
        })),
      });
    }

    if (pathname === '/api/challenges/start' && request.method === 'POST') {
      const body = await readJson(request);
      const session = sessions.ensure(operator.id, operator.username);
      const result = await session.startChallenge(String(body.id ?? '').toUpperCase());
      if (!result.ok) return sendJson(response, 400, result);
      broadcast(operator.id, 'challenge', { challenge: result.challenge });
      return sendJson(response, 200, {
        ...result,
        cwd: session.shell.cwd,
        hostname: session.shell.hostname,
      });
    }

    if (pathname === '/api/flag' && request.method === 'POST') {
      const body = await readJson(request);
      const session = sessions.ensure(operator.id, operator.username);
      const result = await session.submitFlag(String(body.flag ?? ''));
      if (result.ok) {
        broadcast(operator.id, 'solved', result);
        logger.info('Flag solved from the web terminal', {
          userId: operator.id,
          challengeId: session.challengeId,
        });
      }
      return sendJson(response, result.ok ? 200 : 400, result);
    }

    if (pathname === '/api/hint' && request.method === 'POST') {
      const body = await readJson(request);
      const session = sessions.ensure(operator.id, operator.username);
      const result = await session.requestHint();
      return sendJson(response, result.ok ? 200 : 400, result);
    }

    if (pathname === '/api/terminal/exec' && request.method === 'POST') {
      const body = await readJson(request);
      const command = String(body.command ?? '');
      if (command.length > 400) {
        return sendJson(response, 400, { error: 'Command is too long.' });
      }
      const session = sessions.ensure(operator.id, operator.username);
      const result = await session.execute(command);
      return sendJson(response, 200, {
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code,
        cwd: session.shell.cwd,
        prompt: session.shell.prompt(),
      });
    }

    if (pathname === '/api/terminal/events' && request.method === 'GET') {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      response.write(`retry: 3000\n\n`);
      response.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

      const list = subscribers.get(operator.id) ?? new Set();
      list.add(response);
      subscribers.set(operator.id, list);

      const heartbeat = setInterval(() => {
        response.write(': keep-alive\n\n');
      }, 25_000);

      request.on('close', () => {
        clearInterval(heartbeat);
        list.delete(response);
      });
      return undefined;
    }

    return sendJson(response, 404, { error: 'Unknown endpoint' });
  }

  /* ----------------------------------------------------------------- static */

  async function serveStatic(request, response, pathname) {
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    return serveFile(request, response, relative);
  }

  async function serveFile(request, response, relative) {
    const target = path.join(config.publicDir, relative);

    if (!target.startsWith(config.publicDir)) {
      response.statusCode = 403;
      response.end('Forbidden');
      return;
    }

    try {
      const stat = await fs.stat(target);
      if (!stat.isFile()) throw new Error('not a file');

      // Assets are revalidated instead of being cached for an hour: a browser
      // that keeps a stale script keeps the bug it was shipped with.
      const etag = `W/"${stat.size.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}"`;
      response.setHeader('ETag', etag);
      response.setHeader('Cache-Control', 'no-cache');

      if (request.headers['if-none-match'] === etag) {
        response.statusCode = 304;
        response.end();
        return;
      }

      const body = await fs.readFile(target);
      response.writeHead(200, {
        'Content-Type': MIME_TYPES[path.extname(target)] ?? 'application/octet-stream',
        'Content-Length': Buffer.byteLength(body),
      });
      response.end(body);
    } catch {
      response.statusCode = 404;
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.end('Not found\n');
    }
  }

  async function shutdown() {
    sessions.sweep();
    for (const list of subscribers.values()) {
      for (const client of list) client.end();
    }
    subscribers.clear();
    await flushStorage(storage);
  }

  return { server, sessions, services, storage, auth, labs, shutdown };
}

/* ------------------------------------------------------------------ helpers */

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Authentication failures are rendered on a public page. Redirecting to the
 * protected landing page instead would send the browser back to the sign-in
 * flow and hide the reason behind an endless login loop.
 */
function sendAuthError(response, status, message) {
  const safeMessage = escapeHtml(String(message ?? 'Unknown authentication error.').slice(0, 500));
  const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Hello Cat // Sign-in failed</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body class="autherror">
    <main class="autherror__card">
      <h1 class="autherror__title">Sign-in failed</h1>
      <p class="autherror__message">${safeMessage}</p>
      <p class="autherror__hint">The details were written to the web terminal log. Search for <code>auth.</code> in <code>logs/web-*.log</code>.</p>
      <p class="autherror__actions">
        <a class="autherror__button" href="/auth/login">Try signing in again</a>
        <a class="autherror__button" href="/">Back to the site</a>
      </p>
    </main>
  </body>
</html>
`;
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

export { SESSION_COOKIE, STATE_COOKIE };
