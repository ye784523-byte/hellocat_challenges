import { JsonStore } from './jsonStore.js';
import { UserRepository, emptyUsers, validateUsers } from './repositories/userRepository.js';
import {
  ChallengeRepository,
  emptyChallenges,
  validateChallenges,
} from './repositories/challengeRepository.js';
import {
  SubmissionRepository,
  emptySubmissions,
  validateSubmissions,
} from './repositories/submissionRepository.js';
import {
  AchievementRepository,
  emptyAchievements,
  validateAchievements,
} from './repositories/achievementRepository.js';
import { EconomyRepository, emptyEconomy, validateEconomy } from './repositories/economyRepository.js';
import {
  ModerationRepository,
  emptyModeration,
  validateModeration,
} from './repositories/moderationRepository.js';
import { AuditRepository, emptyAudit, validateAudit } from './repositories/auditRepository.js';
import { SettingsRepository, defaultSettings, validateSettings } from './repositories/settingsRepository.js';

const FILES = [
  ['users', emptyUsers, validateUsers, UserRepository],
  ['challenges', emptyChallenges, validateChallenges, ChallengeRepository],
  ['submissions', emptySubmissions, validateSubmissions, SubmissionRepository],
  ['achievements', emptyAchievements, validateAchievements, AchievementRepository],
  ['economy', emptyEconomy, validateEconomy, EconomyRepository],
  ['moderation', emptyModeration, validateModeration, ModerationRepository],
  ['settings', defaultSettings, validateSettings, SettingsRepository],
  ['audit', emptyAudit, validateAudit, AuditRepository],
];

export function createStorage({ dataDir, logger }) {
  const stores = {};
  const repositories = {};

  for (const [name, defaults, validate, Repository] of FILES) {
    const store = new JsonStore({
      dir: dataDir,
      file: `${name}.json`,
      defaults,
      validate,
      logger,
    });
    stores[name] = store;
    repositories[`${name}Repo`] = new Repository(store);
  }

  return {
    stores,
    ...repositories,
    challengeRepo: repositories.challengesRepo,
    achievementRepo: repositories.achievementsRepo,
  };
}

export async function initStorage(storage, { logger }) {
  for (const [name, store] of Object.entries(storage.stores)) {
    if (!store) continue;
    try {
      await store.read();
    } catch (error) {
      logger?.error('Storage initialization failed', { store: name, error: error.message });
      throw error;
    }
  }
  return storage;
}

export async function flushStorage(storage) {
  await Promise.all(Object.values(storage.stores).map((store) => store.flush()));
}
