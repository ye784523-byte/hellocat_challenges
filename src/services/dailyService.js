import { dateKey, previousDateKey } from '../utils/time.js';
import { ValidationError } from '../utils/errors.js';

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export class DailyService {
  constructor({ settingsRepo, challengeRepo, usersRepo, playerService, economyService, timeZone, logger, now = () => new Date() }) {
    this.settingsRepo = settingsRepo;
    this.challengeRepo = challengeRepo;
    this.usersRepo = usersRepo;
    this.playerService = playerService;
    this.economyService = economyService;
    this.timeZone = timeZone;
    this.logger = logger;
    this.now = now;
    this.lock = Promise.resolve();
  }

  _serialize(task) {
    const run = this.lock.then(task, task);
    this.lock = run.catch(() => {});
    return run;
  }

  today() {
    return dateKey(this.now(), this.timeZone);
  }

  async ensureDaily() {
    return this._serialize(async () => {
      const today = this.today();
      const settings = await this.settingsRepo.get();
      const current = settings.daily;

      if (current?.date === today && current.challengeId) {
        const challenge = await this.challengeRepo.get(current.challengeId);
        if (
          challenge &&
          challenge.active &&
          challenge.published &&
          (challenge.prerequisites ?? []).length === 0
        ) {
          return { date: today, challenge, settings };
        }
      }

      const candidates = (await this.challengeRepo.all())
        .filter((challenge) => challenge.active && challenge.published)
        // The daily operation is the same for everyone, so a challenge behind
        // a prerequisite cannot be part of the rotation.
        .filter((challenge) => (challenge.prerequisites ?? []).length === 0)
        .sort((a, b) => a.id.localeCompare(b.id));

      if (candidates.length === 0) return { date: today, challenge: null, settings };

      let index = hashString(today) % candidates.length;
      if (candidates.length > 1 && candidates[index]?.id === current?.challengeId) {
        index = (index + 1) % candidates.length;
      }
      const challenge = candidates[index];

      const updated = await this.settingsRepo.update((data) => {
        if (data.daily?.date === today && data.daily.challengeId) return data;
        data.daily = {
          date: today,
          challengeId: challenge.id,
          completions: {},
          selectedAt: new Date().toISOString(),
        };
        data.meta = data.meta ?? {};
        data.meta.updatedAt = new Date().toISOString();
        return data;
      });

      if (updated.daily.date !== today) {
        const fallback = await this.challengeRepo.get(updated.daily.challengeId);
        return { date: updated.daily.date, challenge: fallback, settings: updated };
      }

      return { date: today, challenge, settings: updated };
    });
  }

  async hasCompleted(userId) {
    const settings = await this.settingsRepo.get();
    const today = this.today();
    if (settings.daily.date !== today) return false;
    return Boolean(settings.daily.completions?.[userId]);
  }

  async recordCompletion({ userId, challengeId, username }) {
    return this._serialize(async () => {
      const today = this.today();
      const settings = await this.settingsRepo.get();
      if (settings.daily.date !== today || !settings.daily.challengeId) {
        throw new ValidationError('There is no active daily challenge for today.');
      }
      if (settings.daily.challengeId !== challengeId) {
        throw new ValidationError('That challenge is not today\'s daily operation.');
      }

      let duplicate = false;
      const updated = await this.settingsRepo.update((data) => {
        data.daily.completions ??= {};
        if (data.daily.completions[userId]) {
          duplicate = true;
          return data;
        }
        data.daily.completions[userId] = new Date().toISOString();
        return data;
      });

      if (duplicate) {
        return { duplicate: true, xp: 0, coins: 0, streak: null };
      }

      const yesterday = previousDateKey(this.now(), this.timeZone);
      let streakSnapshot;
      await this.usersRepo.update(userId, (user) => {
        const streak = user.streak ?? { current: 0, longest: 0, lastDate: null, total: 0 };
        if (streak.lastDate === today) {
          streakSnapshot = { ...streak };
          return user;
        }
        streak.current = streak.lastDate === yesterday ? streak.current + 1 : 1;
        streak.longest = Math.max(streak.longest, streak.current);
        streak.lastDate = today;
        streak.total = (streak.total ?? 0) + 1;
        user.streak = streak;
        streakSnapshot = { ...streak };
        return user;
      }, username);

      const rewardXp = Number(updated.guild?.dailyRewardXp ?? 75);
      const rewardCoins = Number(updated.guild?.dailyRewardCoins ?? 30);

      if (rewardXp > 0) {
        await this.playerService.addXp(userId, rewardXp, {
          source: 'daily',
          key: `daily:${today}`,
          username,
        });
      }
      if (rewardCoins > 0) {
        await this.economyService.credit(userId, rewardCoins, {
          reason: `Daily operation ${today}`,
          ref: `daily:${today}`,
        });
      }

      return {
        duplicate: false,
        xp: rewardXp,
        coins: rewardCoins,
        streak: streakSnapshot,
        date: today,
      };
    });
  }

  async status(userId) {
    const daily = await this.ensureDaily();
    const settings = await this.settingsRepo.get();
    return {
      ...daily,
      completed: Boolean(settings.daily.completions?.[userId]),
    };
  }
}
