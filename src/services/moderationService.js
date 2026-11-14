import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { COLORS, BRAND } from '../constants/index.js';
import { AppError, ValidationError } from '../utils/errors.js';

function cleanReason(reason) {
  const value = String(reason ?? '').trim();
  if (value.length < 2) throw new ValidationError('A reason of at least 2 characters is required.');
  if (value.length > 500) throw new ValidationError('Reason must be 500 characters or fewer.');
  return value;
}

function friendlyDiscordError(error) {
  if (error?.code === 50013) return 'The bot lacks the Discord permission required for this action.';
  if (error?.code === 50007) return 'Cannot act on that user (they may have DMs disabled or left the server).';
  if (error?.code === 50074) return 'Discord rejected the action: a moderation duration is required.';
  return 'Discord rejected the moderation action. Check role hierarchy and bot permissions.';
}

export class ModerationService {
  constructor({ moderationRepo, auditRepo, logger, logChannelResolver }) {
    this.moderationRepo = moderationRepo;
    this.auditRepo = auditRepo;
    this.logger = logger;
    this.logChannelResolver = logChannelResolver;
  }

  async _sendLog(guild, embed) {
    try {
      const channel = await this.logChannelResolver?.(guild);
      if (channel?.isTextBased?.()) await channel.send({ embeds: [embed] });
    } catch (error) {
      this.logger?.warn('Moderation log delivery failed', { error: error.message });
    }
  }

  async _record({ guild, moderator, targetId, type, reason, extra = {} }) {
    const moderationCase = await this.moderationRepo.add({
      type,
      guildId: guild?.id ?? null,
      moderatorId: moderator.id,
      moderatorTag: moderator.user?.tag ?? moderator.tag ?? moderator.id,
      targetId,
      reason,
      ...extra,
    });

    await this.auditRepo.append({
      action: `mod.${type}`,
      actorId: moderator.id,
      guildId: guild?.id ?? null,
      targetId,
      caseId: moderationCase.id,
      reason,
    });

    this.logger?.info('Moderation action recorded', {
      caseId: moderationCase.id,
      type,
      moderatorId: moderator.id,
      targetId,
    });

    const embed = new EmbedBuilder()
      .setColor(type === 'warn' ? COLORS.warning : COLORS.danger)
      .setTitle(`[ MODERATION // ${type.toUpperCase()} ]`)
      .addFields(
        { name: 'CASE', value: moderationCase.id, inline: true },
        { name: 'MODERATOR', value: `<@${moderator.id}>`, inline: true },
        { name: 'TARGET', value: `<@${targetId}>`, inline: true },
        { name: 'REASON', value: reason },
      )
      .setTimestamp()
      .setFooter({ text: BRAND.footer });

    await this._sendLog(guild, embed);
    return moderationCase;
  }

  async warn({ guild, moderator, targetMember, reason }) {
    const safeReason = cleanReason(reason);
    return this._record({
      guild,
      moderator,
      targetId: targetMember.id,
      type: 'warn',
      reason: safeReason,
    });
  }

  async timeout({ guild, moderator, targetMember, durationMs, reason }) {
    const safeReason = cleanReason(reason);
    if (!Number.isFinite(durationMs) || durationMs < 1000 || durationMs > 28 * 86_400_000) {
      throw new ValidationError('Timeout duration must be between 1 second and 28 days.');
    }
    if (!targetMember.moderatable) {
      throw new AppError('Target is not moderatable by the bot.', {
        userMessage: 'The bot cannot timeout this member. Check role hierarchy.',
      });
    }
    try {
      await targetMember.timeout(durationMs, safeReason);
    } catch (error) {
      throw new AppError('Timeout failed', { userMessage: friendlyDiscordError(error), cause: error });
    }
    return this._record({
      guild,
      moderator,
      targetId: targetMember.id,
      type: 'timeout',
      reason: safeReason,
      extra: { durationMs },
    });
  }

