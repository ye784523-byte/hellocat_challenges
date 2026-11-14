import { EmbedBuilder } from 'discord.js';
import { BRAND, COLORS } from '../constants/index.js';

export function brandEmbed({ title, description, color = COLORS.green, fields = [], footer } = {}) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: footer ?? BRAND.footer });
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (fields.length > 0) embed.addFields(fields);
  return embed;
}

export function terminalEmbed({ title, description, color = COLORS.green, fields = [] } = {}) {
  return brandEmbed({
    title: title ? `\`\`\`\n${title}\n\`\`\`` : undefined,
    description,
    color,
    fields,
    footer: `${BRAND.footer} • ${BRAND.tagline}`,
  });
}

export function successEmbed(description, title = 'OPERATION COMPLETE') {
  return brandEmbed({ title: `[ ${title} ]`, description, color: COLORS.green });
}

export function errorEmbed(description, title = 'OPERATION FAILED') {
  return brandEmbed({ title: `[ ${title} ]`, description, color: COLORS.danger });
}

export function warningEmbed(description, title = 'CAUTION') {
  return brandEmbed({ title: `[ ${title} ]`, description, color: COLORS.warning });
}

export function infoEmbed(description, title = 'INFORMATION') {
  return brandEmbed({ title: `[ ${title} ]`, description, color: COLORS.info });
}

export function progressBar(current, total, size = 12) {
  if (total <= 0) return `${'▰'.repeat(size)} 100%`;
  const ratio = Math.max(0, Math.min(1, current / total));
  const filled = Math.round(ratio * size);
  return `${'▰'.repeat(filled)}${'▱'.repeat(size - filled)} ${Math.round(ratio * 100)}%`;
}

export function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value) || 0);
}

export function truncate(value, max = 1024) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function codeBlock(value, language = '') {
  return `\`\`\`${language}\n${String(value ?? '')}\n\`\`\``;
}
