import { Events } from 'discord.js';
import { commandCooldowns } from '../utils/cooldowns.js';
import { assertAdmin } from '../utils/permissions.js';
import { errorEmbed, warningEmbed } from '../utils/embeds.js';
import { durationText } from '../utils/time.js';
import { toUserMessage } from '../utils/errors.js';

const interactionWindow = new Map();

function rateLimited(userId, now = Date.now()) {
  const entry = interactionWindow.get(userId) ?? [];
  const recent = entry.filter((stamp) => now - stamp < 5000);
  recent.push(now);
  interactionWindow.set(userId, recent);
  if (interactionWindow.size > 5000) interactionWindow.clear();
  return recent.length > 15;
}

async function safeReply(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) await interaction.followUp({ ...payload, ephemeral: true });
    else await interaction.reply({ ...payload, ephemeral: true });
  } catch {
    /* interaction expired */
  }
}

export default {
  name: Events.InteractionCreate,
  async execute(interaction, ctx) {
    if (interaction.isAutocomplete()) {
      const command = ctx.client.commands.get(interaction.commandName);
      try {
        if (command?.autocomplete) await command.autocomplete(interaction, ctx);
        else await interaction.respond([]);
      } catch (error) {
        ctx.logger.warn('Autocomplete failed', {
          command: interaction.commandName,
          error: error.message,
        });
        if (!interaction.responded) await interaction.respond([]).catch(() => null);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    const command = ctx.client.commands.get(interaction.commandName);
    if (!command) {
      return safeReply(interaction, { embeds: [errorEmbed('Command is not registered in this runtime.')] });
    }

    if (rateLimited(interaction.user.id)) {
      return safeReply(interaction, {
        embeds: [warningEmbed('Interaction rate limit exceeded. Wait a moment before retrying.', 'RATE LIMIT')],
      });
    }

    try {
      if ((command.category === 'admin' || command.category === 'moderation') && !interaction.inGuild()) {
        return safeReply(interaction, {
          embeds: [errorEmbed('This command is only available inside a server.')],
        });
      }

      if (command.adminOnly) {
        assertAdmin(interaction.member, ctx.config.ADMIN_ROLE_ID);
      }

      if (Array.isArray(command.requiredPermissions) && command.requiredPermissions.length > 0) {
        const missing = command.requiredPermissions.filter(
          (permission) => !interaction.member?.permissions?.has(permission),
        );
        if (missing.length > 0) {
          return safeReply(interaction, {
            embeds: [errorEmbed('You lack the required Discord permissions for this command.')],
          });
        }
      }

      const cooldown = command.cooldown ?? 3;
      const remaining = await commandCooldowns.guard(`${command.data.name}:${interaction.user.id}`, cooldown);
      if (remaining > 0) {
        return safeReply(interaction, {
          embeds: [
            warningEmbed(
              `Cooldown active. Try again in **${durationText(remaining)}**.`,
              'OPERATION THROTTLED',
            ),
          ],
        });
      }

      ctx.logger.info('Command executed', {
        command: interaction.commandName,
        userId: interaction.user.id,
        guildId: interaction.guildId,
      });
      await command.execute(interaction, ctx);
    } catch (error) {
      ctx.logger.error('Command execution failed', {
        command: interaction.commandName,
        userId: interaction.user.id,
        error: error.message,
        stack: error.stack,
      });
      await safeReply(interaction, {
        embeds: [errorEmbed(toUserMessage(error))],
      });
    }
  },
};
