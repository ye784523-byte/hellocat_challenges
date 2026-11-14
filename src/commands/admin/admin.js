import crypto from 'node:crypto';
import path from 'node:path';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  SlashCommandBuilder,
  TextInputStyle,
} from 'discord.js';
import { BRAND, CATEGORIES, COLORS, DIFFICULTIES } from '../../constants/index.js';
import { brandEmbed, errorEmbed, successEmbed, formatNumber, infoEmbed } from '../../utils/embeds.js';
import { awaitModal, modal, textInput, paginate, paginationRow } from '../../utils/components.js';
import { assertAdmin } from '../../utils/permissions.js';
import { toUserMessage } from '../../utils/errors.js';
import { createBackup } from '../../utils/backup.js';
import { rankForXp } from '../../services/rankingService.js';


function parseHints(text) {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((line) => {
      const match = /^(\d{1,4})\s*\|\s*(.+)$/.exec(line);
      if (match) return { cost: Number(match[1]), text: match[2].trim() };
      return { text: line, cost: 0 };
    });
}

async function adminAutocomplete(interaction, ctx) {
  const focused = interaction.options.getFocused().toLowerCase();
  const challenges = await ctx.services.challengeService.list({ includeInactive: true });
  await interaction.respond(
    challenges
      .filter(
        (challenge) =>
          challenge.id.toLowerCase().includes(focused) ||
          challenge.title.toLowerCase().includes(focused),
      )
      .slice(0, 25)
      .map((challenge) => ({
        name: `${challenge.id} // ${challenge.title} [${challenge.active ? 'ACTIVE' : 'OFFLINE'}]`,
        value: challenge.id,
      })),
  );
}

async function confirmDestructive(interaction, { title, description }) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('confirm:yes').setLabel('CONFIRM').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('confirm:no').setLabel('CANCEL').setStyle(ButtonStyle.Secondary),
  );
  await interaction.reply({
    embeds: [
      brandEmbed({
        title: `[ ⚠ ${title} ]`,
        description,
        color: COLORS.warning,
        footer: `${BRAND.footer} • CONFIRMATION REQUIRED`,
      }),
    ],
    components: [row],
    ephemeral: true,
  });
  const message = await interaction.fetchReply();
  try {
    const button = await message.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: 60_000,
      filter: (component) => component.user.id === interaction.user.id,
    });
    if (button.customId !== 'confirm:yes') {
      await button.update({ embeds: [infoEmbed('Operation cancelled.')], components: [] });
      return false;
    }
    await button.deferUpdate();
    return true;
  } catch {
    await interaction.editReply({ embeds: [infoEmbed('Confirmation window expired.')], components: [] }).catch(() => null);
    return false;
  }
}

async function audit(ctx, entry) {
  return ctx.storage.auditRepo.append(entry);
}

