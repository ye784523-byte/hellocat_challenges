import { ACHIEVEMENTS } from '../constants/index.js';

export class AchievementService {
  constructor({ achievementRepo, playerService, economyService, logger }) {
    this.achievementRepo = achievementRepo;
    this.playerService = playerService;
    this.economyService = economyService;
    this.logger = logger;
  }

  definitions() {
    return ACHIEVEMENTS;
  }

  async listFor(userId) {
    const unlocked = await this.achievementRepo.listFor(userId);
    return ACHIEVEMENTS.map((definition) => ({
      ...definition,
      unlockedAt: unlocked[definition.id]?.at ?? null,
    }));
  }

  async evaluate(userId, { username } = {}) {
    const coins = await this.economyService.getBalance(userId);
    const stats = await this.playerService.stats(userId, { coins });
    const unlockedNow = await this.achievementRepo.listFor(userId);
    const newlyUnlocked = [];

    for (const definition of ACHIEVEMENTS) {
      if (unlockedNow[definition.id]) continue;
      let eligible = false;
      try {
        eligible = definition.check(stats);
      } catch (error) {
        this.logger?.warn('Achievement check failed', {
          achievement: definition.id,
          error: error.message,
        });
      }
      if (!eligible) continue;

      const fresh = await this.achievementRepo.unlock(userId, definition.id, {
        xp: definition.xp,
        coins: definition.coins,
      });
      if (!fresh) continue;

      try {
        if (definition.xp > 0) {
          await this.playerService.addXp(userId, definition.xp, {
            source: `achievement:${definition.id}`,
            key: `achievement:${definition.id}`,
            username,
          });
        }
        if (definition.coins > 0) {
          await this.economyService.credit(userId, definition.coins, {
            reason: `Achievement: ${definition.name}`,
            ref: `achievement:${definition.id}`,
          });
        }
      } catch (error) {
        this.logger?.error('Achievement reward failed', {
          achievement: definition.id,
          userId,
          error: error.message,
        });
      }

      newlyUnlocked.push(definition);
    }

    return newlyUnlocked;
  }
}
