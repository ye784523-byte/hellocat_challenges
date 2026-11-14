/** Configuration for the Hello Cat web terminal. */

import path from 'node:path';
import { loadConfig as loadBotConfig } from '../src/config/config.js';

/** The fallback invite, used when no guild id and no invite are configured. */
const DEFAULT_DISCORD_INVITE_URL = 'https://discord.gg/hellocat';

/** The official website of the project. */
const DEFAULT_OFFICIAL_SITE_URL = 'https://helloc.at';

function booleanish(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

/**
 * Cookie security is a tri-state:
 *   'auto' - decide per request from the effective request scheme (proxy aware)
 *   true   - always mark cookies Secure
 *   false  - never mark cookies Secure (plain HTTP development only)
 */
function tristate(value, fallback = 'auto') {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  if (normalized === 'auto') return 'auto';
  return fallback;
}

export function loadWebConfig(env = process.env, cwd = process.cwd()) {
  const bot = loadBotConfig(env, cwd);

  // The port the HTTP server binds to. PaaS platforms (Railway, Render,
  // Fly) inject PORT, so fall back to it before the local development
  // default.
  const port = Number(env.WEB_PORT ?? env.PORT ?? 8000);
  const host = env.WEB_HOST ?? '0.0.0.0';
  const baseUrl = (env.WEB_BASE_URL ?? `http://localhost:${port}`).replace(/\/$/, '');

  // The redirect URI must match a URI registered in the Discord developer
  // portal byte for byte. WEB_REDIRECT_URI wins, then WEB_BASE_URL. When
  // neither is set the server derives it from the incoming request host so an
  // ephemeral tunnel URL (ngrok) still produces a matching redirect.
  const redirectUri = env.WEB_REDIRECT_URI || (env.WEB_BASE_URL ? `${baseUrl}/auth/callback` : '');

  // OAuth2 application credentials. The client secret is the value from the
  // Discord developer portal (General Information -> Client Secret). It is
  // never the bot token and never belongs in the repository.
  const clientId = env.WEB_CLIENT_ID || env.DISCORD_CLIENT_ID || env.CLIENT_ID || '';
  const clientSecret = env.WEB_CLIENT_SECRET || env.DISCORD_CLIENT_SECRET || '';

  const sessionSecret = env.SESSION_SECRET || env.FLAG_SECRET || '';

  // The official site. It is written on the landing page and in the footer of
  // every public page, because lookalike domains are the usual way people get
  // phished.
  const officialSiteUrl = (env.OFFICIAL_SITE_URL || DEFAULT_OFFICIAL_SITE_URL).replace(/\/+$/, '');

  // The invite to the Discord server. Discord is the only supported platform,
  // so this link is the primary call to action of the site. It falls back to
  // the guild id when no vanity invite is configured.
  const guildId = (env.GUILD_ID || env.DISCORD_GUILD_ID || '').trim();
  const explicitInvite = (env.DISCORD_INVITE_URL || '').trim();
  const discordInviteUrl = (
    explicitInvite ||
    (guildId ? `https://discord.gg/${guildId}` : '') ||
    DEFAULT_DISCORD_INVITE_URL
  ).replace(/\/+$/, '');

  const config = {
    ...bot,
    webPort: Number.isFinite(port) ? port : 8080,
    webHost: host,
    webBaseUrl: baseUrl,
    redirectUri,
    clientId,
    clientSecret,
    sessionSecret,
    officialSiteUrl,
    discordInviteUrl,
    // The landing page links to the invite, so a placeholder would send
    // visitors to a server that does not exist.
    discordInviteConfigured: Boolean(explicitInvite || guildId),
    requireGuild: booleanish(env.WEB_REQUIRE_GUILD, false),
    cookieSecure: tristate(env.WEB_COOKIE_SECURE, 'auto'),
    cookieDomain: (env.WEB_COOKIE_DOMAIN ?? '').trim(),
    trustProxy: booleanish(env.WEB_TRUST_PROXY, true),
    sessionTtlSeconds: Number(env.WEB_SESSION_TTL ?? 60 * 60 * 12),
    // The lab definitions and the static assets ship next to this file, so
    // they are resolved from the module location instead of the working
    // directory. That keeps the app working no matter where it is started
    // from (repository root, a service manager, or a container).
    labDir: path.resolve(import.meta.dirname, '..', 'labs'),
    publicDir: path.resolve(import.meta.dirname, '..', 'public'),
  };

  return Object.freeze(config);
}

export function assertWebConfig(config) {
  const problems = [];
  if (!config.clientId) {
    problems.push('CLIENT_ID (Discord application id) is required for Discord sign-in');
  }
  if (!config.clientSecret) {
    problems.push(
      'DISCORD_CLIENT_SECRET is required for Discord sign-in (Discord developer portal -> General Information -> Client Secret)',
    );
  } else if (config.clientSecret.length < 16) {
    problems.push('DISCORD_CLIENT_SECRET is too short to be a Discord OAuth2 client secret');
  }
  if (config.clientSecret && config.DISCORD_TOKEN && config.clientSecret === config.DISCORD_TOKEN) {
    problems.push('DISCORD_CLIENT_SECRET must not be the bot token (DISCORD_TOKEN)');
  }
  if (!config.sessionSecret || config.sessionSecret.length < 16) {
    problems.push('SESSION_SECRET (or FLAG_SECRET) must be at least 16 characters');
  }
  if (!config.FLAG_SECRET || config.FLAG_SECRET.length < 16) {
    problems.push('FLAG_SECRET is required to verify challenge flags');
  }
  if (problems.length > 0) {
    throw new Error(`Web terminal configuration invalid: ${problems.join('; ')}`);
  }
  return true;
}

/** Non fatal configuration advice, surfaced in the logs at startup. */
export function webConfigWarnings(config) {
  const warnings = [];
  if (!config.redirectUri) {
    warnings.push(
      'WEB_REDIRECT_URI is not set; the OAuth redirect URI is derived from the request host. Register that URI in the Discord developer portal.',
    );
  }
  if (!process.env.SESSION_SECRET && config.FLAG_SECRET) {
    warnings.push('SESSION_SECRET is not set; session cookies are signed with FLAG_SECRET. Set a dedicated SESSION_SECRET.');
  }
  if (config.cookieDomain) {
    warnings.push(`WEB_COOKIE_DOMAIN is set to ${config.cookieDomain}; the session cookie is shared with every host in that domain.`);
  }
  if (config.cookieSecure === false) {
    warnings.push('WEB_COOKIE_SECURE=false; session cookies are sent without the Secure attribute.');
  }
  if (config.trustProxy && config.cookieSecure === 'auto') {
    warnings.push(
      'WEB_TRUST_PROXY is enabled; X-Forwarded-Proto is honoured from loopback clients only (ngrok/nginx on this host).',
    );
  }
  if (!config.discordInviteConfigured) {
    warnings.push(
      `DISCORD_INVITE_URL is not set and no GUILD_ID is configured; the landing page links to the placeholder invite ${DEFAULT_DISCORD_INVITE_URL}.`,
    );
  }
  return warnings;
}
