import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, assertRuntimeConfig } from './config/config.js';
import { createLogger } from './utils/logger.js';
import { createStorage, initStorage, flushStorage } from './storage/index.js';
import { createClient } from './client.js';
import { createServices } from './services/index.js';
import { loadCommands } from './handlers/commandLoader.js';
import { loadEvents } from './handlers/eventLoader.js';
import { startDailyScheduler } from './handlers/scheduler.js';
import { startAnnouncementScheduler } from './handlers/announcementScheduler.js';
import { importChallenges } from './services/challengeImportService.js';
import { createBackup } from './utils/backup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  let config;
  let logger;
  try {
    config = loadConfig();
    assertRuntimeConfig(config);
    logger = createLogger({ dir: config.logDir });
  } catch (error) {
    console.error(`[FATAL] ${error.message}`);
    process.exitCode = 1;
    return;
  }

  logger.info('Hello Cat boot sequence initiated', {
    node: process.version,
    env: config.NODE_ENV,
    timezone: config.BOT_TIMEZONE,
  });

  let client;
  let storage;
  let shuttingDown = false;

  async function shutdown(reason, code = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Graceful shutdown initiated', { reason });
    const force = setTimeout(() => {
      logger.error('Graceful shutdown timed out; forcing exit');
      process.exit(code || 1);
    }, 10_000);
    force.unref?.();
    try {
      client?.destroy();
      if (storage) await flushStorage(storage);
      await logger.flush();
    } catch (error) {
      console.error(`Shutdown error: ${error.message}`);
    } finally {
      clearTimeout(force);
      process.exit(code);
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
      error: reason instanceof Error ? reason.message : String(reason),
    });
  });
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    shutdown('uncaughtException', 1);
  });

  try {
    storage = createStorage({ dataDir: config.dataDir, logger });
    await initStorage(storage, { logger });

    client = createClient({ config, logger });
    const services = createServices({ storage, config, logger, client });

    if (config.CHALLENGE_IMPORT_ON_START) {
      const result = await importChallenges(services.challengeService, config.challengesDir, {
        logger,
      });
      logger.info('Challenge auto-import complete', {
        imported: result.imported.length,
        updated: result.updated.length,
        errors: result.errors.length,
      });
    }

    const ctx = {
      client,
      config,
      logger,
      services,
      storage,
      startedAt: Date.now(),
    };
    client.context = ctx;

    await loadCommands(client, path.join(__dirname, 'commands'), { logger });
    await loadEvents(client, path.join(__dirname, 'events'), ctx, { logger });
    startDailyScheduler(client, ctx);
    startAnnouncementScheduler(client, ctx);

    if (config.AUTO_BACKUP_HOURS > 0) {
      const runBackup = async () => {
        try {
          const result = await createBackup({
            storage,
            backupDir: config.backupDir,
            logger,
          });
          logger.info('Automated backup complete', { directory: result.directory, files: result.files.length });
        } catch (error) {
          logger.error('Automated backup failed', { error: error.message });
        }
      };
      const backupTimer = setInterval(runBackup, config.AUTO_BACKUP_HOURS * 3_600_000);
      backupTimer.unref?.();
      runBackup();
    }

    await client.login(config.DISCORD_TOKEN);
    logger.info('Hello Cat online');
  } catch (error) {
    logger.error('Startup failed', { error: error.message, stack: error.stack });
    await shutdown('startup-failure', 1);
  }
}

main();
