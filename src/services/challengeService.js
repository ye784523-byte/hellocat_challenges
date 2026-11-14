import { z } from 'zod';
import { CATEGORIES, DIFFICULTIES } from '../constants/index.js';
import { hashFlag, verifyFlag, normalizeFlag } from '../utils/flags.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const hintSchema = z.union([
  z.string().trim().min(3).max(300).transform((text) => ({ text, cost: 0 })),
  z
    .object({
      text: z.string().trim().min(3).max(300),
      cost: z.number().int().min(0).max(1000).default(0),
    })
    .strict(),
]);

const baseSchema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(2000),
  objective: z.string().trim().min(5).max(500),
  category: z.enum(CATEGORIES),
  difficulty: z.enum(DIFFICULTIES),
  xp: z.number().int().min(1).max(10_000),
  flag: z.string().trim().min(3).max(300),
  hints: z.array(hintSchema).max(5).default([]),
  maxAttempts: z.number().int().min(1).max(100).nullable().optional().default(null),
  authorId: z.string().trim().min(1).max(64),
  authorName: z.string().trim().max(100).optional().default('Unknown Operator'),
  flagFormat: z.string().trim().max(100).optional().default('HC{...}'),
  prerequisites: z.array(z.string().trim().min(3).max(40)).max(10).default([]),
  active: z.boolean().optional().default(false),
  published: z.boolean().optional().default(false),
});

const editSchema = baseSchema.partial().omit({ authorId: true });

function normalizeHints(hints) {
  return (hints ?? []).map((hint) =>
    typeof hint === 'string' ? { text: hint, cost: 0 } : { text: hint.text, cost: hint.cost ?? 0 },
  );
}

/**
 * Prerequisites are stored as upper case challenge ids so that a lookup never
 * depends on how the id was typed. A challenge that requires itself would
 * never unlock, so it is rejected outright.
 */
function normalizePrerequisites(list, selfId = null) {
  const seen = new Set();
  const normalized = [];
  for (const entry of list ?? []) {
    const id = String(entry).trim().toUpperCase();
    if (!/^HC-[A-Z0-9_-]{1,40}$/.test(id)) {
      throw new ValidationError(`Invalid prerequisite id: ${entry}`);
    }
    if (selfId && id === selfId) {
      throw new ValidationError('A challenge cannot require itself.');
    }
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }
  return normalized;
}

export function publicChallenge(challenge) {
  if (!challenge) return null;
  const { flagHash, ...rest } = challenge;
  return rest;
}

export class ChallengeService {
  constructor({ challengesRepo, submissionsRepo, usersRepo, economyService, flagSecret, logger }) {
    if (!flagSecret) throw new Error('ChallengeService requires a flag secret');
    this.challengesRepo = challengesRepo;
    this.submissionsRepo = submissionsRepo;
    this.usersRepo = usersRepo;
    this.economyService = economyService;
    this.flagSecret = flagSecret;
    this.logger = logger;
    this.submitLocks = new Map();
  }

  async _nextId() {
    const challenges = await this.challengesRepo.all();
    let max = 0;
    for (const challenge of challenges) {
      const match = /^HC-(\d+)$/.exec(challenge.id);
      if (match) max = Math.max(max, Number(match[1]));
    }
    return `HC-${String(max + 1).padStart(3, '0')}`;
  }

