import { createGameEngine } from '../games/index.js';
import { PlayerService } from './playerService.js';
import { EconomyService } from './economyService.js';
import { ChallengeService } from './challengeService.js';
import { AchievementService } from './achievementService.js';
import { DailyService } from './dailyService.js';
import { ModerationService } from './moderationService.js';
import { LeaderboardService } from './leaderboardService.js';
import { AnnouncementService } from './announcementService.js';

export function createServices({ storage, config, logger, client }) {
  const gameEngine = createGameEngine();

  const economyService = new EconomyService({
    economyRepo: storage.economyRepo,
    logger,
  });

  const playerService = new PlayerService({
    usersRepo: storage.usersRepo,
    submissionsRepo: storage.submissionsRepo,
    challengeRepo: storage.challengeRepo,
    logger,
  });

  const leaderboardService = new LeaderboardService({
    usersRepo: storage.usersRepo,
    submissionsRepo: storage.submissionsRepo,
    economyRepo: storage.economyRepo,
    logger,
  });

  const challengeService = new ChallengeService({
    challengesRepo: storage.challengeRepo,
    submissionsRepo: storage.submissionsRepo,
    usersRepo: storage.usersRepo,
    economyService,
    flagSecret: config.FLAG_SECRET,
    logger,
  });

  const achievementService = new AchievementService({
    achievementRepo: storage.achievementRepo,
    playerService,
    economyService,
    logger,
  });

  const dailyService = new DailyService({
    settingsRepo: storage.settingsRepo,
    challengeRepo: storage.challengeRepo,
    usersRepo: storage.usersRepo,
    playerService,
    economyService,
    timeZone: config.BOT_TIMEZONE,
    logger,
  });

  const moderationService = new ModerationService({
    moderationRepo: storage.moderationRepo,
    auditRepo: storage.auditRepo,
    logger,
    logChannelResolver: async (guild) => {
      const configured = config.LOG_CHANNEL_ID
        ? client.channels.cache.get(config.LOG_CHANNEL_ID)
        : null;
      if (configured?.isTextBased?.()) return configured;
      if (config.GUILD_ID) {
        const targetGuild = client.guilds.cache.get(config.GUILD_ID) ?? guild;
        return targetGuild?.channels?.cache?.get(config.LOG_CHANNEL_ID) ?? null;
      }
      return guild?.channels?.cache?.get(config.LOG_CHANNEL_ID) ?? null;
    },
  });

  const announcementService = new AnnouncementService({
    client,
    config,
    logger,
    leaderboardService,
    challengeService,
    playerService,
  });

  return {
    economyService,
    playerService,
    leaderboardService,
    challengeService,
    achievementService,
    dailyService,
    moderationService,
    announcementService,
    gameEngine,
  };
}
