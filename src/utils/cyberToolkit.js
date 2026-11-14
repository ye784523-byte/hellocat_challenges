import crypto from 'node:crypto';

export class ToolError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ToolError';
  }
}

function fail(message) {
  throw new ToolError(message);
}

export const ENCODING_SCHEMES = Object.freeze([
  'base64',
  'base64url',
  'hex',
  'binary',
  'url',
  'rot13',
  'caesar',
  'atbash',
  'morse',
  'reverse',
]);

export const HASH_ALGORITHMS = Object.freeze(['md5', 'sha1', 'sha256', 'sha512']);

const MORSE = Object.freeze({
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
  0: '-----',
  1: '.----',
  2: '..---',
  3: '...--',
  4: '....-',
  5: '.....',
  6: '-....',
  7: '--...',
  8: '---..',
  9: '----.',
  '.': '.-.-.-',
  ',': '--..--',
  '?': '..--..',
  "'": '.----.',
  '!': '-.-.--',
  '/': '-..-.',
  '(': '-.--.',
  ')': '-.--.-',
  '&': '.-...',
  ':': '---...',
  ';': '-.-.-.',
  '=': '-...-',
  '+': '.-.-.',
  '-': '-....-',
  _: '..--.-',
  '"': '.-..-.',
  $: '...-..-',
  '@': '.--.-.',
});

const MORSE_REVERSE = Object.freeze(
  Object.fromEntries(Object.entries(MORSE).map(([char, code]) => [code, char])),
);

export function isPrintable(value) {
  return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/.test(String(value ?? ''));
}

function normalizeBase64(value) {
  return String(value ?? '').replace(/\s+/g, '');
}

export function base64Encode(text) {
  return Buffer.from(String(text ?? ''), 'utf8').toString('base64');
}

export function base64Decode(text) {
  const value = normalizeBase64(text);
  if (!value) fail('Base64 input is empty.');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) fail('Input is not valid Base64.');
  const output = Buffer.from(value, 'base64').toString('utf8');
  if (!output || !isPrintable(output)) fail('Decoded bytes are not printable UTF-8 text.');
  return output;
}

