import { GatewayIntentBits } from 'discord.js';
import { setPresence } from '../client.js';
import { resolveAdminRole } from '../utils/permissions.js';

/** Privileged intent flags that Discord reports on the application object. */
const APPLICATION_FLAG_GUILD_MEMBERS = 1 << 19;
const APPLICATION_FLAG_MESSAGE_CONTENT = 1 << 20;

export default {
  name: 'ready',
  once: true,
  async execute(client, ctx) {
    ctx.logger.info('Gateway connected', {
      user: client.user?.tag,
      guilds: client.guilds.cache.size,
    });
    setPresence(client);

    const flags = client.application?.flags ?? 0;
    if (!client.options.intents.has(GatewayIntentBits.MessageContent) || !(flags & APPLICATION_FLAG_MESSAGE_CONTENT)) {
      ctx.logger.warn(
        'Message Content intent is not enabled in the Discord developer portal; message text is not delivered, so keyword detection and duplicate detection stay inactive.',
        { stage: 'intents' },
      );
    }
    if (
      client.options.intents.has(GatewayIntentBits.GuildMembers) &&
      !(flags & APPLICATION_FLAG_GUILD_MEMBERS)
    ) {
      ctx.logger.warn(
        'Server Members intent is not enabled in the Discord developer portal; member join events will not be delivered.',
        { stage: 'intents' },
      );
    }

    if (ctx.config.ADMIN_ROLE_ID && ctx.config.GUILD_ID) {
      const guild = client.guilds.cache.get(ctx.config.GUILD_ID);
      const role = guild ? resolveAdminRole(guild, ctx.config.ADMIN_ROLE_ID) : null;
      if (!role) {
        ctx.logger.warn('Configured ADMIN_ROLE_ID was not found in the guild; role-based admin access is unavailable.', {
          guildId: ctx.config.GUILD_ID,
        });
      } else {
        ctx.logger.info('Administrator role validated', { role: role.name, guild: guild.name });
      }
    }
  },
};
