import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { BRAND, COLORS } from '../../constants/index.js';
import { brandEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { parseDuration } from '../../utils/time.js';
import {
  assertModerationTarget,
  assertModerator,
} from '../../utils/permissions.js';
import { toUserMessage } from '../../utils/errors.js';

async function resolveMember(guild, userId) {
  return guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
}

export default {
  category: 'moderation',
  cooldown: 3,
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Moderation operations for authorized staff.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('warn')
        .setDescription('Record a formal warning.')
        .addUserOption((option) => option.setName('target').setDescription('Member to warn.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason.').setRequired(true).setMaxLength(500)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('timeout')
        .setDescription('Timeout a member.')
        .addUserOption((option) => option.setName('target').setDescription('Member to timeout.').setRequired(true))
        .addStringOption((option) =>
          option.setName('duration').setDescription('Duration, e.g. 10m, 2h, 1d (max 28d).').setRequired(true),
        )
        .addStringOption((option) => option.setName('reason').setDescription('Reason.').setRequired(true).setMaxLength(500)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('kick')
        .setDescription('Kick a member.')
        .addUserOption((option) => option.setName('target').setDescription('Member to kick.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason.').setRequired(true).setMaxLength(500)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('ban')
        .setDescription('Ban a member.')
        .addUserOption((option) => option.setName('target').setDescription('Member to ban.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason.').setRequired(true).setMaxLength(500)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('clear')
        .setDescription('Bulk delete recent messages in this channel.')
        .addIntegerOption((option) =>
          option.setName('count').setDescription('Number of messages (1-100).').setRequired(true).setMinValue(1).setMaxValue(100),
        )
        .addStringOption((option) => option.setName('reason').setDescription('Reason.').setRequired(true).setMaxLength(500)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('report')
        .setDescription('Confidentially report a user to staff.')
        .addUserOption((option) => option.setName('target').setDescription('User to report.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason.').setRequired(true).setMaxLength(500))
        .addStringOption((option) =>
          option.setName('evidence').setDescription('Optional evidence details.').setMaxLength(1000),
        ),
    ),

  async execute(interaction, ctx) {
    if (!interaction.guild) {
      return interaction.reply({ content: 'Moderation is only available inside a server.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const subcommand = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason') ?? 'No reason provided.';
    const member = interaction.member;

    try {
      if (subcommand === 'report') {
        if (targetUser.id === interaction.user.id) throw new Error('You cannot report yourself.');
        if (targetUser.bot) throw new Error('Bots cannot be reported through this command.');
        const moderationCase = await ctx.services.moderationService.report({
          guild: interaction.guild,
          reporter: interaction.user,
          targetId: targetUser.id,
          reason,
          evidence: interaction.options.getString('evidence') ?? '',
        });
        return interaction.editReply({
          embeds: [
            successEmbed(
              `Report filed as **${moderationCase.id}**. Staff will review it confidentially.`,
              'REPORT RECEIVED',
            ),
          ],
        });
      }

      const targetMember = await resolveMember(interaction.guild, targetUser.id);
      if (!targetMember) {
        return interaction.editReply({ embeds: [errorEmbed('Target member was not found in this server.')] });
      }

      if (subcommand === 'warn') {
        assertModerator(member, PermissionFlagsBits.ModerateMembers);
        assertModerationTarget(member, targetMember);
        const moderationCase = await ctx.services.moderationService.warn({
          guild: interaction.guild,
          moderator: interaction.user,
          targetMember,
          reason,
        });
        return interaction.editReply({
          embeds: [
            successEmbed(`Warning recorded as **${moderationCase.id}** for <@${targetMember.id}>.`, 'WARNING LOGGED'),
          ],
        });
      }

      if (subcommand === 'timeout') {
        assertModerator(member, PermissionFlagsBits.ModerateMembers);
        assertModerationTarget(member, targetMember);
        const durationMs = parseDuration(interaction.options.getString('duration'));
        if (!durationMs) throw new Error('Invalid duration. Use formats like 30s, 10m, 2h or 1d (max 28d).');
        const moderationCase = await ctx.services.moderationService.timeout({
          guild: interaction.guild,
          moderator: interaction.user,
          targetMember,
          durationMs,
          reason,
        });
        return interaction.editReply({
          embeds: [
            successEmbed(
              `<@${targetMember.id}> timed out. Case **${moderationCase.id}**.`,
              'TIMEOUT APPLIED',
            ),
          ],
        });
      }

      if (subcommand === 'kick') {
        assertModerator(member, PermissionFlagsBits.KickMembers);
        assertModerationTarget(member, targetMember);
        const moderationCase = await ctx.services.moderationService.kick({
          guild: interaction.guild,
          moderator: interaction.user,
          targetMember,
          reason,
        });
        return interaction.editReply({
          embeds: [
            successEmbed(`<@${targetUser.id}> kicked. Case **${moderationCase.id}**.`, 'MEMBER REMOVED'),
          ],
        });
      }

      if (subcommand === 'ban') {
        assertModerator(member, PermissionFlagsBits.BanMembers);
        assertModerationTarget(member, targetMember);
        const moderationCase = await ctx.services.moderationService.ban({
          guild: interaction.guild,
          moderator: interaction.user,
          targetMember,
          reason,
        });
        return interaction.editReply({
          embeds: [
            successEmbed(`<@${targetUser.id}> banned. Case **${moderationCase.id}**.`, 'BAN ENFORCED'),
          ],
        });
      }

      if (subcommand === 'clear') {
        assertModerator(member, PermissionFlagsBits.ManageMessages);
        const count = interaction.options.getInteger('count');
        const result = await ctx.services.moderationService.clear({
          guild: interaction.guild,
          moderator: interaction.user,
          channel: interaction.channel,
          count,
          reason,
        });
        return interaction.editReply({
          embeds: [
            brandEmbed({
              title: '[ CHANNEL SANITIZED ]',
              description: `Deleted **${result.deleted}** message(s).\nCase: **${result.case.id}**`,
              color: COLORS.green,
              footer: `${BRAND.footer} • MODERATION`,
            }),
          ],
        });
      }

      return interaction.editReply({ embeds: [errorEmbed('Unknown moderation operation.')] });
    } catch (error) {
      ctx.logger.warn('Moderation action failed', {
        subcommand,
        moderatorId: interaction.user.id,
        error: error.message,
      });
      return interaction.editReply({ embeds: [errorEmbed(toUserMessage(error))] });
    }
  },
};
