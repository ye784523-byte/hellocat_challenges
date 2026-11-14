import { SlashCommandBuilder } from 'discord.js';
import { BRAND, COLORS } from '../../constants/index.js';
import { brandEmbed } from '../../utils/embeds.js';

export default {
  category: 'profile',
  cooldown: 5,
  data: new SlashCommandBuilder().setName('streak').setDescription('Show your daily activity streak.'),
  async execute(interaction, ctx) {
    await ctx.services.playerService.ensureUser(interaction.user.id, interaction.user.username);
    const user = await ctx.services.playerService.getUser(interaction.user.id);
    const streak = user?.streak ?? { current: 0, longest: 0, total: 0, lastDate: null };
    const daily = await ctx.services.dailyService.status(interaction.user.id).catch(() => null);
    const visual = `${'🔥'.repeat(Math.min(10, streak.current))}${'▫️'.repeat(Math.max(0, 10 - streak.current))}`;
    await interaction.reply({
      embeds: [
        brandEmbed({
          title: '[ HELLO CAT // DAILY OPERATIONS ]',
          description: `**${streak.current} day streak**\n${visual}`,
          color: COLORS.green,
          fields: [
            { name: 'LONGEST', value: `${streak.longest} days`, inline: true },
            { name: 'TOTAL DAILIES', value: String(streak.total ?? 0), inline: true },
            { name: 'LAST COMPLETION', value: streak.lastDate ?? 'Never', inline: true },
            {
              name: 'TODAY',
              value: daily?.completed ? '✅ Daily operation completed' : '⏳ Daily operation pending — use `/daily`',
            },
          ],
          footer: `${BRAND.footer} • STREAK TRACKER`,
        }),
      ],
      ephemeral: true,
    });
  },
};
