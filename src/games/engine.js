import crypto from 'node:crypto';
import { ValidationError } from '../utils/errors.js';

export class GameEngine {
  constructor({ ttlMs = 10 * 60_000, maxSessionsPerUser = 3, now = () => Date.now() } = {}) {
    this.registry = new Map();
    this.sessions = new Map();
    this.ttlMs = ttlMs;
    this.maxSessionsPerUser = maxSessionsPerUser;
    this.now = now;
  }

  register(type, factory) {
    if (!type || typeof factory !== 'function') throw new Error('Invalid game registration');
    this.registry.set(type, factory);
  }

  list() {
    return [...this.registry.keys()];
  }

  start(type, userId, options = {}) {
    const factory = this.registry.get(type);
    if (!factory) throw new ValidationError(`Unknown game type: ${type}`);
    this._cleanup();
    const active = [...this.sessions.values()].filter(
      (session) => session.userId === userId && session.type === type,
    );
    for (const session of active.slice(0, Math.max(0, active.length - this.maxSessionsPerUser + 1))) {
      this.sessions.delete(session.id);
    }
    const id = crypto.randomBytes(8).toString('hex');
    const session = {
      id,
      type,
      userId,
      game: factory({ ...options, rng: options.rng ?? Math.random }),
      createdAt: this.now(),
      expiresAt: this.now() + this.ttlMs,
      finished: false,
    };
    this.sessions.set(id, session);
    return session;
  }

  get(sessionId, userId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new ValidationError('This game session has expired. Start a new one.');
    if (session.userId !== userId) throw new ValidationError('This game session belongs to another operator.');
    if (session.expiresAt < this.now()) {
      this.sessions.delete(sessionId);
      throw new ValidationError('This game session has expired. Start a new one.');
    }
    return session;
  }

  submit(sessionId, userId, input) {
    const session = this.get(sessionId, userId);
    if (session.finished) throw new ValidationError('This game session is already complete.');
    const result = session.game.submit(input);
    if (result.finished) session.finished = true;
    return { session, result };
  }

  view(sessionId, userId) {
    const session = this.get(sessionId, userId);
    return { session, view: session.game.view() };
  }

  end(sessionId, userId) {
    this.get(sessionId, userId);
    this.sessions.delete(sessionId);
  }

  _cleanup() {
    const now = this.now();
    for (const [id, session] of this.sessions) {
      if (session.expiresAt < now) this.sessions.delete(id);
    }
  }

  get size() {
    return this.sessions.size;
  }
}
