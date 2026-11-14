import { SlashCommandBuilder } from 'discord.js';
import { BRAND, COLORS } from '../../constants/index.js';
import { brandEmbed, progressBar } from '../../utils/embeds.js';

export default {
  category: 'ctf',
  cooldown: 5,
  data: new SlashCommandBuilder().setName('mychallenges').setDescription('Show your personal challenge progress.'),
  async execute(interaction, ctx) {
    await interaction.deferReply({ ephemeral: true });
    const progress = await ctx.services.challengeService.userProgress(interaction.user.id);
    const difficultyLines = Object.entries(progress.byDifficulty).map(([difficulty, data]) => {
      const bar = progressBar(data.solved, Math.max(1, data.total), 10);
      return `**${difficulty}** ${bar}\n${data.solved} / ${data.total} captured`;
    });
    await interaction.editReply({
      embeds: [
        brandEmbed({
          title: '[ HELLO CAT // PERSONAL MISSION PROGRESS ]',
          description: `Active database captures: **${progress.solved} / ${progress.totalActive}**`,
          color: COLORS.green,
          fields: difficultyLines.map((value, index) => ({
            name: `TIER ${index + 1}`,
            value,
            inline: true,
          })),
          footer: `${BRAND.footer} • OPERATOR PROGRESS`,
        }),
      ],
    });
  },
};