  async create(input, { id: forcedId } = {}) {
    const parsed = baseSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        `Challenge validation failed: ${parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}`,
      );
    }
    const data = parsed.data;
    const id = forcedId ? String(forcedId).trim() : await this._nextId();
    if (!/^HC-[A-Za-z0-9_-]{1,40}$/.test(id)) {
      throw new ValidationError('Challenge IDs must look like HC-001.');
    }
    if (await this.challengesRepo.get(id)) {
      throw new ValidationError(`Challenge ${id} already exists.`);
    }
    const now = new Date().toISOString();
    const challenge = {
      id,
      title: data.title,
      description: data.description,
      objective: data.objective,
      category: data.category,
      difficulty: data.difficulty,
      xp: data.xp,
      hints: normalizeHints(data.hints),
      maxAttempts: data.maxAttempts,
      prerequisites: normalizePrerequisites(data.prerequisites, id),
      flagHash: hashFlag(data.flag, this.flagSecret),
      flagFormat: data.flagFormat,
      active: data.active,
      published: data.published,
      authorId: data.authorId,
      authorName: data.authorName,
      createdAt: now,
      updatedAt: now,
      publishedAt: data.published ? now : null,
      stats: { attempts: 0, solves: 0 },
    };
    await this.challengesRepo.create(challenge);
    return publicChallenge(challenge);
  }

  async edit(id, patch) {
    const parsed = editSchema.safeParse(patch);
    if (!parsed.success) {
      throw new ValidationError(
        `Challenge edit validation failed: ${parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}`,
      );
    }
    const data = parsed.data;

    const updated = await this.challengesRepo.update(id, (challenge) => {
      const next = { ...challenge };
      for (const field of ['title', 'description', 'objective', 'category', 'difficulty', 'xp', 'maxAttempts', 'flagFormat', 'authorName']) {
        if (data[field] !== undefined) next[field] = data[field];
      }
      if (data.hints !== undefined) next.hints = normalizeHints(data.hints);
      if (data.prerequisites !== undefined) {
        next.prerequisites = normalizePrerequisites(data.prerequisites, id.toUpperCase());
      }
      if (data.flag !== undefined) {
        next.flagHash = hashFlag(data.flag, this.flagSecret);
        next.flagUpdatedAt = new Date().toISOString();
      }
      if (data.active !== undefined) next.active = data.active;
      if (data.published !== undefined) {
        next.published = data.published;
        next.publishedAt = data.published ? (next.publishedAt ?? new Date().toISOString()) : null;
      }
      next.updatedAt = new Date().toISOString();
      return next;
    });
    return publicChallenge(updated);
  }

  async publish(id) {
    const now = new Date().toISOString();
    const challenge = await this.challengesRepo.update(id, (existing) => ({
      ...existing,
      active: true,
      published: true,
      publishedAt: existing.publishedAt ?? now,
      updatedAt: now,
    }));
    return publicChallenge(challenge);
  }

  async disable(id) {
    const challenge = await this.challengesRepo.update(id, (existing) => ({
      ...existing,
      active: false,
      updatedAt: new Date().toISOString(),
    }));
    return publicChallenge(challenge);
  }

  async delete(id) {
    const removed = await this.challengesRepo.delete(id);
    if (!removed) throw new NotFoundError('Challenge not found.');
    return true;
  }

  async get(id) {
    const challenge = await this.challengesRepo.get(id.toUpperCase());
    return publicChallenge(challenge);
  }

  async getRaw(id) {
    return this.challengesRepo.get(id.toUpperCase());
  }

  async list({ category, difficulty, includeInactive = false, search, userId } = {}) {
    let challenges = await this.challengesRepo.all();
    if (!includeInactive) challenges = challenges.filter((challenge) => challenge.active && challenge.published);
    if (category) challenges = challenges.filter((challenge) => challenge.category === category);
    if (difficulty) challenges = challenges.filter((challenge) => challenge.difficulty === difficulty);
    if (search) {
      const needle = search.toLowerCase();
      challenges = challenges.filter(
        (challenge) =>
          challenge.title.toLowerCase().includes(needle) ||
          challenge.id.toLowerCase().includes(needle) ||
          challenge.category.toLowerCase().includes(needle),
      );
    }
    const visible = challenges.sort((a, b) => a.id.localeCompare(b.id)).map(publicChallenge);
    if (!userId) return visible;

    const solved = new Set(await this.submissionsRepo.solvedChallengeIds(userId));
    return visible.map((challenge) => {
      const missing = (challenge.prerequisites ?? []).filter((id) => !solved.has(id));
      return { ...challenge, locked: missing.length > 0, missingPrerequisites: missing };
    });
  }

  /**
   * A challenge can require other challenges to be solved first. The gate is
   * evaluated per operator, so the same catalogue can show a locked entry to
   * one operator and an open one to another.
   */
  async prerequisiteState(userId, challenge) {
    const required = challenge?.prerequisites ?? [];
    if (!required.length) return { locked: false, missing: [] };
    const solved = new Set(await this.submissionsRepo.solvedChallengeIds(userId));
    const missing = required.filter((id) => !solved.has(id));
    return { locked: missing.length > 0, missing };
  }

  /** Challenges that become available once the given challenge is solved. */
  async unlockedBy(challengeId) {
    const id = String(challengeId).toUpperCase();
    const challenges = await this.challengesRepo.all();
    return challenges
      .filter(
        (challenge) =>
          (challenge.prerequisites ?? []).includes(id) && challenge.active && challenge.published,
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(publicChallenge);
  }

  async categories() {
    const challenges = await this.list();
    return CATEGORIES.map((category) => ({
      name: category,
      count: challenges.filter((challenge) => challenge.category === category).length,
    }));
  }

  async verify(challenge, flag) {
    return verifyFlag(normalizeFlag(flag), challenge.flagHash, this.flagSecret);
  }

  async _withLock(key, task) {
    const previous = this.submitLocks.get(key) ?? Promise.resolve();
    const run = previous.then(task, task);
    const chained = run.catch(() => {});
    this.submitLocks.set(key, chained);
    try {
      return await run;
    } finally {
      if (this.submitLocks.get(key) === chained) this.submitLocks.delete(key);
    }
  }

  async submit({ userId, challengeId, flag, username }) {
    if (!userId) throw new ValidationError('A valid user is required.');
    if (!flag || String(flag).trim().length === 0) throw new ValidationError('A flag is required.');
    if (String(flag).length > 300) throw new ValidationError('Flag exceeds the maximum length.');

    return this._withLock(`${userId}:${challengeId}`, async () => {
      const challenge = await this.challengesRepo.get(challengeId.toUpperCase());
      if (!challenge) throw new NotFoundError('Challenge not found.');
      if (!challenge.active || !challenge.published) {
        return { status: 'inactive', correct: false, challenge: publicChallenge(challenge) };
      }
      if (await this.submissionsRepo.solved(userId, challenge.id)) {
        return { status: 'already-solved', correct: false, challenge: publicChallenge(challenge) };
      }
      const gate = await this.prerequisiteState(userId, challenge);
      if (gate.locked) {
        return {
          status: 'locked-prerequisite',
          correct: false,
          missing: gate.missing,
          challenge: publicChallenge(challenge),
        };
      }

      const attempts = await this.submissionsRepo.attempts(userId, challenge.id);
      if (challenge.maxAttempts && attempts >= challenge.maxAttempts) {
        return {
          status: 'locked',
          correct: false,
          attemptNumber: attempts,
          challenge: publicChallenge(challenge),
        };
      }

      const user = await this.usersRepo.get(userId);
      const hintUsed = Boolean(user?.hints?.[challenge.id]?.length);
      const correct = await this.verify(challenge, flag);
      const attemptNumber = attempts + 1;
      await this.submissionsRepo.add({
        userId,
        challengeId: challenge.id,
        correct,
        attemptNumber,
        hintUsed,
      });

      try {
        await this.challengesRepo.update(challenge.id, (existing) => ({
          ...existing,
          stats: {
            attempts: (existing.stats?.attempts ?? 0) + 1,
            solves: (existing.stats?.solves ?? 0) + (correct ? 1 : 0),
          },
        }));
      } catch (error) {
        this.logger?.error('Challenge statistics update failed', {
          challengeId: challenge.id,
          error: error.message,
        });
      }

      this.logger?.info('Flag submission processed', {
        userId,
        challengeId: challenge.id,
        correct,
        attemptNumber,
        username,
      });

      return {
        status: correct ? 'solved' : 'incorrect',
        correct,
        attemptNumber,
        attemptsRemaining: challenge.maxAttempts
          ? Math.max(0, challenge.maxAttempts - attemptNumber)
          : null,
        challenge: publicChallenge(challenge),
      };
    });
  }

  async requestHint({ userId, challengeId, index, username }) {
    const challenge = await this.challengesRepo.get(challengeId.toUpperCase());
    if (!challenge) throw new NotFoundError('Challenge not found.');
    if (!challenge.hints || challenge.hints.length === 0) {
      throw new ValidationError('This challenge has no hints available.');
    }
    const gate = await this.prerequisiteState(userId, challenge);
    if (gate.locked) {
      throw new ValidationError(
        `This challenge is locked. Solve ${gate.missing.join(', ')} first to unlock the intel.`,
      );
    }
    const hintIndex = Number(index);
    if (!Number.isInteger(hintIndex) || hintIndex < 0 || hintIndex >= challenge.hints.length) {
      throw new ValidationError(`Hint index must be between 0 and ${challenge.hints.length - 1}.`);
    }
    const hint = challenge.hints[hintIndex];
    const user = await this.usersRepo.ensure(userId, username);
    const unlocked = user.hints?.[challenge.id] ?? [];
    if (unlocked.includes(hintIndex)) {
      return { text: hint.text, cost: 0, alreadyUnlocked: true, index: hintIndex };
    }

    if (hint.cost > 0) {
      const { economyService } = this;
      if (!economyService) throw new ValidationError('Hint purchases are unavailable.');
      await economyService.debit(userId, hint.cost, {
        reason: `Hint for ${challenge.id}`,
        ref: `hint:${challenge.id}:${hintIndex}`,
      });
    }

    await this.usersRepo.update(userId, (profile) => {
      profile.hints ??= {};
      profile.hints[challenge.id] ??= [];
      if (!profile.hints[challenge.id].includes(hintIndex)) profile.hints[challenge.id].push(hintIndex);
      return profile;
    }, username);

    return { text: hint.text, cost: hint.cost ?? 0, alreadyUnlocked: false, index: hintIndex };
  }

  async userProgress(userId) {
    const solvedIds = await this.submissionsRepo.solvedChallengeIds(userId);
    const challenges = await this.challengesRepo.all();
    const solved = new Set(solvedIds);
    const active = challenges.filter((challenge) => challenge.active && challenge.published);
    return {
      totalActive: active.length,
      solved: active.filter((challenge) => solved.has(challenge.id)).length,
      solvedIds,
      byDifficulty: Object.fromEntries(
        DIFFICULTIES.map((difficulty) => [
          difficulty,
          {
            total: active.filter((challenge) => challenge.difficulty === difficulty).length,
            solved: active.filter(
              (challenge) => challenge.difficulty === difficulty && solved.has(challenge.id),
            ).length,
          },
        ]),
      ),
    };
  }

  async stats() {
    const challenges = await this.challengesRepo.all();
    const submissions = await this.submissionsRepo.all();
    return {
      total: challenges.length,
      active: challenges.filter((challenge) => challenge.active && challenge.published).length,
      inactive: challenges.filter((challenge) => !challenge.active || !challenge.published).length,
      attempts: submissions.length,
      solves: submissions.filter((submission) => submission.correct).length,
      byDifficulty: Object.fromEntries(
        DIFFICULTIES.map((difficulty) => [
          difficulty,
          challenges.filter((challenge) => challenge.difficulty === difficulty).length,
        ]),
      ),
      byCategory: Object.fromEntries(
        CATEGORIES.map((category) => [
          category,
          challenges.filter((challenge) => challenge.category === category).length,
        ]),
      ),
    };
  }

  async upsertImported(definition, { publish = false } = {}) {
    const existing = definition.id ? await this.challengesRepo.get(definition.id) : null;
    if (existing) {
      const patch = {
        title: definition.title,
        description: definition.description,
        objective: definition.objective,
        category: definition.category,
        difficulty: definition.difficulty,
        xp: definition.xp,
        hints: definition.hints,
        maxAttempts: definition.maxAttempts ?? null,
        flagFormat: definition.flagFormat,
        authorName: definition.authorName,
        prerequisites: definition.prerequisites ?? [],
        active: true,
        published: publish || Boolean(definition.published),
      };
      if (definition.flag) patch.flag = definition.flag;
      return this.edit(existing.id, patch);
    }

    return this.create(
      {
        ...definition,
        authorId: String(definition.authorId ?? 'import'),
        authorName: definition.authorName ?? 'Hello Cat Intel',
        active: true,
        published: publish || Boolean(definition.published),
      },
      { id: definition.id },
    );
  }
}
