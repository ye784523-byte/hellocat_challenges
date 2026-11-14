import { CATEGORIES, DIFFICULTIES } from '../../constants/index.js';

export function emptyChallenges() {
  return { challenges: {} };
}

export function validateChallenges(data) {
  if (!data || typeof data !== 'object' || typeof data.challenges !== 'object' || data.challenges === null) {
    return 'expected { challenges: object }';
  }
  for (const [id, challenge] of Object.entries(data.challenges)) {
    if (!id) return 'missing challenge id';
    if (!challenge.title || typeof challenge.title !== 'string') return `challenge ${id} missing title`;
    if (!CATEGORIES.includes(challenge.category)) return `challenge ${id} invalid category`;
    if (!DIFFICULTIES.includes(challenge.difficulty)) return `challenge ${id} invalid difficulty`;
    if (!Number.isFinite(challenge.xp) || challenge.xp <= 0) return `challenge ${id} invalid xp`;
    if (!challenge.flagHash) return `challenge ${id} missing flag hash`;
    if (challenge.prerequisites !== undefined) {
      if (!Array.isArray(challenge.prerequisites)) return `challenge ${id} invalid prerequisites`;
      if (challenge.prerequisites.some((entry) => typeof entry !== 'string' || !entry.trim())) {
        return `challenge ${id} invalid prerequisites`;
      }
      if (challenge.prerequisites.includes(id)) return `challenge ${id} requires itself`;
    }
  }
  return true;
}

export class ChallengeRepository {
  constructor(store) {
    this.store = store;
  }

  async get(id) {
    const data = await this.store.read();
    return data.challenges[id] ?? null;
  }

  async all() {
    const data = await this.store.read();
    return Object.values(data.challenges);
  }

  async create(challenge) {
    let created;
    await this.store.update((current) => {
      if (current.challenges[challenge.id]) throw new Error(`Challenge ${challenge.id} already exists`);
      current.challenges[challenge.id] = challenge;
      created = challenge;
      return current;
    });
    return created;
  }

  async update(id, mutator) {
    let updated;
    await this.store.update((current) => {
      const existing = current.challenges[id];
      if (!existing) throw new Error(`Challenge ${id} not found`);
      const next = mutator(existing) ?? existing;
      current.challenges[id] = next;
      updated = next;
      return current;
    });
    return updated;
  }

  async delete(id) {
    let removed = false;
    await this.store.update((current) => {
      if (current.challenges[id]) {
        delete current.challenges[id];
        removed = true;
      }
      return current;
    });
    return removed;
  }

  async count() {
    const data = await this.store.read();
    return Object.keys(data.challenges).length;
  }
}
