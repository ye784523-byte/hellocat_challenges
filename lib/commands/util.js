/** Shared helpers for the simulated command suite. */

export function parseFlags(argv, { withValue = [], aliases = {}, boolean = [] } = {}) {
  const flags = {};
  const operands = [];
  const rest = [];
  const numeric = [];

  const isValueFlag = (name) => withValue.includes(name) || Object.prototype.hasOwnProperty.call(aliases, name);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') {
      rest.push(...argv.slice(index + 1));
      break;
    }

    // Numeric shorthand such as `head -3` is treated as a count.
    if (/^-\d+$/.test(arg)) {
      numeric.push(Number(arg.slice(1)));
      continue;
    }

    if (arg.startsWith('--')) {
      const body = arg.slice(2);
      const [rawName, inlineValue] = body.includes('=') ? body.split(/=(.*)/s) : [body, undefined];
      const name = aliases[rawName] ?? rawName;
      if (inlineValue !== undefined) {
        flags[name] = inlineValue;
        continue;
      }
      if (isValueFlag(name)) {
        const next = argv[index + 1];
        if (next === undefined || next.startsWith('-')) {
          flags[name] = true;
        } else {
          flags[name] = next;
          index += 1;
        }
        continue;
      }
      flags[name] = true;
      continue;
    }

    if (arg.startsWith('-') && arg.length > 1) {
      const body = arg.slice(1);
      let consumed = false;
      for (let position = 0; position < body.length; position += 1) {
        const letter = body[position];
        const name = aliases[letter] ?? letter;
        if (isValueFlag(name)) {
          const inline = body.slice(position + 1);
          if (inline) {
            flags[name] = inline;
            consumed = true;
            break;
          }
          const next = argv[index + 1];
          if (next === undefined || (next.startsWith('-') && next.length > 1)) {
            flags[name] = true;
          } else {
            flags[name] = next;
            index += 1;
          }
          consumed = true;
          break;
        }
        flags[name] = true;
      }
      if (consumed) continue;
      continue;
    }

    operands.push(arg);
  }

  return { flags, operands, rest, numeric };
}

export function formatSize(bytes) {
  const units = ['B', 'K', 'M', 'G', 'T'];
  let value = Number(bytes) || 0;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  if (unit === 0) return `${value}`;
  return `${value.toFixed(1)}${units[unit]}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatTimestamp(ms) {
  const date = new Date(ms);
  const month = MONTHS[date.getUTCMonth()];
  const day = String(date.getUTCDate()).padStart(2, ' ');
  const time = [date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
  return `${month} ${day} ${time}`;
}

export function formatLongTimestamp(ms) {
  const date = new Date(ms);
  return `${formatTimestamp(ms)} ${date.getUTCFullYear()}`;
}

export function printTable(rows, { separator = '  ' } = {}) {
  if (rows.length === 0) return '';
  const widths = [];
  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, String(cell).length);
    });
  }
  return rows
    .map((row) => row.map((cell, index) => String(cell).padEnd(widths[index])).join(separator).trimEnd())
    .join('\n');
}

export function out(context, text = '') {
  if (text === '') return;
  context.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
}

export function err(context, text = '') {
  if (text === '') return;
  context.stderr.write(text.endsWith('\n') ? text : `${text}\n`);
}

export function splitLines(text) {
  const normalised = String(text ?? '').replace(/\r\n/g, '\n');
  const lines = normalised.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function die(context, message, code = 1) {
  err(context, message);
  return code;
}

/** Turn a candidate string into a RegExp, honouring grep's -F/-E switches. */
export function toRegex(pattern, { fixed = false, extended = false, ignoreCase = false } = {}) {
  if (fixed) return new RegExp(escapeRegExp(pattern), ignoreCase ? 'i' : '');
  const source = extended ? pattern : pattern;
  return new RegExp(source, ignoreCase ? 'i' : '');
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function hexDump(buffer, { width = 16, offset = 0 } = {}) {
  const rows = [];
  for (let index = 0; index < buffer.length; index += width) {
    const slice = buffer.subarray(index, index + width);
    const hex = [];
    let text = '';
    for (const byte of slice) {
      hex.push(byte.toString(16).padStart(2, '0'));
      text += byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.';
    }
    rows.push(`${(offset + index).toString(16).padStart(8, '0')}  ${hex.join(' ').padEnd(width * 3 - 1, ' ')}  |${text}|`);
  }
  return rows.join('\n');
}
