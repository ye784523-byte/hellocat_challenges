import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStorage, initStorage } from '../src/storage/index.js';
import { EconomyService } from '../src/services/economyService.js';
import { PlayerService } from '../src/services/playerService.js';
import { ChallengeService } from '../src/services/challengeService.js';
import { AchievementService } from '../src/services/achievementService.js';
import { DailyService } from '../src/services/dailyService.js';

export const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  flush: async () => {},
};

export async function makeTempDir(prefix = 'hellocat-test-') {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function createTestEnv({ timeZone = 'UTC', flagSecret = 'test-secret-at-least-16-chars', now } = {}) {
  const dir = await makeTempDir();
  const storage = createStorage({ dataDir: dir, logger: silentLogger });
  await initStorage(storage, { logger: silentLogger });

  const economyService = new EconomyService({ economyRepo: storage.economyRepo, logger: silentLogger });
  const playerService = new PlayerService({
    usersRepo: storage.usersRepo,
    submissionsRepo: storage.submissionsRepo,
    challengeRepo: storage.challengeRepo,
    logger: silentLogger,
  });
  const challengeService = new ChallengeService({
    challengesRepo: storage.challengeRepo,
    submissionsRepo: storage.submissionsRepo,
    usersRepo: storage.usersRepo,
    economyService,
    flagSecret,
    logger: silentLogger,
  });
  const achievementService = new AchievementService({
    achievementRepo: storage.achievementRepo,
    playerService,
    economyService,
    logger: silentLogger,
  });
  let currentNow = now ?? new Date('2026-03-10T10:00:00.000Z');
  const dailyService = new DailyService({
    settingsRepo: storage.settingsRepo,
    challengeRepo: storage.challengeRepo,
    usersRepo: storage.usersRepo,
    playerService,
    economyService,
    timeZone,
    logger: silentLogger,
    now: () => currentNow,
  });

  return {
    dir,
    storage,
    economyService,
    playerService,
    challengeService,
    achievementService,
    dailyService,
    flagSecret,
    setNow: (value) => {
      currentNow = value;
    },
    async cleanup() {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

export const challengeInput = (overrides = {}) => ({
  title: 'Test Challenge',
  description: 'A fictional lab challenge used for automated tests.',
  objective: 'Submit the captured lab value.',
  category: 'Linux',
  difficulty: 'Easy',
  xp: 100,
  flag: 'HC{test_flag}',
  hints: [{ text: 'Try reading the lab notes.', cost: 0 }],
  maxAttempts: 3,
  authorId: 'admin-1',
  authorName: 'Test Admin',
  ...overrides,
});
