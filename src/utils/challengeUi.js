import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { BRAND, DIFFICULTY_COLORS, COLORS } from '../constants/index.js';
import { brandEmbed, truncate } from './embeds.js';
import { errorEmbed, progressBar } from './embeds.js';

export function challengeEmbed(challenge, { showStats = false, webUrl = '', locked = false, missing = [] } = {}) {
  const prerequisites = challenge.prerequisites ?? [];
  const fields = [
    { name: 'ID', value: `\`${challenge.id}\``, inline: true },
    { name: 'CATEGORY', value: challenge.category.toUpperCase(), inline: true },
    { name: 'DIFFICULTY', value: challenge.difficulty.toUpperCase(), inline: true },
    { name: 'REWARD', value: `${challenge.xp} XP`, inline: true },
    {
      name: 'ATTEMPTS',
      value: challenge.maxAttempts ? `${challenge.maxAttempts} max` : 'Unlimited',
      inline: true,
    },
    { name: 'HINTS', value: `${challenge.hints?.length ?? 0} available`, inline: true },
    { name: 'DESCRIPTION', value: truncate(challenge.description, 1024) },
    { name: 'OBJECTIVE', value: truncate(challenge.objective, 500) },
  ];
  if (prerequisites.length) {
    fields.push({
      name: 'REQUIRED FIRST',
      value: prerequisites.map((id) => `\`${id}\``).join(' • '),
      inline: false,
    });
  }
  if (showStats && challenge.stats) {
    fields.push({
      name: 'TELEMETRY',
      value: `Attempts: **${challenge.stats.attempts ?? 0}** • Solves: **${challenge.stats.solves ?? 0}**`,
    });
  }
  if (webUrl) {
    fields.push({
      name: 'SOLVE IT',
      value: `[Open the Hello Cat web terminal](${webUrl}) — the lab loads this challenge automatically.`,
    });
  }
  if (locked) {
    const required = missing.length ? missing : prerequisites;
    fields.push({
      name: 'ACCESS',
      value: `🔒 **LOCKED** — capture ${required.map((id) => `\`${id}\``).join(', ')} first to unlock this challenge.`,
    });
  }
  if (!challenge.active) {
    fields.push({ name: 'STATUS', value: '⚠ INACTIVE / UNPUBLISHED' });
  }
  return brandEmbed({
    title: '[ HELLO CAT // CHALLENGE DATABASE ]',
    description: `**${challenge.title}**\nFlag format: \`${challenge.flagFormat ?? 'HC{...}'}\``,
    color: DIFFICULTY_COLORS[challenge.difficulty] ?? COLORS.green,
    fields,
    footer: `${BRAND.footer} • AUTHOR ${challenge.authorName ?? 'UNKNOWN'}`,
  });
}

/**
 * The challenge controls.
 *
 * Flag submission lives in the web terminal, so the primary action is a link
 * that opens the challenge there. Hints stay in the channel.
 */
export function challengeActionRow(challenge, { webUrl = '', locked = false } = {}) {
  const buttons = [];
  if (webUrl && !locked) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('SOLVE IN WEB TERMINAL')
        .setStyle(ButtonStyle.Link)
        .setURL(webUrl),
    );
  }
  if (locked) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`challenge:locked:${challenge.id}`)
        .setLabel('LOCKED')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );
  }
  buttons.push(
    new ButtonBuilder()
      .setCustomId(`challenge:hint:${challenge.id}`)
      .setLabel('REQUEST HINT')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!challenge.hints?.length || locked),
    new ButtonBuilder()
      .setCustomId('challenge:close')
      .setLabel('CLOSE')
      .setStyle(ButtonStyle.Danger),
  );
  return new ActionRowBuilder().addComponents(...buttons);
}

export async function challengeActions(interaction, ctx, challenge, { extraDescription = '', webUrl = '', locked = false, missing = [] } = {}) {
  const payload = {
    embeds: [challengeEmbed(challenge, { webUrl, locked, missing })],
    components: [challengeActionRow(challenge, { webUrl, locked })],
    ephemeral: true,
  };
  if (extraDescription) payload.embeds[0].setDescription(`${extraDescription}\n\n${payload.embeds[0].data.description ?? ''}`);
  await interaction.reply(payload);
  const message = await interaction.fetchReply();
  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 5 * 60_000,
    filter: (button) => button.user.id === interaction.user.id,
  });

  collector.on('collect', async (button) => {
    try {
      if (button.customId === 'challenge:close') {
        collector.stop('closed');
        await button.update({ components: [] });
        return;
      }
      if (button.customId === `challenge:hint:${challenge.id}`) {
        const { hintFlow } = await import('./challengeFlow.js');
        await hintFlow(button, ctx, challenge);
      }
    } catch (error) {
      ctx.logger.error('Challenge action failed', { error: error.message });
      if (!button.replied && !button.deferred) {
        await button.reply({ embeds: [errorEmbed('The operation could not be completed.')], ephemeral: true });
      }
    }
  });

  collector.on('end', async () => {
    try {
      await interaction.editReply({ components: [] });
    } catch {
      /* expired */
    }
  });
}

export function progressText(rank) {
  return `${progressBar(rank.xpIntoRank, rank.minXp + rank.xpIntoRank + (rank.xpToNext || 0), 12)}\n${rank.xpToNext > 0 ? `${rank.xpToNext} XP to **${rank.next.name}**` : 'Maximum rank reached.'}`;
}
