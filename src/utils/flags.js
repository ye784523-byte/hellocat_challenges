import crypto from 'node:crypto';

export function normalizeFlag(flag) {
  return String(flag ?? '').trim().replace(/\s+/g, ' ');
}

export function hashFlag(flag, secret) {
  if (!secret) throw new Error('Flag secret is not configured');
  return crypto.createHmac('sha256', secret).update(normalizeFlag(flag)).digest('hex');
}

export function verifyFlag(flag, expectedHash, secret) {
  if (!flag || !expectedHash || !secret) return false;
  const actual = Buffer.from(hashFlag(flag, secret), 'hex');
  const expected = Buffer.from(String(expectedHash), 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function looksLikeFlag(flag) {
  const value = normalizeFlag(flag);
  return /^[A-Za-z0-9_]{2,64}\{[^}]{1,200}\}$/.test(value) || /^[A-Za-z0-9_]{3,200}$/.test(value);
}
