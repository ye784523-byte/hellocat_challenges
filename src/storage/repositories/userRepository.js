export function emptyUsers() {
  return { users: {} };
}

export function validateUsers(data) {
  if (!data || typeof data !== 'object' || typeof data.users !== 'object' || data.users === null) {
    return 'expected { users: object }';
  }
  for (const [id, user] of Object.entries(data.users)) {
    if (!id || typeof id !== 'string') return 'invalid user id';
    if (!user || typeof user !== 'object') return `invalid user record ${id}`;
    if (!Number.isFinite(user.xp) || user.xp < 0) return `invalid xp for ${id}`;
  }
  return true;
}

export class UserRepository {
  constructor(store) {
    this.store = store;
  }

  _blank(id, username = 'Unknown Operator') {
    const now = new Date().toISOString();
    return {
      id,
      username,
      xp: 0,
      streak: { current: 0, longest: 0, lastDate: null, total: 0 },
      hints: {},
      awards: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  async get(userId) {
    const data = await this.store.read();
    return data.users[userId] ?? null;
  }

  async ensure(userId, username) {
    let created = null;
    const data = await this.store.update((current) => {
      if (!current.users[userId]) {
        current.users[userId] = this._blank(userId, username);
        created = current.users[userId];
      } else if (username && current.users[userId].username !== username) {
        current.users[userId].username = username;
        current.users[userId].updatedAt = new Date().toISOString();
      }
      return current;
    });
    return created ?? data.users[userId];
  }

  async update(userId, mutator, username) {
    let updated;
    await this.store.update((current) => {
      if (!current.users[userId]) current.users[userId] = this._blank(userId, username);
      const result = mutator(current.users[userId]) ?? current.users[userId];
      result.updatedAt = new Date().toISOString();
      current.users[userId] = result;
      updated = result;
      return current;
    });
    return updated;
  }

  async all() {
    const data = await this.store.read();
    return Object.values(data.users);
  }

  async count() {
    const data = await this.store.read();
    return Object.keys(data.users).length;
  }

  async delete(userId) {
    let removed = false;
    await this.store.update((current) => {
      if (current.users[userId]) {
        delete current.users[userId];
        removed = true;
      }
      return current;
    });
    return removed;
  }
}
