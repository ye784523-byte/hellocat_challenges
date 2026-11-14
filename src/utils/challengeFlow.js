import { BRAND, COLORS } from '../constants/index.js';
import { brandEmbed, errorEmbed, infoEmbed, formatNumber } from './embeds.js';
import { toUserMessage } from './errors.js';

async function nextHintIndex(ctx, userId, challenge) {
  const user = await ctx.storage.usersRepo.get(userId);
  const unlocked = user?.hints?.[challenge.id] ?? [];
  for (let index = 0; index < (challenge.hints?.length ?? 0); index += 1) {
    if (!unlocked.includes(index)) return index;
  }
  return 0;
}

async function respond(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.reply({ ...payload, ephemeral: true });
}

export async function hintFlow(interaction, ctx, challenge, index = null) {
  if (!challenge.hints?.length) {
    return respond(interaction, {
      embeds: [infoEmbed('No hints are available for this challenge.', 'NO INTEL')],
    });
  }
  const hintIndex = index === null ? await nextHintIndex(ctx, interaction.user.id, challenge) : Number(index);
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true }).catch(() => null);
  }
  try {
    const hint = await ctx.services.challengeService.requestHint({
      userId: interaction.user.id,
      challengeId: challenge.id,
      index: hintIndex,
      username: interaction.user.username,
    });
    const fields = [
      { name: 'CHALLENGE', value: `${challenge.id} // ${challenge.title}`, inline: false },
      { name: 'HINT INDEX', value: `${hintIndex + 1} / ${challenge.hints.length}`, inline: true },
      {
        name: 'COST',
        value: hint.cost > 0 ? `${formatNumber(hint.cost)} CATCOINS` : 'FREE',
        inline: true,
      },
    ];
    if (hint.alreadyUnlocked) fields.push({ name: 'NOTE', value: 'This hint was already unlocked.' });
    return respond(interaction, {
      embeds: [
        brandEmbed({
          title: '[ INTEL FRAGMENT ]',
          description: hint.text,
          color: COLORS.info,
          fields,
          footer: BRAND.footer,
        }),
      ],
    });
  } catch (error) {
    ctx.logger.warn('Hint request failed', {
      userId: interaction.user.id,
      challengeId: challenge.id,
      error: error.message,
    });
    return respond(interaction, { embeds: [errorEmbed(toUserMessage(error))] });
  }
}

