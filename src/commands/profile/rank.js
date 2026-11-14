import { SlashCommandBuilder } from 'discord.js';
import { BRAND, COLORS, RANKS } from '../../constants/index.js';
import { brandEmbed, progressBar, formatNumber } from '../../utils/embeds.js';
import { rankForXp } from '../../services/rankingService.js';

export default {
  category: 'profile',
  cooldown: 5,
  data: new SlashCommandBuilder().setName('rank').setDescription('Show your rank and XP progression.'),
  async execute(interaction, ctx) {
    await ctx.services.playerService.ensureUser(interaction.user.id, interaction.user.username);
    const user = await ctx.services.playerService.getUser(interaction.user.id);
    const rank = rankForXp(user?.xp ?? 0);
    const ladder = RANKS.map((entry) =>
      entry.name === rank.name
        ? `**→ ${entry.name}** (${formatNumber(entry.minXp)} XP)`
        : `• ${entry.name} (${formatNumber(entry.minXp)} XP)`,
    ).join('\n');
    await interaction.reply({
      embeds: [
        brandEmbed({
          title: '[ HELLO CAT // RANK TELEMETRY ]',
          description: `Current designation: **${rank.name}**\n${progressBar(
            rank.isMax ? 1 : rank.xpIntoRank,
            rank.isMax ? 1 : Math.max(1, rank.xpIntoRank + rank.xpToNext),
            16,
          )}`,
          color: COLORS.green,
          fields: [
            { name: 'TOTAL XP', value: formatNumber(user?.xp ?? 0), inline: true },
            { name: 'RANK', value: `${rank.index} / ${rank.totalRanks}`, inline: true },
            {
              name: 'NEXT',
              value: rank.next ? `${rank.next.name} — ${formatNumber(rank.xpToNext)} XP` : 'Maximum clearance',
              inline: true,
            },
            { name: 'CLEARANCE LADDER', value: ladder },
          ],
          footer: `${BRAND.footer} • RANK ENGINE`,
        }),
      ],
    });
  },
};
