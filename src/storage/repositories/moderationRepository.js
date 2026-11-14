export function emptyModeration() {
  return { cases: [] };
}

export function validateModeration(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.cases)) {
    return 'expected { cases: array }';
  }
  for (const entry of data.cases) {
    if (!entry.id || !entry.type) return 'invalid moderation case';
  }
  return true;
}

export class ModerationRepository {
  constructor(store) {
    this.store = store;
  }

  async add(entry) {
    let created;
    await this.store.update((current) => {
      const sequence = current.cases.length + 1;
      created = {
        id: `CASE-${String(sequence).padStart(4, '0')}`,
        createdAt: new Date().toISOString(),
        ...entry,
      };
      current.cases.push(created);
      return current;
    });
    return created;
  }

  async all() {
    const data = await this.store.read();
    return data.cases;
  }

  async forUser(userId) {
    const data = await this.store.read();
    return data.cases.filter((entry) => entry.targetId === userId);
  }

  async count() {
    const data = await this.store.read();
    return data.cases.length;
  }
}
