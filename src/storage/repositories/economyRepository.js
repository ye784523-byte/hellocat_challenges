export function emptyEconomy() {
  return { accounts: {} };
}

export function validateEconomy(data) {
  if (!data || typeof data !== 'object' || typeof data.accounts !== 'object' || data.accounts === null) {
    return 'expected { accounts: object }';
  }
  for (const [id, account] of Object.entries(data.accounts)) {
    if (!Number.isFinite(account.coins) || account.coins < 0) return `invalid coins for ${id}`;
  }
  return true;
}

export class EconomyRepository {
  constructor(store) {
    this.store = store;
  }

  _blank(id) {
    return {
      id,
      coins: 0,
      inventory: [],
      transactions: [],
      processedRefs: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async get(userId) {
    const data = await this.store.read();
    return data.accounts[userId] ?? null;
  }

  async ensure(userId) {
    let account;
    await this.store.update((current) => {
      if (!current.accounts[userId]) current.accounts[userId] = this._blank(userId);
      account = current.accounts[userId];
      return current;
    });
    return account;
  }

  async update(userId, mutator) {
    let updated;
    await this.store.update((current) => {
      if (!current.accounts[userId]) current.accounts[userId] = this._blank(userId);
      const result = mutator(current.accounts[userId]) ?? current.accounts[userId];
      result.updatedAt = new Date().toISOString();
      current.accounts[userId] = result;
      updated = result;
      return current;
    });
    return updated;
  }

  async all() {
    const data = await this.store.read();
    return Object.values(data.accounts);
  }

  async delete(userId) {
    let removed = false;
    await this.store.update((current) => {
      if (current.accounts[userId]) {
        delete current.accounts[userId];
        removed = true;
      }
      return current;
    });
    return removed;
  }
}
