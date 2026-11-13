/**
 * Discord OAuth2 sign-in for the web terminal.
 *
 * The Discord user id is used verbatim as the operator id, so progress earned
 * in the browser is the same progress the Discord bot tracks.
 */

import crypto from 'node:crypto';

const AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const TOKEN_URL = 'https://discord.com/api/oauth2/token';
const API_BASE = 'https://discord.com/api/v10';

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

/* -------------------------------------------------------------- cookie utils */

export function parseCookies(header) {
  const jar = {};
  if (!header) return jar;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      jar[key] = decodeURIComponent(value);
    } catch {
      jar[key] = value;
    }
  }
  return jar;
}

export function serializeCookie(
  name,
  value,
  { maxAge, httpOnly = true, sameSite = 'Lax', path = '/', secure = false, domain = '' } = {},
) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`];
  if (domain) parts.push(`Domain=${domain}`);
  parts.push(`SameSite=${sameSite}`);
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  return parts.join('; ');
}

/** Constant time string comparison used for state and token checks. */
export function safeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Short, non reversible fingerprint of a secret value. Used in logs so an
 * operator can correlate a handshake without exposing the value itself.
 */
export function fingerprint(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

/* ------------------------------------------------------------- signed tokens */

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

export function sign(payload, secret) {
  const body = base64url(JSON.stringify(payload));
  const signature = base64url(crypto.createHmac('sha256', secret).update(body).digest());
  return `${body}.${signature}`;
}

export function verifySigned(token, secret, { maxAgeSeconds } = {}) {
  if (!token || typeof token !== 'string') return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const expected = base64url(crypto.createHmac('sha256', secret).update(body).digest());
  const provided = Buffer.from(signature);
  const computed = Buffer.from(expected);
  if (provided.length !== computed.length) return null;
  if (!crypto.timingSafeEqual(provided, computed)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (payload.exp && Date.now() > payload.exp) return null;
  if (maxAgeSeconds && payload.iat && Date.now() - payload.iat > maxAgeSeconds * 1000) return null;
  return payload;
}

/* ----------------------------------------------------------------- provider */

export class DiscordAuth {
  constructor({
    clientId,
    clientSecret,
    redirectUri,
    sessionSecret,
    guildId = '',
    botToken = '',
    requireGuild = false,
    logger,
  }) {
    this.clientId = clientId ?? '';
    this.clientSecret = clientSecret ?? '';
    this.redirectUri = redirectUri ?? '';
    this.sessionSecret = sessionSecret ?? '';
    this.guildId = guildId ?? '';
    this.botToken = botToken ?? '';
    this.requireGuild = Boolean(requireGuild);
    this.logger = logger;
    this.states = new Map();
  }

  get configured() {
    return Boolean(this.clientId && this.clientSecret);
  }

  /** Create a one-time state token guarding the OAuth handshake. */
  createState({ redirectUri = this.redirectUri } = {}) {
    const state = crypto.randomBytes(24).toString('base64url');
    this.states.set(state, { createdAt: Date.now(), redirectUri });
    this.pruneStates();
    return state;
  }

  /**
   * Consume a state token. Returns the stored handshake record (including the
   * redirect URI that was used for the authorize request) or null when the
   * state is unknown, already used or expired.
   */
  consumeState(state) {
    if (!state) return null;
    const record = this.states.get(state);
    this.states.delete(state);
    if (!record) return null;
    if (Date.now() - record.createdAt >= 10 * 60 * 1000) return null;
    return record;
  }

  pruneStates() {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [state, record] of this.states) {
      if (record.createdAt < cutoff) this.states.delete(state);
    }
  }

  authorizeUrl(state, { redirectUri = this.redirectUri } = {}) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'identify',
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  /** Exchange an authorization code for the Discord user profile. */
  async exchangeCode(code, { redirectUri = this.redirectUri } = {}) {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    this.logger?.debug('Discord token exchange response', {
      stage: 'auth.exchange',
      status: response.status,
      redirectUri,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new AuthError(`Discord token exchange failed (${response.status}): ${text.slice(0, 200)}`, 502);
    }

    const token = await response.json();
    if (!token.access_token) throw new AuthError('Discord did not return an access token.', 502);

    const profile = await this.fetchProfile(token.access_token);
    return { profile, accessToken: token.access_token };
  }

  async fetchProfile(accessToken) {
    const response = await fetch(`${API_BASE}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new AuthError(`Discord profile lookup failed (${response.status}).`, 502);
    }
    const profile = await response.json();
    if (!profile?.id) throw new AuthError('Discord profile did not include a user id.', 502);
    this.logger?.debug('Discord profile retrieved', {
      stage: 'auth.profile',
      userId: profile.id,
      username: profile.username,
    });
    return profile;
  }

  /**
   * Probe the client credentials without performing a real sign-in.
   *
   * Discord answers an authorization code request with a made up code with
   * "invalid_grant" when the client id and secret are correct, and with
   * "invalid_client" when they are not. That makes it possible to report a
   * wrong client secret at startup instead of after the user has already
   * walked through the consent screen.
   */
  async verifyClientCredentials({ redirectUri = this.redirectUri } = {}) {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'authorization_code',
      code: 'hello-cat-credential-probe',
      redirect_uri: redirectUri,
    });

    let response;
    try {
      response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch (error) {
      return { ok: false, reason: 'discord-unreachable', detail: error.message };
    }

    const text = await response.text().catch(() => '');
    if (response.status === 401) {
      return { ok: false, reason: 'invalid_client', detail: text.slice(0, 200) };
    }
    return { ok: true, reason: 'ok', status: response.status, detail: text.slice(0, 200) };
  }

  /** Optional guild membership / role gate. */
  async checkMembership(userId) {
    if (!this.requireGuild) return { ok: true };
    if (!this.guildId) {
      this.logger?.warn('Guild gate is enabled but GUILD_ID is not configured');
      return { ok: true };
    }
    if (!this.botToken) {
      this.logger?.warn('Guild gate is enabled but DISCORD_TOKEN is not configured');
      return { ok: true };
    }
    const response = await fetch(`${API_BASE}/guilds/${this.guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${this.botToken}` },
    });
    if (response.status === 404) {
      // A 404 is ambiguous: the user may simply not be a member, or the bot
      // may not be in that server at all. Only deny access in the first case,
      // otherwise a wrong guild id would lock out every operator.
      const guildResponse = await fetch(`${API_BASE}/guilds/${this.guildId}`, {
        headers: { Authorization: `Bot ${this.botToken}` },
      });
      if (guildResponse.status === 404) {
        this.logger?.error(
          'Guild gate is misconfigured: the bot is not a member of the configured guild, membership cannot be checked',
          { guildId: this.guildId },
        );
        return { ok: true, reason: 'guild-unknown' };
      }
      return { ok: false, message: 'You must be a member of the Hello Cat Discord server to use this terminal.' };
    }
    if (!response.ok) {
      this.logger?.error('Guild membership check failed', { status: response.status });
      return { ok: true };
    }
    return { ok: true };
  }

  /** Create the signed session cookie value for an operator. */
  createSessionToken(profile, { ttlSeconds = 60 * 60 * 12 } = {}) {
    return sign(
      {
        sub: profile.id,
        username: profile.global_name || profile.username || 'operator',
        discriminator: profile.discriminator ?? '0',
        avatar: profile.avatar ?? null,
        iat: Date.now(),
        exp: Date.now() + ttlSeconds * 1000,
      },
      this.sessionSecret,
    );
  }

  readSessionToken(token) {
    if (!this.sessionSecret) return null;
    return verifySigned(token, this.sessionSecret);
  }
}

export { AUTHORIZE_URL, TOKEN_URL, API_BASE };
