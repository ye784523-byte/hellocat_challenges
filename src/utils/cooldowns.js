export class CooldownManager {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.entries = new Map();
  }

  remaining(key, durationSeconds) {
    const entry = this.entries.get(key);
    if (!entry) return 0;
    const remaining = entry - this.now();
    if (remaining <= 0) {
      this.entries.delete(key);
      return 0;
    }
    return remaining;
  }

  check(key, durationSeconds) {
    return this.remaining(key, durationSeconds) === 0;
  }

  consume(key, durationSeconds) {
    this.entries.set(key, this.now() + durationSeconds * 1000);
  }

  async guard(key, durationSeconds) {
    const remaining = this.remaining(key, durationSeconds);
    if (remaining > 0) return remaining;
    this.consume(key, durationSeconds);
    return 0;
  }

  clear(key) {
    this.entries.delete(key);
  }

  sweep() {
    const now = this.now();
    for (const [key, expires] of this.entries) {
      if (expires <= now) this.entries.delete(key);
    }
  }

  get size() {
    return this.entries.size;
  }
}

export const commandCooldowns = new CooldownManager();
