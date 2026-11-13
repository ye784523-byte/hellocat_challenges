/**
 * Proxy aware request helpers.
 *
 * A reverse proxy (nginx) or a tunnel (ngrok) terminates TLS in front of the
 * web terminal, so the process only ever sees plain HTTP. The forwarded
 * protocol header is only believed when the peer is a loopback address, which
 * keeps a remote client from spoofing the scheme and therefore from forcing
 * the Secure attribute on or off.
 */

export function isLoopbackAddress(address) {
  if (!address) return false;
  const normalized = String(address).replace(/^::ffff:/, '');
  return normalized === '127.0.0.1' || normalized === '::1' || normalized.startsWith('127.');
}

export function isTrustedProxyRequest(request, { trustProxy = true } = {}) {
  if (!trustProxy) return false;
  return isLoopbackAddress(request?.socket?.remoteAddress);
}

/** The effective scheme of the request, as seen by the browser. */
export function resolveRequestScheme(request, { trustProxy = true } = {}) {
  if (isTrustedProxyRequest(request, { trustProxy })) {
    const header = request.headers?.['x-forwarded-proto'];
    const raw = Array.isArray(header) ? header[0] : header;
    const value = String(raw ?? '').split(',')[0].trim().toLowerCase();
    if (value === 'https' || value === 'wss') return 'https';
    if (value === 'http' || value === 'ws') return 'http';
  }
  return request?.socket?.encrypted ? 'https' : 'http';
}

/**
 * Cookie security is a tri-state:
 *   'auto' - follow the effective request scheme
 *   true   - always Secure
 *   false  - never Secure
 */
export function resolveCookieSecure(request, { trustProxy = true, cookieSecure = 'auto' } = {}) {
  if (cookieSecure === true) return true;
  if (cookieSecure === false) return false;
  return resolveRequestScheme(request, { trustProxy }) === 'https';
}
