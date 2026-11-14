import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { logger as defaultLogger } from '../utils/logger.js';
import { withFileLock } from '../utils/fileLock.js';

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function defaultValue(factory) {
  return typeof factory === 'function' ? factory() : clone(factory);
}

export class JsonStore {
  constructor({ dir, file, defaults, validate, logger = defaultLogger }) {
    if (!dir || !file) throw new Error('JsonStore requires dir and file');
    this.dir = dir;
    this.file = path.join(dir, file);
    this.backupFile = `${this.file}.bak`;
    this.defaults = defaults;
    this.validate = validate ?? (() => true);
    this.logger = logger;
    this.queue = Promise.resolve();
    this.name = file;
  }

  _enqueue(task) {
    const result = this.queue.then(task, task);
    this.queue = result.catch(() => {});
    return result;
  }

  async _ensureDir() {
    await fs.mkdir(this.dir, { recursive: true });
  }

  _check(data) {
    const outcome = this.validate(data);
    if (outcome !== true) {
      throw new Error(`Data validation failed for ${this.name}: ${outcome || 'invalid shape'}`);
    }
    return data;
  }

  async _readFile(filePath) {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  }

  async _quarantine(reason) {
    await this._ensureDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = `${this.file}.corrupt-${stamp}`;
    try {
      await fs.rename(this.file, target);
      this.logger.error('Corrupted data quarantined', { store: this.name, target, reason });
      return target;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async _recover() {
    try {
      const backup = await this._readFile(this.backupFile);
      this._check(backup);
      await this._writeRaw(backup, { skipBackup: true });
      this.logger.warn('Recovered data from backup file', { store: this.name, backup: this.backupFile });
      return backup;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.logger.error('Backup recovery failed; preserving backup for inspection', {
          store: this.name,
          error: error.message,
        });
      }
      return null;
    }
  }

  async _load() {
    await this._ensureDir();
    try {
      const data = await this._readFile(this.file);
      this._check(data);
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') {
        const fresh = defaultValue(this.defaults);
        this._check(fresh);
        await this._writeRaw(fresh, { skipBackup: true });
        return fresh;
      }
      const reason = error instanceof SyntaxError ? 'malformed JSON' : error.message;
      await this._quarantine(reason);
      const recovered = await this._recover();
      if (recovered) return recovered;
      const fresh = defaultValue(this.defaults);
      this._check(fresh);
      await this._writeRaw(fresh, { skipBackup: true });
      this.logger.warn('Initialized fresh data store after corruption', { store: this.name });
      return fresh;
    }
  }

  async _writeRaw(data, { skipBackup = false } = {}) {
    this._check(data);
    await this._ensureDir();
    const temp = `${this.file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    const payload = `${JSON.stringify(data, null, 2)}\n`;
    let handle;
    try {
      handle = await fs.open(temp, 'w', 0o600);
      await handle.writeFile(payload, 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
      if (!skipBackup) {
        try {
          await fs.copyFile(this.file, this.backupFile);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      await fs.rename(temp, this.file);
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      await fs.unlink(temp).catch(() => {});
      throw error;
    }
  }

  async read() {
    return this._enqueue(async () => clone(await this._load()));
  }

  async write(data) {
    return this._enqueue(async () => {
      const copy = clone(data);
      await withFileLock(this.file, () => this._writeRaw(copy));
      return clone(copy);
    });
  }

  async update(mutator) {
    return this._enqueue(async () => {
      // The lock is held across the read-modify-write cycle so that a second
      // process (for example the web terminal) cannot lose an update.
      const next = await withFileLock(this.file, async () => {
        const current = clone(await this._load());
        const updated = (await mutator(current)) ?? current;
        this._check(updated);
        await this._writeRaw(updated);
        return updated;
      });
      return clone(next);
    });
  }

  async backupTo(directory) {
    return this._enqueue(async () => {
      await fs.mkdir(directory, { recursive: true });
      const target = path.join(directory, this.name);
      try {
        await fs.copyFile(this.file, target);
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
      return target;
    });
  }

  async flush() {
    await this.queue.catch(() => {});
  }
}