export function base64UrlEncode(text) {
  return Buffer.from(String(text ?? ''), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function base64UrlDecode(text) {
  const value = normalizeBase64(text).replace(/-/g, '+').replace(/_/g, '/');
  if (!value) fail('Base64url input is empty.');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) fail('Input is not valid Base64url.');
  const output = Buffer.from(value, 'base64').toString('utf8');
  if (!output || !isPrintable(output)) fail('Decoded bytes are not printable UTF-8 text.');
  return output;
}

export function hexEncode(text) {
  return Buffer.from(String(text ?? ''), 'utf8').toString('hex');
}

export function hexDecode(text) {
  const value = String(text ?? '')
    .replace(/\\x/gi, '')
    .replace(/0x/gi, '')
    .replace(/[\s,:-]+/g, '');
  if (!value) fail('Hex input is empty.');
  if (!/^[0-9a-f]+$/i.test(value)) fail('Input contains non-hexadecimal characters.');
  if (value.length % 2 !== 0) fail('Hex input must contain an even number of digits.');
  const output = Buffer.from(value, 'hex').toString('utf8');
  if (!output || !isPrintable(output)) fail('Decoded bytes are not printable UTF-8 text.');
  return output;
}

export function binaryEncode(text) {
  return [...Buffer.from(String(text ?? ''), 'utf8')]
    .map((byte) => byte.toString(2).padStart(8, '0'))
    .join(' ');
}

export function binaryDecode(text) {
  const value = String(text ?? '').trim();
  if (!value) fail('Binary input is empty.');
  const groups = value.split(/[\s,]+/).filter(Boolean);
  if (!groups.every((group) => /^[01]{8}$/.test(group))) {
    fail('Binary input must be groups of eight 0/1 digits.');
  }
  const output = Buffer.from(groups.map((group) => Number.parseInt(group, 2))).toString('utf8');
  if (!output || !isPrintable(output)) fail('Decoded bytes are not printable UTF-8 text.');
  return output;
}

export function urlEncode(text) {
  return encodeURIComponent(String(text ?? ''));
}

export function urlDecode(text) {
  try {
    return decodeURIComponent(String(text ?? '').replace(/\+/g, ' '));
  } catch {
    fail('Input contains invalid percent-encoding.');
  }
}

function shiftLetter(char, shift) {
  const code = char.charCodeAt(0);
  const base = char >= 'a' && char <= 'z' ? 97 : char >= 'A' && char <= 'Z' ? 65 : null;
  if (base === null) return char;
  return String.fromCharCode(((code - base + shift + 26) % 26) + base);
}

export function caesarEncode(text, shift) {
  const amount = Number(shift);
  if (!Number.isInteger(amount)) fail('Caesar shift must be an integer.');
  return [...String(text ?? '')].map((char) => shiftLetter(char, amount)).join('');
}

export function caesarDecode(text, shift) {
  const amount = Number(shift);
  if (!Number.isInteger(amount)) fail('Caesar shift must be an integer.');
  return caesarEncode(text, -amount);
}

export function caesarBruteforce(text) {
  return Array.from({ length: 26 }, (_, shift) => ({
    shift,
    text: caesarEncode(text, -shift),
  }));
}

export function rot13(text) {
  return caesarEncode(text, 13);
}

export function atbash(text) {
  return [...String(text ?? '')]
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code >= 97 && code <= 122) return String.fromCharCode(97 + (25 - (code - 97)));
      if (code >= 65 && code <= 90) return String.fromCharCode(65 + (25 - (code - 65)));
      return char;
    })
    .join('');
}

export function reverseText(text) {
  return [...String(text ?? '')].reverse().join('');
}

export function morseEncode(text) {
  const words = String(text ?? '').trim().toUpperCase().split(/\s+/);
  const encoded = words.map((word) =>
    [...word]
      .map((char) => {
        const code = MORSE[char];
        if (!code) fail(`Character "${char}" has no Morse representation.`);
        return code;
      })
      .join(' '),
  );
  return encoded.join(' / ');
}

export function morseDecode(text) {
  const words = String(text ?? '').trim().split(/\s*\/\s*|\s{2,}/);
  const decoded = words.map((word) =>
    word
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => {
        const char = MORSE_REVERSE[token];
        if (!char) fail(`Unknown Morse token "${token}".`);
        return char;
      })
      .join(''),
  );
  return decoded.join(' ').trim();
}

export function encodeWith(scheme, text, { shift = 3 } = {}) {
  switch (scheme) {
    case 'base64':
      return base64Encode(text);
    case 'base64url':
      return base64UrlEncode(text);
    case 'hex':
      return hexEncode(text);
    case 'binary':
      return binaryEncode(text);
    case 'url':
      return urlEncode(text);
    case 'rot13':
      return rot13(text);
    case 'caesar':
      return caesarEncode(text, shift);
    case 'atbash':
      return atbash(text);
    case 'morse':
      return morseEncode(text);
    case 'reverse':
      return reverseText(text);
    default:
      return fail(`Unsupported encoding scheme "${scheme}".`);
  }
}

export function decodeWith(scheme, text, { shift = 3 } = {}) {
  switch (scheme) {
    case 'base64':
      return base64Decode(text);
    case 'base64url':
      return base64UrlDecode(text);
    case 'hex':
      return hexDecode(text);
    case 'binary':
      return binaryDecode(text);
    case 'url':
      return urlDecode(text);
    case 'rot13':
      return rot13(text);
    case 'caesar':
      return caesarDecode(text, shift);
    case 'atbash':
      return atbash(text);
    case 'morse':
      return morseDecode(text);
    case 'reverse':
      return reverseText(text);
    default:
      return fail(`Unsupported decoding scheme "${scheme}".`);
  }
}

