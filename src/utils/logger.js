import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/config.js';

const SECRET_KEY = /(token|secret|password|flag|authorization|key)/i;

function redact(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = SECRET_KEY.test(key) ? '[REDACTED]' : redact(item);
    }
    return output;
  }
  return value;
}

export function createLogger({ dir = config.logDir, name = 'bot' } = {}) {
  let ready = false;
  let queue = Promise.resolve();

  async function ensureDir() {
    if (ready) return;
    await fs.mkdir(dir, { recursive: true });
    ready = true;
  }

  function filePath() {
    const day = new Date().toISOString().slice(0, 10);
    return path.join(dir, `${name}-${day}.log`);
  }

  function write(level, message, meta = {}) {
    const entry = {
      ts: new Date().toISOString(),
      level,
      message,
      ...redact(meta),
    };
    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
    queue = queue
      .then(async () => {
        await ensureDir();
        await fs.appendFile(filePath(), `${line}\n`, 'utf8');
      })
      .catch((error) => {
        console.error(JSON.stringify({ level: 'error', message: 'logger write failed', error: error.message }));
      });
    return queue;
  }

  return {
    debug: (message, meta) => write('debug', message, meta),
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
    flush: () => queue,
  };
}

export const logger = createLogger();
