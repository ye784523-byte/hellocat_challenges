import path from 'node:path';
import { z } from 'zod';

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  });

const schema = z.object({
  DISCORD_TOKEN: z.string().trim().optional().default(''),
  CLIENT_ID: z.string().trim().optional().default(''),
  GUILD_ID: z.string().trim().optional().default(''),
  ADMIN_ROLE_ID: z.string().trim().optional().default(''),
  CHALLENGE_CHANNEL_ID: z.string().trim().optional().default(''),
  LOG_CHANNEL_ID: z.string().trim().optional().default(''),
  ANNOUNCEMENT_CHANNEL_ID: z.string().trim().optional().default(''),
  WELCOME_CHANNEL_ID: z.string().trim().optional().default(''),
  FLAG_SECRET: z.string().trim().optional().default(''),
  BOT_PREFIX: z.string().trim().min(1).default('!'),
  BOT_TIMEZONE: z.string().trim().default('Africa/Casablanca'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  REGISTER_GLOBAL_COMMANDS: booleanish.default(false),
  DATA_DIR: z.string().trim().optional().default(''),
  LOG_DIR: z.string().trim().optional().default(''),
  BACKUP_DIR: z.string().trim().optional().default(''),
  CHALLENGE_IMPORT_ON_START: booleanish.default(false),
  AUTO_BACKUP_HOURS: z.coerce.number().int().min(0).max(168).default(24),
  WEB_BASE_URL: z.string().trim().optional().default(''),
  WEB_PUBLIC_URL: z.string().trim().optional().default(''),
  DISCORD_INVITE_URL: z.string().trim().optional().default(''),
  OFFICIAL_SITE_URL: z.string().trim().optional().default('https://helloc.at'),
  ANNOUNCE_SOLVES: booleanish.default(true),
  ANNOUNCE_POLL_SECONDS: z.coerce.number().int().min(5).max(600).default(15),
  DAILY_TIPS_ENABLED: booleanish.default(true),
  WEEKLY_LEADERBOARD_ENABLED: booleanish.default(true),
  ASSISTANT_ENABLED: booleanish.default(true),
  WELCOME_ENABLED: booleanish.default(true),
  WELCOME_DM_ENABLED: booleanish.default(true),
});

export function loadConfig(env = process.env, cwd = process.cwd()) {
  // Accept DISCORD_GUILD_ID as an alias so the environment can use the more
  // explicit Discord prefixed names next to DISCORD_TOKEN.
  const source = { ...env };
  if (!source.GUILD_ID && source.DISCORD_GUILD_ID) source.GUILD_ID = source.DISCORD_GUILD_ID;

  const result = schema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid configuration: ${details}`);
  }

  const raw = result.data;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: raw.BOT_TIMEZONE }).format(new Date());
  } catch {
    throw new Error(`Invalid BOT_TIMEZONE: ${raw.BOT_TIMEZONE}`);
  }

  return Object.freeze({
    ...raw,
    registerGlobalCommands: raw.REGISTER_GLOBAL_COMMANDS,
    dataDir: path.resolve(cwd, raw.DATA_DIR || 'src/storage/data'),
    logDir: path.resolve(cwd, raw.LOG_DIR || 'logs'),
    backupDir: path.resolve(cwd, raw.BACKUP_DIR || 'backups'),
    challengesDir: path.resolve(cwd, 'challenges'),
  });
}

export function assertRuntimeConfig(config) {
  const problems = [];
  if (!config.DISCORD_TOKEN) problems.push('DISCORD_TOKEN is required');
  if (!config.CLIENT_ID) problems.push('CLIENT_ID is required');
  if (!config.FLAG_SECRET || config.FLAG_SECRET.length < 16) {
    problems.push('FLAG_SECRET is required and must be at least 16 characters');
  }
  if (config.NODE_ENV === 'production' && !config.GUILD_ID && !config.registerGlobalCommands) {
    problems.push('Set GUILD_ID or REGISTER_GLOBAL_COMMANDS=true in production');
  }
  if (problems.length > 0) {
    throw new Error(`Startup configuration invalid: ${problems.join('; ')}`);
  }
  return true;
}

export function isSnowflake(value) {
  return typeof value === 'string' && /^\d{17,20}$/.test(value);
}

export const config = loadConfig();
