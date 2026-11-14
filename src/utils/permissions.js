import { PermissionFlagsBits } from 'discord.js';
import { PermissionError } from './errors.js';
import { isSnowflake } from '../config/config.js';

export function resolveAdminRole(guild, adminRoleId) {
  if (!guild || !isSnowflake(adminRoleId)) return null;
  return guild.roles.cache.get(adminRoleId) ?? null;
}

export function hasAdminAccess(member, adminRoleId) {
  if (!member) return false;
  if (member.id === member.guild?.ownerId) return true;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  const role = resolveAdminRole(member.guild, adminRoleId);
  return Boolean(role && member.roles.cache.has(role.id));
}

export function assertAdmin(member, adminRoleId) {
  if (!hasAdminAccess(member, adminRoleId)) {
    throw new PermissionError('Administrator access required. Your roles were not trusted for this operation.');
  }
}

export function canModerate(member, targetMember) {
  if (!member || !targetMember) return false;
  if (targetMember.id === member.id) return false;
  if (targetMember.id === targetMember.guild.ownerId) return false;
  if (targetMember.user?.bot) return false;
  if (member.id === member.guild.ownerId) return true;
  const moderatorTop = member.roles.highest?.position ?? 0;
  const targetTop = targetMember.roles.highest?.position ?? 0;
  return moderatorTop > targetTop;
}

export function assertModerator(member, permission) {
  if (!member?.permissions?.has(permission)) {
    throw new PermissionError('You lack the required Discord permission for this moderation action.');
  }
}

export function assertModerationTarget(member, targetMember) {
  if (!targetMember) throw new PermissionError('Target member was not found in this server.');
  if (targetMember.user?.bot) throw new PermissionError('Bots cannot be targeted by moderation actions.');
  if (targetMember.id === member.id) throw new PermissionError('You cannot target yourself.');
  if (targetMember.id === targetMember.guild.ownerId) {
    throw new PermissionError('The server owner cannot be moderated by this bot.');
  }
  if (!canModerate(member, targetMember)) {
    throw new PermissionError('Target has an equal or higher role than yours. Hierarchy check failed.');
  }
}

export function assertRoleExists(guild, roleId) {
  if (!isSnowflake(roleId)) throw new PermissionError('Configured administrator role ID is not a valid snowflake.');
  const role = guild?.roles?.cache?.get(roleId);
  if (!role) throw new PermissionError('Configured administrator role does not exist in this server.');
  return role;
}
