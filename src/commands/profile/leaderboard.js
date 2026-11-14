import { SlashCommandBuilder } from 'discord.js';
import { BRAND, COLORS } from '../../constants/index.js';
import { brandEmbed, formatNumber } from '../../utils/embeds.js';
import { paginate, paginationRow } from '../../utils/components.js';

const PAGE_SIZE = 10;

export default {
  category: 'profile',
  cooldown: 8,
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Display the top operators by challenges solved.'),
  async execute(interaction, ctx) {
    await interaction.deferReply();
    const rows = await ctx.services.leaderboardService.entries(100);
    if (rows.length === 0) {
      return interaction.editReply({
        embeds: [
          brandEmbed({
            title: '[ EMPTY LEADERBOARD ]',
            description: 'No operators recorded yet. Capture a challenge in the web terminal to appear here.',
            color: COLORS.muted,
          }),
        ],
      });
    }

    const pages = [];
    for (let offset = 0; offset < rows.length; offset += PAGE_SIZE) {
      const slice = rows.slice(offset, offset + PAGE_SIZE);
      const lines = slice.map((row, index) => {
        const position = offset + index + 1;
        const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `\`#${String(position).padStart(2, '0')}\``;
        return (
          `${medal} **${row.username}** — ${formatNumber(row.solves)} solved\n` +
          `   ↳ ${formatNumber(row.xp)} XP • ${formatNumber(row.coins)} ${BRAND.currency} • ${row.rank.name}`
        );
      });
      pages.push(
        brandEmbed({
          title: '[ HELLO CAT // CHALLENGE LEADERBOARD ]',
          description: lines.join('\n\n'),
          color: COLORS.green,
          fields: [
            { name: 'PAGE', value: `${Math.floor(offset / PAGE_SIZE) + 1} / ${Math.ceil(rows.length / PAGE_SIZE)}`, inline: true },
            { name: 'OPERATORS', value: formatNumber(rows.length), inline: true },
            { name: 'RANKED BY', value: 'Challenges solved', inline: true },
          ],
          footer: `${BRAND.footer} • CHALLENGE LEADERBOARD`,
        }),
      );
    }
    await paginate(interaction, {
      pages,
      componentsFor: (index, total) => [paginationRow(index, total)],
    });
  },
};
