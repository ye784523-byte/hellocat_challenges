/**
 * Public addresses of the Hello Cat web properties.
 *
 * The site root is the landing page; the terminal application lives one path
 * deeper. Discord is the only supported platform, so the invite is the primary
 * call to action and the official site is the only address the project claims.
 */

const TERMINAL_PATH = '/terminal';
const DEFAULT_INVITE = 'https://discord.gg/hellocat';
const DEFAULT_SITE = 'https://helloc.at';

function trimSlash(value) {
  return String(value ?? '').trim().replace(/\/+$/, '');
}

/** The root of the public site (the landing page). */
export function siteUrl(config = {}) {
  return trimSlash(config.WEB_PUBLIC_URL || config.WEB_BASE_URL || '');
}

/** The web terminal application. */
export function terminalUrl(config = {}) {
  const base = siteUrl(config);
  return base ? `${base}${TERMINAL_PATH}` : '';
}

/** The invite to the Discord server. */
export function inviteUrl(config = {}) {
  const explicit = trimSlash(config.DISCORD_INVITE_URL);
  if (explicit) return explicit;
  const guildId = trimSlash(config.GUILD_ID || config.DISCORD_GUILD_ID);
  return guildId ? `https://discord.gg/${guildId}` : DEFAULT_INVITE;
}

/** The official website. */
export function officialSiteUrl(config = {}) {
  return trimSlash(config.OFFICIAL_SITE_URL) || DEFAULT_SITE;
}

export { TERMINAL_PATH, DEFAULT_INVITE, DEFAULT_SITE };