export function hashText(text, algorithm) {
  if (!HASH_ALGORITHMS.includes(algorithm)) fail(`Unsupported hash algorithm "${algorithm}".`);
  return crypto.createHash(algorithm).update(String(text ?? ''), 'utf8').digest('hex');
}

const HASH_SIGNATURES = Object.freeze([
  { regex: /^\$2[aby]?\$\d{2}\$/, label: 'bcrypt' },
  { regex: /^\$argon2[id]{1,2}\$/, label: 'argon2' },
  { regex: /^\$6\$/, label: 'sha512-crypt' },
  { regex: /^\$5\$/, label: 'sha256-crypt' },
  { regex: /^\$1\$/, label: 'md5-crypt' },
]);

export function identifyHash(value) {
  const text = String(value ?? '').trim();
  for (const signature of HASH_SIGNATURES) {
    if (signature.regex.test(text)) return signature.label;
  }
  if (!/^[a-f0-9]+$/i.test(text)) return null;
  switch (text.length) {
    case 32:
      return 'md5 (or ntlm)';
    case 40:
      return 'sha1';
    case 64:
      return 'sha256';
    case 96:
      return 'sha384';
    case 128:
      return 'sha512';
    default:
      return null;
  }
}

function keyBytes(key) {
  const buffer = Buffer.from(String(key ?? ''), 'utf8');
  if (buffer.length === 0) fail('XOR key is empty.');
  return buffer;
}

export function xorBuffer(data, key) {
  const keyBuffer = keyBytes(key);
  const output = Buffer.alloc(data.length);
  for (let index = 0; index < data.length; index += 1) {
    output[index] = data[index] ^ keyBuffer[index % keyBuffer.length];
  }
  return output;
}

export function xorText(text, key, { inputFormat = 'text' } = {}) {
  const input = String(text ?? '');
  if (!input) fail('XOR input is empty.');
  let data;
  if (inputFormat === 'hex') {
    const cleaned = input.replace(/\\x/gi, '').replace(/0x/gi, '').replace(/[\s,:-]+/g, '');
    if (!/^[0-9a-f]+$/i.test(cleaned) || cleaned.length % 2 !== 0) {
      fail('Hex input must contain an even number of hexadecimal digits.');
    }
    data = Buffer.from(cleaned, 'hex');
  } else {
    data = Buffer.from(input, 'utf8');
  }
  const output = xorBuffer(data, key);
  const preview = output.toString('utf8');
  return {
    hex: output.toString('hex'),
    utf8: isPrintable(preview) ? preview : null,
  };
}

