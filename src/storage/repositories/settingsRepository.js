import { DEFAULT_SETTINGS } from '../../constants/index.js';

export function defaultSettings() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

export function validateSettings(data) {
  if (!data || typeof data !== 'object') return 'expected settings object';
  if (!data.guild || typeof data.guild !== 'object') return 'missing guild settings';
  if (!data.daily || typeof data.daily !== 'object') return 'missing daily settings';
  if (typeof data.daily.completions !== 'object' || data.daily.completions === null) {
    return 'daily.completions must be an object';
  }
  if (data.announcements !== undefined && (typeof data.announcements !== 'object' || data.announcements === null)) {
    return 'announcements must be an object';
  }
  return true;
}

export class SettingsRepository {
  constructor(store) {
    this.store = store;
  }

  async get() {
    return this.store.read();
  }

  async update(mutator) {
    return this.store.update(mutator);
  }

  async setGuild(key, value) {
    return this.store.update((current) => {
      current.guild[key] = value;
      current.meta.updatedAt = new Date().toISOString();
      return current;
    });
  }
}
