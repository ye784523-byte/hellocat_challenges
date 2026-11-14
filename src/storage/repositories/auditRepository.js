export function emptyAudit() {
  return { entries: [] };
}

export function validateAudit(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.entries)) {
    return 'expected { entries: array }';
  }
  return true;
}

const MAX_AUDIT_ENTRIES = 5000;

export class AuditRepository {
  constructor(store) {
    this.store = store;
  }

  async append(entry) {
    let created;
    await this.store.update((current) => {
      created = {
        id: `AUD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        ...entry,
      };
      current.entries.push(created);
      if (current.entries.length > MAX_AUDIT_ENTRIES) {
        current.entries = current.entries.slice(-MAX_AUDIT_ENTRIES);
      }
      return current;
    });
    return created;
  }

  async recent(limit = 20) {
    const data = await this.store.read();
    return data.entries.slice(-limit).reverse();
  }

  async all() {
    const data = await this.store.read();
    return data.entries;
  }

  async count() {
    const data = await this.store.read();
    return data.entries.length;
  }
}