  async kick({ guild, moderator, targetMember, reason }) {
    const safeReason = cleanReason(reason);
    if (!targetMember.kickable) {
      throw new AppError('Target is not kickable.', {
        userMessage: 'The bot cannot kick this member. Check role hierarchy and permissions.',
      });
    }
    try {
      await targetMember.kick(safeReason);
    } catch (error) {
      throw new AppError('Kick failed', { userMessage: friendlyDiscordError(error), cause: error });
    }
    return this._record({
      guild,
      moderator,
      targetId: targetMember.id,
      type: 'kick',
      reason: safeReason,
    });
  }

  async ban({ guild, moderator, targetMember, reason }) {
    const safeReason = cleanReason(reason);
    if (!targetMember.bannable) {
      throw new AppError('Target is not bannable.', {
        userMessage: 'The bot cannot ban this member. Check role hierarchy and permissions.',
      });
    }
    try {
      await guild.members.ban(targetMember.id, { reason: safeReason });
    } catch (error) {
      throw new AppError('Ban failed', { userMessage: friendlyDiscordError(error), cause: error });
    }
    return this._record({
      guild,
      moderator,
      targetId: targetMember.id,
      type: 'ban',
      reason: safeReason,
    });
  }

  async clear({ guild, moderator, channel, count, reason }) {
    const amount = Number(count);
    if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
      throw new ValidationError('Clear count must be an integer between 1 and 100.');
    }
    const safeReason = cleanReason(reason);
    if (!channel?.isTextBased?.()) throw new ValidationError('This channel does not support message clearing.');

    let deleted;
    try {
      deleted = await channel.bulkDelete(amount, true);
    } catch (error) {
      throw new AppError('Clear failed', {
        userMessage: 'Bulk delete failed. Messages older than 14 days cannot be bulk deleted.',
        cause: error,
      });
    }

    const moderationCase = await this._record({
      guild,
      moderator,
      targetId: channel.id,
      type: 'clear',
      reason: safeReason,
      extra: { channelId: channel.id, deleted: deleted.size },
    });
    return { case: moderationCase, deleted: deleted.size };
  }

  async report({ guild, reporter, targetId, reason, evidence = '' }) {
    const safeReason = cleanReason(reason);
    const detail = String(evidence ?? '').slice(0, 1000);
    const moderationCase = await this.moderationRepo.add({
      type: 'report',
      guildId: guild?.id ?? null,
      moderatorId: reporter.id,
      moderatorTag: reporter.tag ?? reporter.user?.tag ?? reporter.id,
      targetId,
      reason: safeReason,
      evidence: detail,
    });
    await this.auditRepo.append({
      action: 'mod.report',
      actorId: reporter.id,
      guildId: guild?.id ?? null,
      targetId,
      caseId: moderationCase.id,
      reason: safeReason,
    });

    const embed = new EmbedBuilder()
      .setColor(COLORS.warning)
      .setTitle('[ INCIDENT REPORT RECEIVED ]')
      .addFields(
        { name: 'CASE', value: moderationCase.id, inline: true },
        { name: 'REPORTER', value: `<@${reporter.id}>`, inline: true },
        { name: 'REPORTED USER', value: `<@${targetId}>`, inline: true },
        { name: 'REASON', value: safeReason },
        { name: 'EVIDENCE', value: detail || 'No additional evidence supplied.' },
      )
      .setTimestamp()
      .setFooter({ text: BRAND.footer });

    await this._sendLog(guild, embed);
    return moderationCase;
  }
}

export const MOD_PERMISSIONS = Object.freeze({
  warn: PermissionFlagsBits.ModerateMembers,
  timeout: PermissionFlagsBits.ModerateMembers,
  kick: PermissionFlagsBits.KickMembers,
  ban: PermissionFlagsBits.BanMembers,
  clear: PermissionFlagsBits.ManageMessages,
});
