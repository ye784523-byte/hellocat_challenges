export function emptyAchievements() {
  return { unlocked: {} };
}

export function validateAchievements(data) {
  if (!data || typeof data !== 'object' || typeof data.unlocked !== 'object' || data.unlocked === null) {
    return 'expected { unlocked: object }';
  }
  return true;
}

export class AchievementRepository {
  constructor(store) {
    this.store = store;
  }

  async unlock(userId, achievementId, meta = {}) {
    let fresh = false;
    await this.store.update((current) => {
      current.unlocked[userId] ??= {};
      if (!current.unlocked[userId][achievementId]) {
        current.unlocked[userId][achievementId] = {
          at: new Date().toISOString(),
          ...meta,
        };
        fresh = true;
      }
      return current;
    });
    return fresh;
  }

  async listFor(userId) {
    const data = await this.store.read();
    return data.unlocked[userId] ?? {};
  }

  async countFor(userId) {
    const data = await this.store.read();
    return Object.keys(data.unlocked[userId] ?? {}).length;
  }

  async allFor() {
    const data = await this.store.read();
    return data.unlocked;
  }

  async deleteUser(userId) {
    let removed = false;
    await this.store.update((current) => {
      if (current.unlocked[userId]) {
        delete current.unlocked[userId];
        removed = true;
      }
      return current;
    });
    return removed;
  }
}