function keyLetters(key) {
  return String(key ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

export function vigenere(text, key, { mode = 'decode' } = {}) {
  const letters = keyLetters(key);
  if (!letters) fail('Vigenere key must contain at least one letter.');
  const input = String(text ?? '');
  let keyIndex = 0;
  return [...input]
    .map((char) => {
      const code = char.charCodeAt(0);
      const isLower = code >= 97 && code <= 122;
      const isUpper = code >= 65 && code <= 90;
      if (!isLower && !isUpper) return char;
      const base = isLower ? 97 : 65;
      const shift = letters.charCodeAt(keyIndex % letters.length) - 65;
      keyIndex += 1;
      const delta = mode === 'encode' ? shift : -shift;
      return String.fromCharCode((((code - base + delta) % 26) + 26) % 26 + base);
    })
    .join('');
}

function decodeBase64Json(segment, label) {
  const value = String(segment ?? '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  let text;
  try {
    text = Buffer.from(padded, 'base64').toString('utf8');
  } catch {
    fail(`JWT ${label} segment is not valid Base64url.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    fail(`JWT ${label} segment does not contain valid JSON.`);
  }
}

export function decodeJwt(token) {
  const parts = String(token ?? '').trim().split('.');
  if (parts.length < 2) fail('A JWT needs at least a header and a payload segment.');
  const header = decodeBase64Json(parts[0], 'header');
  const payload = decodeBase64Json(parts[1], 'payload');
  return {
    header,
    payload,
    signature: parts[2] ?? '',
    signed: parts.length === 3 && parts[2].length > 0,
    algorithm: header.alg ?? null,
  };
}

function unique(values) {
  return [...new Set(values)];
}

function tryBase64Candidate(token) {
  if (token.length < 8 || token.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(token)) {
    return null;
  }
  try {
    return base64Decode(token);
  } catch {
    return null;
  }
}

function tryHexCandidate(token) {
  if (token.length < 8 || token.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(token)) return null;
  try {
    return hexDecode(token);
  } catch {
    return null;
  }
}

export function analyzeText(text) {
  const value = String(text ?? '');
  const flags = unique(value.match(/[A-Za-z0-9_]{2,64}\{[^}]{1,200}\}/g) ?? []);
  const ips = unique(
    value.match(/\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g) ?? [],
  );
  const macs = unique(value.match(/\b[0-9a-f]{2}(?::[0-9a-f]{2}){5}\b/gi) ?? []);
  const urls = unique(value.match(/\bhttps?:\/\/[^\s<>"']+/gi) ?? []);
  const emails = unique(value.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}\b/g) ?? []);
  const domains = unique(
    (value.match(/\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}\b/gi) ?? [])
      .filter((domain) => !domain.includes('@'))
      .filter((domain) => !ips.includes(domain)),
  );
  const hashes = unique(
    (value.match(/\b[a-f0-9]{32}\b|\b[a-f0-9]{40}\b|\b[a-f0-9]{64}\b|\b[a-f0-9]{96}\b|\b[a-f0-9]{128}\b/gi) ??
      []).filter((candidate) => identifyHash(candidate)),
  );

  const encodings = [];
  const seen = new Set();
  const tokens = unique(value.split(/[\s,;'"<>()[\]{}]+/).filter((token) => token.length >= 4));
  for (const token of tokens) {
    if (seen.has(token)) continue;
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(token)) {
      seen.add(token);
      encodings.push({ scheme: 'jwt', preview: token, decoded: 'JWT token (use /tools jwt)' });
      continue;
    }
    if (/%[0-9a-f]{2}/i.test(token)) {
      const decoded = urlDecode(token);
      if (decoded !== token) {
        seen.add(token);
        encodings.push({ scheme: 'url', preview: token, decoded });
        continue;
      }
    }
    if (/^[.-]+(?:\s+[.-]+)*(?:\s*\/\s*[.-]+(?:\s+[.-]+)*)*$/.test(token) && /[.-]{2,}/.test(token)) {
      try {
        const decoded = morseDecode(token);
        if (decoded) {
          seen.add(token);
          encodings.push({ scheme: 'morse', preview: token, decoded });
          continue;
        }
      } catch {
        /* not morse */
      }
    }
    if (/^[01]{8}(?:\s*[01]{8})+$/.test(token)) {
      try {
        const decoded = binaryDecode(token);
        seen.add(token);
        encodings.push({ scheme: 'binary', preview: token, decoded });
        continue;
      } catch {
        /* not binary */
      }
    }
    const fromBase64 = tryBase64Candidate(token);
    if (fromBase64 && /[A-Za-z0-9]/.test(fromBase64)) {
      seen.add(token);
      encodings.push({ scheme: 'base64', preview: token, decoded: fromBase64 });
      continue;
    }
    const fromHex = tryHexCandidate(token);
    if (fromHex && /[A-Za-z0-9]/.test(fromHex)) {
      seen.add(token);
      encodings.push({ scheme: 'hex', preview: token, decoded: fromHex });
    }
  }

  return { flags, ips, macs, urls, emails, domains, hashes, encodings };
}
