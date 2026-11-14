import { ValidationError } from '../utils/errors.js';
import { rankForXp } from './rankingService.js';

const MAX_AWARDS_KEPT = 200;

export class PlayerService {
  constructor({ usersRepo, submissionsRepo, challengeRepo, logger }) {
    this.usersRepo = usersRepo;
    this.submissionsRepo = submissionsRepo;
    this.challengeRepo = challengeRepo;
    this.logger = logger;
  }

  async ensureUser(userId, username) {
    if (!userId) throw new ValidationError('A valid user ID is required.');
    return this.usersRepo.ensure(String(userId), username);
  }

  async getUser(userId) {
    return this.usersRepo.get(String(userId));
  }

  async addXp(userId, amount, { source = 'unknown', key, username } = {}) {
    const value = Number(amount);
    if (!Number.isInteger(value) || value <= 0 || value > 10_000) {
      throw new ValidationError('XP amount must be an integer between 1 and 10000.');
    }
    if (!key) throw new ValidationError('An idempotency key is required for XP awards.');

    let result;
    await this.usersRepo.update(
      userId,
      (user) => {
        const existing = user.awards?.find((award) => award.key === key);
        if (existing) {
          result = { duplicate: true, added: 0, user, before: rankForXp(user.xp), after: rankForXp(user.xp) };
          return user;
        }
        const before = rankForXp(user.xp);
        user.xp += value;
        user.awards ??= [];
        user.awards.push({ key, source, amount: value, at: new Date().toISOString() });
        if (user.awards.length > MAX_AWARDS_KEPT) user.awards = user.awards.slice(-MAX_AWARDS_KEPT);
        result = { duplicate: false, added: value, user, before, after: rankForXp(user.xp) };
        return user;
      },
      username,
    );
    return result;
  }

  async removeXp(userId, amount, { source = 'admin', key, username } = {}) {
    const value = Number(amount);
    if (!Number.isInteger(value) || value <= 0 || value > 1_000_000) {
      throw new ValidationError('XP amount must be a positive integer.');
    }
    let result;
    await this.usersRepo.update(
      userId,
      (user) => {
        const before = rankForXp(user.xp);
        const removed = Math.min(user.xp, value);
        user.xp -= removed;
        user.awards ??= [];
        user.awards.push({
          key: key ?? `removal:${Date.now()}:${Math.random()}`,
          source,
          amount: -removed,
          at: new Date().toISOString(),
        });
        if (user.awards.length > MAX_AWARDS_KEPT) user.awards = user.awards.slice(-MAX_AWARDS_KEPT);
        result = { removed, user, before, after: rankForXp(user.xp) };
        return user;
      },
      username,
    );
    return result;
  }

  async rank(userId) {
    const user = await this.getUser(userId);
    return rankForXp(user?.xp ?? 0);
  }

  async leaderboard(limit = 100) {
    const users = await this.usersRepo.all();
    return users
      .slice()
      .sort((a, b) => b.xp - a.xp || (a.createdAt < b.createdAt ? -1 : 1))
      .slice(0, limit);
  }

  async stats(userId, { coins = 0 } = {}) {
    const user = await this.getUser(userId);
    const submissions = await this.submissionsRepo.byUser(userId);
    const solvedIds = [...new Set(submissions.filter((s) => s.correct).map((s) => s.challengeId))];
    const challenges = await this.challengeRepo.all();
    const byId = new Map(challenges.map((challenge) => [challenge.id, challenge]));
    const categoryCounts = {};
    let expertSolves = 0;
    for (const id of solvedIds) {
      const challenge = byId.get(id);
      if (!challenge) continue;
      categoryCounts[challenge.category] = (categoryCounts[challenge.category] ?? 0) + 1;
      if (challenge.difficulty === 'Expert') expertSolves += 1;
    }
    return {
      solves: solvedIds.length,
      categoryCounts,
      expertSolves,
      dailyCompletions: user?.streak?.total ?? 0,
      bestStreak: user?.streak?.longest ?? 0,
      currentStreak: user?.streak?.current ?? 0,
      coins,
      xp: user?.xp ?? 0,
    };
  }

  async resetPlayer(userId, { keepUser = false } = {}) {
    const existing = await this.getUser(userId);
    if (!existing) return false;
    if (keepUser) {
      await this.usersRepo.update(userId, (user) => {
        user.xp = 0;
        user.streak = { current: 0, longest: 0, lastDate: null, total: 0 };
        user.hints = {};
        user.awards = [];
        return user;
      });
    } else {
      await this.usersRepo.delete(userId);
    }
    return true;
  }
}