export default {
  category: 'admin',
  adminOnly: true,
  cooldown: 2,
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Administrator control terminal.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('challenge-create')
        .setDescription('Create a challenge using a secure modal.')
        .addStringOption((option) =>
          option.setName('category').setDescription('Challenge category.').setRequired(true)
            .addChoices(...CATEGORIES.map((value) => ({ name: value, value }))),
        )
        .addStringOption((option) =>
          option.setName('difficulty').setDescription('Difficulty tier.').setRequired(true)
            .addChoices(...DIFFICULTIES.map((value) => ({ name: value, value }))),
        )
        .addIntegerOption((option) =>
          option.setName('xp').setDescription('XP reward (1-10000).').setRequired(true).setMinValue(1).setMaxValue(10000),
        )
        .addIntegerOption((option) =>
          option.setName('max-attempts').setDescription('Optional submission attempt limit.').setMinValue(1).setMaxValue(100),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('challenge-edit')
        .setDescription('Edit an existing challenge.')
        .addStringOption((option) =>
          option.setName('id').setDescription('Challenge ID.').setRequired(true).setAutocomplete(true),
        )
        .addStringOption((option) =>
          option.setName('difficulty').setDescription('New difficulty.').addChoices(...DIFFICULTIES.map((value) => ({ name: value, value }))),
        )
        .addStringOption((option) =>
          option.setName('category').setDescription('New category.').addChoices(...CATEGORIES.map((value) => ({ name: value, value }))),
        )
        .addIntegerOption((option) =>
          option.setName('xp').setDescription('New XP reward.').setMinValue(1).setMaxValue(10000),
        )
        .addIntegerOption((option) =>
          option.setName('max-attempts').setDescription('New attempt limit (1-100).').setMinValue(1).setMaxValue(100),
        )
        .addBooleanOption((option) => option.setName('clear-hints').setDescription('Remove all hints.')),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('challenge-delete')
        .setDescription('Delete a challenge (requires confirmation).')
        .addStringOption((option) =>
          option.setName('id').setDescription('Challenge ID.').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('challenge-list')
        .setDescription('List all challenges including unpublished entries.')
        .addBooleanOption((option) => option.setName('active-only').setDescription('Only show active challenges.')),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('challenge-publish')
        .setDescription('Publish and activate a challenge.')
        .addStringOption((option) =>
          option.setName('id').setDescription('Challenge ID.').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('challenge-disable')
        .setDescription('Disable a challenge.')
        .addStringOption((option) =>
          option.setName('id').setDescription('Challenge ID.').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('player-reset')
        .setDescription('Reset an operator profile (requires confirmation).')
        .addUserOption((option) => option.setName('user').setDescription('Operator to reset.').setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('give-xp')
        .setDescription('Grant XP to an operator.')
        .addUserOption((option) => option.setName('user').setDescription('Operator.').setRequired(true))
        .addIntegerOption((option) => option.setName('amount').setDescription('XP amount (1-10000).').setRequired(true).setMinValue(1).setMaxValue(10000))
        .addStringOption((option) => option.setName('reason').setDescription('Reason for audit log.').setMaxLength(300)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove-xp')
        .setDescription('Remove XP from an operator.')
        .addUserOption((option) => option.setName('user').setDescription('Operator.').setRequired(true))
        .addIntegerOption((option) => option.setName('amount').setDescription('XP amount.').setRequired(true).setMinValue(1).setMaxValue(1000000))
        .addStringOption((option) => option.setName('reason').setDescription('Reason for audit log.').setMaxLength(300)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('announce')
        .setDescription('Send an administrator announcement.')
        .addStringOption((option) => option.setName('message').setDescription('Announcement text.').setRequired(true).setMaxLength(2000))
        .addChannelOption((option) => option.setName('channel').setDescription('Target channel (defaults to current).')),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('backup').setDescription('Create a storage backup snapshot.'),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('stats').setDescription('Show platform statistics.'),
    ),
  autocomplete: adminAutocomplete,

  async execute(interaction, ctx) {
    if (!interaction.guild) {
      return interaction.reply({ content: 'Administration is only available inside a server.', ephemeral: true });
    }
    try {
      assertAdmin(interaction.member, ctx.config.ADMIN_ROLE_ID);
    } catch (error) {
      return interaction.reply({ embeds: [errorEmbed(toUserMessage(error))], ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand();
    try {
      if (subcommand === 'challenge-create') return createChallenge(interaction, ctx);
      if (subcommand === 'challenge-edit') return editChallenge(interaction, ctx);
      if (subcommand === 'challenge-delete') return deleteChallenge(interaction, ctx);
      if (subcommand === 'challenge-list') return listChallenges(interaction, ctx);
      if (subcommand === 'challenge-publish') return publishChallenge(interaction, ctx);
      if (subcommand === 'challenge-disable') return disableChallenge(interaction, ctx);
      if (subcommand === 'player-reset') return resetPlayer(interaction, ctx);
      if (subcommand === 'give-xp') return adjustXp(interaction, ctx, 'give');
      if (subcommand === 'remove-xp') return adjustXp(interaction, ctx, 'remove');
      if (subcommand === 'announce') return announce(interaction, ctx);
      if (subcommand === 'backup') return runBackup(interaction, ctx);
      if (subcommand === 'stats') return platformStats(interaction, ctx);
      return interaction.reply({ embeds: [errorEmbed('Unknown admin operation.')], ephemeral: true });
    } catch (error) {
      ctx.logger.error('Admin command failed', { subcommand, error: error.message, adminId: interaction.user.id });
      const payload = { embeds: [errorEmbed(toUserMessage(error))], ephemeral: true };
      if (interaction.deferred || interaction.replied) return interaction.editReply({ embeds: payload.embeds });
      return interaction.reply(payload);
    }
  },
};

async function createChallenge(interaction, ctx) {
  const category = interaction.options.getString('category');
  const difficulty = interaction.options.getString('difficulty');
  const xp = interaction.options.getInteger('xp');
  const maxAttempts = interaction.options.getInteger('max-attempts');
  const submitted = await awaitModal(
    interaction,
    modal('admin:create-challenge', 'Create Challenge // Secure Form', [
      textInput('title', 'TITLE', { maxLength: 100 }),
      textInput('description', 'DESCRIPTION', { style: TextInputStyle.Paragraph, maxLength: 2000 }),
      textInput('objective', 'OBJECTIVE', { maxLength: 500 }),
      textInput('flag', 'FLAG (SECRET)', { maxLength: 300, placeholder: 'HC{...}' }),
      textInput('hints', 'HINTS (one per line, optional "cost|text")', {
        style: TextInputStyle.Paragraph,
        maxLength: 1500,
        required: false,
      }),
    ]),
  );
  if (!submitted) return null;
  await submitted.deferReply({ ephemeral: true });
  try {
    const challenge = await ctx.services.challengeService.create({
      title: submitted.fields.getTextInputValue('title'),
      description: submitted.fields.getTextInputValue('description'),
      objective: submitted.fields.getTextInputValue('objective'),
      category,
      difficulty,
      xp,
      flag: submitted.fields.getTextInputValue('flag'),
      hints: parseHints(submitted.fields.getTextInputValue('hints')),
      maxAttempts,
      authorId: interaction.user.id,
      authorName: interaction.user.username,
      active: false,
      published: false,
    });
    await audit(ctx, {
      action: 'admin.challenge-create',
      actorId: interaction.user.id,
      challengeId: challenge.id,
      title: challenge.title,
    });
    return submitted.editReply({
      embeds: [
        successEmbed(
          `Challenge **${challenge.id}** created in draft state.\nPublish it with \`/admin challenge-publish id:${challenge.id}\`.\nThe flag was hashed and is not stored in plaintext.`,
          'CHALLENGE STORED',
        ),
      ],
    });
  } catch (error) {
    ctx.logger.warn('Challenge creation failed', { error: error.message, adminId: interaction.user.id });
    return submitted.editReply({ embeds: [errorEmbed(toUserMessage(error))] });
  }
}

async function editChallenge(interaction, ctx) {
  const id = interaction.options.getString('id').toUpperCase();
  const existing = await ctx.services.challengeService.getRaw(id);
  if (!existing) throw new Error('Challenge not found.');
  const difficulty = interaction.options.getString('difficulty');
  const category = interaction.options.getString('category');
  const xp = interaction.options.getInteger('xp');
  const maxAttempts = interaction.options.getInteger('max-attempts');
  const clearHints = interaction.options.getBoolean('clear-hints') ?? false;

  const submitted = await awaitModal(
    interaction,
    modal(`admin:edit-challenge:${id}`, `Edit ${id} // Empty fields unchanged`, [
      textInput('title', 'TITLE', { maxLength: 100, required: false, value: existing.title }),
      textInput('description', 'DESCRIPTION', {
        style: TextInputStyle.Paragraph,
        maxLength: 2000,
        required: false,
        value: existing.description,
      }),
      textInput('objective', 'OBJECTIVE', { maxLength: 500, required: false, value: existing.objective }),
      textInput('flag', 'NEW FLAG (optional)', { maxLength: 300, required: false }),
      textInput('hints', 'HINTS (one per line; optional)', {
        style: TextInputStyle.Paragraph,
        maxLength: 1500,
        required: false,
        value: (existing.hints ?? []).map((hint) => (hint.cost ? `${hint.cost}|${hint.text}` : hint.text)).join('\n').slice(0, 1500),
      }),
    ]),
  );
  if (!submitted) return null;
  await submitted.deferReply({ ephemeral: true });

  try {
    const patch = {};
    const title = submitted.fields.getTextInputValue('title').trim();
    const description = submitted.fields.getTextInputValue('description').trim();
    const objective = submitted.fields.getTextInputValue('objective').trim();
    const flag = submitted.fields.getTextInputValue('flag').trim();
    const hintsRaw = submitted.fields.getTextInputValue('hints').trim();
    if (title && title !== existing.title) patch.title = title;
    if (description && description !== existing.description) patch.description = description;
    if (objective && objective !== existing.objective) patch.objective = objective;
    if (flag) patch.flag = flag;
    if (hintsRaw) patch.hints = parseHints(hintsRaw);
    if (clearHints) patch.hints = [];
    if (difficulty && difficulty !== existing.difficulty) patch.difficulty = difficulty;
    if (category && category !== existing.category) patch.category = category;
    if (xp && xp !== existing.xp) patch.xp = xp;
    if (maxAttempts !== null && maxAttempts !== existing.maxAttempts) patch.maxAttempts = maxAttempts;

    if (Object.keys(patch).length === 0) {
      return submitted.editReply({ embeds: [infoEmbed('No changes were applied.')] });
    }

    const updated = await ctx.services.challengeService.edit(id, patch);
    await audit(ctx, {
      action: 'admin.challenge-edit',
      actorId: interaction.user.id,
      challengeId: id,
      fields: Object.keys(patch),
    });
    return submitted.editReply({
      embeds: [successEmbed(`Challenge **${updated.id}** updated. Fields: ${Object.keys(patch).join(', ')}.`, 'CHALLENGE UPDATED')],
    });
  } catch (error) {
    ctx.logger.warn('Challenge edit failed', { challengeId: id, error: error.message, adminId: interaction.user.id });
    return submitted.editReply({ embeds: [errorEmbed(toUserMessage(error))] });
  }
}

async function deleteChallenge(interaction, ctx) {
  const id = interaction.options.getString('id').toUpperCase();
  const challenge = await ctx.services.challengeService.getRaw(id);
  if (!challenge) throw new Error('Challenge not found.');
  const confirmed = await confirmDestructive(interaction, {
    title: 'DELETE CHALLENGE',
    description: `Permanently delete **${challenge.id} — ${challenge.title}**?\nSubmission history is retained for audit purposes.`,
  });
  if (!confirmed) return;
  await ctx.services.challengeService.delete(id);
  await audit(ctx, {
    action: 'admin.challenge-delete',
    actorId: interaction.user.id,
    challengeId: id,
    title: challenge.title,
  });
  return interaction.editReply({ embeds: [successEmbed(`Challenge **${id}** deleted.`, 'CHALLENGE PURGED')] });
}

async function listChallenges(interaction, ctx) {
  const activeOnly = interaction.options.getBoolean('active-only') ?? false;
  await interaction.deferReply({ ephemeral: true });
  const challenges = await ctx.services.challengeService.list({ includeInactive: !activeOnly });
  if (challenges.length === 0) {
    return interaction.editReply({ embeds: [infoEmbed('No challenges found.')] });
  }
  const pageSize = 8;
  const pages = [];
  for (let offset = 0; offset < challenges.length; offset += pageSize) {
    const slice = challenges.slice(offset, offset + pageSize);
    pages.push(
      brandEmbed({
        title: '[ ADMIN // CHALLENGE DATABASE ]',
        description: slice
          .map(
            (challenge) =>
              `\`${challenge.id}\` **${challenge.title}**\n${challenge.active ? '🟢 ACTIVE' : '🔴 OFFLINE'} • ${challenge.published ? 'PUBLISHED' : 'DRAFT'} • ${challenge.category} • ${challenge.difficulty} • ${challenge.xp} XP`,
          )
          .join('\n\n'),
        color: COLORS.green,
        fields: [
          { name: 'TOTAL', value: String(challenges.length), inline: true },
          { name: 'PAGE', value: `${Math.floor(offset / pageSize) + 1} / ${Math.ceil(challenges.length / pageSize)}`, inline: true },
        ],
        footer: `${BRAND.footer} • ADMIN VIEW`,
      }),
    );
  }
  await paginate(interaction, { pages, componentsFor: (index, total) => [paginationRow(index, total)], ephemeral: true });
}

async function publishChallenge(interaction, ctx) {
  const id = interaction.options.getString('id').toUpperCase();
  const challenge = await ctx.services.challengeService.publish(id);
  await audit(ctx, { action: 'admin.challenge-publish', actorId: interaction.user.id, challengeId: id });

  // The channel assistant explains the challenge and links the web terminal.
  const message = await ctx.services.announcementService.announceChallenge(challenge);

  return interaction.reply({
    embeds: [
      successEmbed(
        `Challenge **${challenge.id} — ${challenge.title}** is now active and published.${
          message ? '\nAnnouncement posted to the configured challenge channel.' : ''
        }`,
        'DEPLOYMENT COMPLETE',
      ),
    ],
    ephemeral: true,
  });
}

async function disableChallenge(interaction, ctx) {
  const id = interaction.options.getString('id').toUpperCase();
  const challenge = await ctx.services.challengeService.disable(id);
  await audit(ctx, { action: 'admin.challenge-disable', actorId: interaction.user.id, challengeId: id });
  return interaction.reply({
    embeds: [successEmbed(`Challenge **${challenge.id}** disabled. Existing submissions remain valid.`, 'CHALLENGE OFFLINE')],
    ephemeral: true,
  });
}

async function resetPlayer(interaction, ctx) {
  const target = interaction.options.getUser('user');
  const confirmed = await confirmDestructive(interaction, {
    title: 'RESET OPERATOR',
    description: `Reset **${target.username}**?\nThis clears XP, streak, hints, CATCOINS, inventory and achievements. Submission history is removed.`,
  });
  if (!confirmed) return;
  await ctx.services.playerService.resetPlayer(target.id, { keepUser: true });
  await ctx.storage.economyRepo.delete(target.id);
  await ctx.storage.achievementRepo.deleteUser(target.id);
  await ctx.storage.submissionsRepo.deleteByUser(target.id);
  await audit(ctx, { action: 'admin.player-reset', actorId: interaction.user.id, targetId: target.id });
  return interaction.editReply({
    embeds: [successEmbed(`Operator **${target.username}** reset to zero.`, 'OPERATOR RESET')],
  });
}

async function adjustXp(interaction, ctx, mode) {
  const target = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');
  const reason = interaction.options.getString('reason') ?? 'Administrative adjustment';
  await interaction.deferReply({ ephemeral: true });
  const key = `admin:${mode}:${crypto.randomUUID()}`;
  const result =
    mode === 'give'
      ? await ctx.services.playerService.addXp(target.id, amount, {
          source: 'admin',
          key,
          username: target.username,
          reason,
        })
      : await ctx.services.playerService.removeXp(target.id, amount, { source: 'admin', key });
  const user = await ctx.services.playerService.getUser(target.id);
  const rank = rankForXp(user?.xp ?? 0);
  await audit(ctx, {
    action: `admin.${mode === 'give' ? 'give-xp' : 'remove-xp'}`,
    actorId: interaction.user.id,
    targetId: target.id,
    amount,
    reason,
  });
  return interaction.editReply({
    embeds: [
      successEmbed(
        `**${target.username}** now has **${formatNumber(user?.xp ?? 0)} XP** (${rank.name}).\n${
          mode === 'give' ? `Granted ${formatNumber(amount)} XP.` : `Removed ${formatNumber(result.removed)} XP.`
        }`,
        'XP ADJUSTED',
      ),
    ],
  });
}

async function announce(interaction, ctx) {
  const message = interaction.options.getString('message');
  const channel = interaction.options.getChannel('channel') ?? interaction.channel;
  if (!channel?.isTextBased?.()) throw new Error('Target channel is not text-based.');
  await interaction.deferReply({ ephemeral: true });
  await channel.send({
    embeds: [
      brandEmbed({
        title: '[ HELLO CAT // TRANSMISSION ]',
        description: message,
        color: COLORS.green,
        footer: `${BRAND.footer} • ADMIN BROADCAST`,
        fields: [{ name: 'OPERATOR', value: `<@${interaction.user.id}>` }],
      }),
    ],
  });
  await audit(ctx, {
    action: 'admin.announce',
    actorId: interaction.user.id,
    channelId: channel.id,
    length: message.length,
  });
  return interaction.editReply({
    embeds: [successEmbed(`Announcement transmitted to <#${channel.id}>.`, 'BROADCAST SENT')],
  });
}

async function runBackup(interaction, ctx) {
  await interaction.deferReply({ ephemeral: true });
  const result = await createBackup({
    storage: ctx.storage,
    backupDir: ctx.config.backupDir,
    logger: ctx.logger,
  });
  await audit(ctx, {
    action: 'admin.backup',
    actorId: interaction.user.id,
    directory: path.relative(process.cwd(), result.directory),
    files: result.files.length,
  });
  return interaction.editReply({
    embeds: [
      successEmbed(
        `Backup created with **${result.files.length}** data files.\nPath: \`${path.relative(process.cwd(), result.directory)}\``,
        'BACKUP VERIFIED',
      ),
    ],
  });
}

async function platformStats(interaction, ctx) {
  await interaction.deferReply({ ephemeral: true });
  const [challengeStats, users, submissions, economy, auditCount, moderationCount, gameSessions] = await Promise.all([
    ctx.services.challengeService.stats(),
    ctx.storage.usersRepo.count(),
    ctx.storage.submissionsRepo.all(),
    ctx.storage.economyRepo.all(),
    ctx.storage.auditRepo.count(),
    ctx.storage.moderationRepo.count(),
    Promise.resolve(ctx.services.gameEngine.size),
  ]);
  const totalCoins = economy.reduce((sum, account) => sum + account.coins, 0);
  return interaction.editReply({
    embeds: [
      brandEmbed({
        title: '[ ADMIN // PLATFORM TELEMETRY ]',
        description: '```\nSECURITY OPERATIONS OVERVIEW\n```',
        color: COLORS.green,
        fields: [
          { name: 'OPERATORS', value: formatNumber(users), inline: true },
          { name: 'CHALLENGES', value: `${challengeStats.active} active / ${challengeStats.total}`, inline: true },
          { name: 'ATTEMPTS', value: formatNumber(submissions.length), inline: true },
          { name: 'CAPTURES', value: formatNumber(submissions.filter((entry) => entry.correct).length), inline: true },
          { name: 'CATCOINS SUPPLY', value: formatNumber(totalCoins), inline: true },
          { name: 'AUDIT ENTRIES', value: formatNumber(auditCount), inline: true },
          { name: 'MOD CASES', value: formatNumber(moderationCount), inline: true },
          { name: 'GAME SESSIONS', value: formatNumber(gameSessions), inline: true },
          { name: 'MEMORY', value: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB RSS`, inline: true },
        ],
        footer: `${BRAND.footer} • ADMIN TELEMETRY`,
      }),
    ],
  });
}
