export class AntiSpamTracker {
  constructor({ windowMs = 10_000, maxMessages = 8, duplicateWindowMs = 20_000, maxDuplicates = 4, now = () => Date.now() } = {}) {
    this.windowMs = windowMs;
    this.maxMessages = maxMessages;
    this.duplicateWindowMs = duplicateWindowMs;
    this.maxDuplicates = maxDuplicates;
    this.now = now;
    this.users = new Map();
    this.lastWarning = new Map();
  }

  _entry(userId) {
    if (!this.users.has(userId)) {
      this.users.set(userId, { messages: [], content: new Map() });
    }
    return this.users.get(userId);
  }

  record(userId, content = '') {
    const now = this.now();
    const entry = this._entry(userId);
    entry.messages = entry.messages.filter((stamp) => now - stamp < this.windowMs);
    entry.messages.push(now);

    const normalized = String(content).trim().toLowerCase();
    let duplicateCount = 0;
    if (normalized) {
      const previous = entry.content.get(normalized) ?? [];
      const filtered = previous.filter((stamp) => now - stamp < this.duplicateWindowMs);
      filtered.push(now);
      entry.content.set(normalized, filtered);
      duplicateCount = filtered.length;
      if (entry.content.size > 25) {
        const oldest = entry.content.keys().next().value;
        entry.content.delete(oldest);
      }
    }

    this._cleanup(now);
    if (entry.messages.length > this.maxMessages) {
      return { violation: 'rate', count: entry.messages.length };
    }
    if (duplicateCount > this.maxDuplicates) {
      return { violation: 'duplicate', count: duplicateCount };
    }
    return { violation: null };
  }

  canWarn(userId) {
    const now = this.now();
    const last = this.lastWarning.get(userId);
    if (last !== undefined && now - last < 60_000) return false;
    this.lastWarning.set(userId, now);
    return true;
  }

  _cleanup(now) {
    for (const [userId, entry] of this.users) {
      entry.messages = entry.messages.filter((stamp) => now - stamp < this.windowMs);
      for (const [content, stamps] of entry.content) {
        const filtered = stamps.filter((stamp) => now - stamp < this.duplicateWindowMs);
        if (filtered.length === 0) entry.content.delete(content);
        else entry.content.set(content, filtered);
      }
      if (entry.messages.length === 0 && entry.content.size === 0) this.users.delete(userId);
    }
    for (const [userId, stamp] of this.lastWarning) {
      if (now - stamp > 5 * 60_000) this.lastWarning.delete(userId);
    }
  }
}
