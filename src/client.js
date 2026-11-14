import { Client, Collection, GatewayIntentBits, ActivityType } from 'discord.js';

export function createClient({ config, logger }) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });
  client.commands = new Collection();
  client.config = config;
  client.logger = logger;

  client.on('warn', (message) => logger.warn('Discord warning', { message }));
  client.on('error', (error) => logger.error('Discord client error', { error: error.message }));
  client.on('shardDisconnect', (event, shardId) =>
    logger.warn('Gateway shard disconnected', { shardId, code: event?.code }),
  );
  client.on('shardReconnecting', (shardId) => logger.info('Gateway shard reconnecting', { shardId }));
  client.on('shardResume', (shardId, replayed) =>
    logger.info('Gateway shard resumed', { shardId, replayed }),
  );
  client.on('shardError', (error, shardId) =>
    logger.error('Gateway shard error', { shardId, error: error.message }),
  );

  return client;
}

export function setPresence(client) {
  client.user?.setPresence({
    status: 'online',
    activities: [{ name: 'the white rabbit // /help', type: ActivityType.Watching }],
  });
}
