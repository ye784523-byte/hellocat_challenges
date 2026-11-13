/**
 * Terminal session management.
 *
 * A session owns the simulated shell, the currently loaded challenge and the
 * bridge to the shared challenge store, so that a flag solved in the browser
 * updates exactly the same progress the Discord bot tracks.
 */

import crypto from 'node:crypto';
import { createLabShell, DEFAULT_LAB } from './labs.js';

const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export class TerminalSession {
  constructor({ id, userId, username, challengeService, labs, services, logger }) {
    this.id = id;
    this.userId = userId;
    this.username = username;
    this.challengeService = challengeService;
    this.labs = labs;
    this.services = services;
    this.logger = logger;

    this.challengeId = null;
    this.lab = null;
    this.shell = null;
    this.fs = null;
    this.lastActivity = Date.now();
    this.commandCount = 0;

    this.loadLab(DEFAULT_LAB);
  }

  loadLab(lab) {
    this.lab = lab;
    const { shell, fs } = createLabShell({ lab, session: this });
    this.shell = shell;
    this.fs = fs;
    this.commandCount = 0;
    this.lastActivity = Date.now();
  }

  touch() {
    this.lastActivity = Date.now();
  }

  get idleMs() {
    return Date.now() - this.lastActivity;
  }

  get expired() {
    return this.idleMs > IDLE_TIMEOUT_MS;
  }

  /** Run a command line inside the session shell. */
  async execute(input) {
    this.touch();
    this.commandCount += 1;
    const result = await this.shell.run(input);
    return result;
  }

  /** Banner shown when the shell boots. */
  bootBanner() {
    return [
      '\x1b[1;32m    ▄▄▄▄▄▄   ▄▄▄▄▄▄▄▄▄▄\x1b[0m',
      '\x1b[1;32m   ██▀▀▀██  ██▀▀▀██  ██▀▀▀██\x1b[0m',
      '\x1b[1;32m   ██    ██ ██    ██ ██    ██\x1b[0m',
      '\x1b[1;32m   ██▄▄▄██  ██▄▄▄██  ██▄▄▄██\x1b[0m',
      '\x1b[1;32m    ▀▀▀▀▀▀   ▀▀▀▀▀▀▀▀▀▀\x1b[0m',
      '\x1b[1;32m        HELLO CAT LABS\x1b[0m',
      '',
      `\x1b[2mEvery system here is fictional. Commands run against an in-memory filesystem.\x1b[0m`,
      `\x1b[2mType \x1b[0mhelp\x1b[2m for the command list or \x1b[0mchallenges\x1b[2m to list the lab.\x1b[0m`,
      '',
    ].join('\n');
  }

  /* ------------------------------------------------------------ lab actions */

  async listChallenges() {
    const challenges = await this.challengeService.list({ userId: this.userId });
    return challenges.map((challenge) => ({
      id: challenge.id,
      title: challenge.title,
      category: challenge.category,
      difficulty: challenge.difficulty,
      xp: challenge.xp,
      active: challenge.active && challenge.published,
      objective: challenge.objective,
      description: challenge.description,
      hints: (challenge.hints ?? []).length,
      locked: Boolean(challenge.locked),
      missingPrerequisites: challenge.missingPrerequisites ?? [],
    }));
  }

  async solvedChallengeIds() {
    return this.challengeService.submissionsRepo.solvedChallengeIds(this.userId);
  }

  async startChallenge(id) {
    const challenge = await this.challengeService.get(id);
    if (!challenge) return { ok: false, message: `No challenge with id ${id}.` };
    if (!challenge.active || !challenge.published) {
      return { ok: false, message: `Challenge ${id} is not currently active.` };
    }

    const gate = await this.challengeService.prerequisiteState(this.userId, challenge);
    if (gate.locked) {
      return {
        ok: false,
        locked: true,
        missing: gate.missing,
        message: `Challenge ${id} is locked. Capture ${gate.missing.join(', ')} first to unseal this environment.`,
      };
    }

    const lab = this.labs.get(challenge.id.toUpperCase()) ?? {
      ...DEFAULT_LAB,
      id: challenge.id,
      title: challenge.title,
      banner: `\x1b[1;32m${challenge.title}\x1b[0m loaded.`,
    };

    this.challengeId = challenge.id.toUpperCase();
    this.loadLab(lab);

    return {
      ok: true,
      banner: lab.banner ?? `\x1b[1;32m${challenge.title}\x1b[0m loaded.`,
      objective: challenge.objective,
      challenge: {
        id: challenge.id,
        title: challenge.title,
        category: challenge.category,
        difficulty: challenge.difficulty,
        xp: challenge.xp,
      },
    };
  }

  async resetChallenge() {
    if (!this.challengeId) return { ok: false, message: 'No challenge is loaded.' };
    const lab = this.labs.get(this.challengeId);
    if (!lab) return { ok: false, message: 'No lab environment is provisioned for this challenge.' };
    this.loadLab(lab);
    return { ok: true, banner: lab.banner ?? 'Environment reset.' };
  }

  async objective() {
    if (!this.challengeId) return null;
    const challenge = await this.challengeService.get(this.challengeId);
    if (!challenge) return null;
    return `${challenge.id} — ${challenge.title}\n${challenge.objective}`;
  }

  async submitFlag(flag) {
    if (!this.challengeId) {
      return { ok: false, message: 'No challenge is loaded. Use `start <id>` first.' };
    }
    const result = await this.challengeService.submit({
      userId: this.userId,
      challengeId: this.challengeId,
      flag,
      username: this.username,
    });

    if (result.status === 'solved') {
      const challenge = result.challenge;
      let reward = null;
      let coins = 0;
      try {
        reward = await this.services.playerService.addXp(this.userId, challenge.xp, {
          source: `web:${challenge.id}`,
          key: `challenge:${challenge.id}`,
          username: this.username,
        });
      } catch (error) {
        this.logger?.error('Web XP award failed', { error: error.message });
      }
      try {
        // The same reward the channel assistant announces to the community.
        const award = await this.services.economyService.credit(
          this.userId,
          Math.max(5, Math.floor(challenge.xp * 0.2)),
          { reason: `Challenge ${challenge.id}`, ref: `challenge:${challenge.id}` },
        );
        coins = award?.credited ?? 0;
      } catch (error) {
        this.logger?.error('Web coin award failed', { error: error.message });
      }
      try {
        await this.services.achievementService.evaluate(this.userId, { username: this.username });
      } catch (error) {
        this.logger?.error('Web achievement evaluation failed', { error: error.message });
      }
      return {
        ok: true,
        status: result.status,
        message:
          `${challenge.title} solved — ${challenge.xp} XP awarded` +
          (coins ? ` and ${coins} CATCOINS collected.` : '.'),
        xp: reward?.added ?? 0,
        coins,
        duplicate: reward?.duplicate ?? false,
      };
    }

    if (result.status === 'already-solved') {
      return { ok: false, status: result.status, message: 'You already solved this challenge.' };
    }
    if (result.status === 'locked') {
      return { ok: false, status: result.status, message: 'Maximum attempts reached for this challenge.' };
    }
    if (result.status === 'locked-prerequisite') {
      return {
        ok: false,
        status: result.status,
        message: `This challenge is locked. Capture ${(result.missing ?? []).join(', ')} first.`,
      };
    }
    if (result.status === 'inactive') {
      return { ok: false, status: result.status, message: 'This challenge is not active.' };
    }

    const remaining = result.attemptsRemaining === null ? null : `${result.attemptsRemaining} attempts left`;
    return {
      ok: false,
      status: result.status,
      message: `Incorrect flag${remaining ? ` — ${remaining}` : ''}.`,
    };
  }

  async requestHint() {
    if (!this.challengeId) {
      return { ok: false, message: 'No challenge is loaded. Use `start <id>` first.' };
    }
    const challenge = await this.challengeService.get(this.challengeId);
    if (!challenge) return { ok: false, message: 'Challenge not found.' };

    const profile = await this.challengeService.usersRepo.get(this.userId);
    const unlocked = profile?.hints?.[challenge.id] ?? [];
    const nextIndex = (challenge.hints ?? []).findIndex((_, index) => !unlocked.includes(index));

    if (nextIndex === -1) {
      return { ok: false, message: 'All hints for this challenge have been revealed.' };
    }

    try {
      const result = await this.challengeService.requestHint({
        userId: this.userId,
        challengeId: challenge.id,
        index: nextIndex,
        username: this.username,
      });
      return { ok: true, text: result.text, index: nextIndex, cost: result.cost };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  }

  /** Snapshot used by the web client to render the side panel. */
  async snapshot() {
    const solved = new Set(await this.solvedChallengeIds());
    return {
      sessionId: this.id,
      userId: this.userId,
      username: this.username,
      challengeId: this.challengeId,
      cwd: this.shell?.cwd ?? '/home/analyst',
      hostname: this.shell?.hostname ?? 'kali-lab',
      commands: this.commandCount,
      solved: [...solved],
    };
  }
}

export class SessionStore {
  constructor({ challengeService, labs, services, logger, maxSessions = 200 }) {
    this.challengeService = challengeService;
    this.labs = labs;
    this.services = services;
    this.logger = logger;
    this.maxSessions = maxSessions;
    this.sessions = new Map();
  }

  key(userId) {
    return String(userId);
  }

  get(userId) {
    const key = this.key(userId);
    const session = this.sessions.get(key);
    if (!session) return null;
    if (session.expired) {
      this.sessions.delete(key);
      return null;
    }
    return session;
  }

  ensure(userId, username) {
    const existing = this.get(userId);
    if (existing) {
      existing.username = username ?? existing.username;
      return existing;
    }
    const session = new TerminalSession({
      id: crypto.randomBytes(12).toString('hex'),
      userId: String(userId),
      username: username ?? 'Unknown Operator',
      challengeService: this.challengeService,
      labs: this.labs,
      services: this.services,
      logger: this.logger,
    });
    this.sessions.set(this.key(userId), session);

    if (this.sessions.size > this.maxSessions) {
      const oldest = [...this.sessions.values()].sort((a, b) => a.lastActivity - b.lastActivity)[0];
      if (oldest) this.sessions.delete(this.key(oldest.userId));
    }
    return session;
  }

  destroy(userId) {
    return this.sessions.delete(this.key(userId));
  }

  sweep() {
    for (const [key, session] of this.sessions) {
      if (session.expired) this.sessions.delete(key);
    }
  }
}

export { IDLE_TIMEOUT_MS };
