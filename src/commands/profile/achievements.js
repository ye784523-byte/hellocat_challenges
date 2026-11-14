import { SlashCommandBuilder } from 'discord.js';
import { BRAND, COLORS } from '../../constants/index.js';
import { brandEmbed } from '../../utils/embeds.js';

export default {
  category: 'profile',
  cooldown: 5,
  data: new SlashCommandBuilder().setName('achievements').setDescription('Show your unlocked achievements.'),
  async execute(interaction, ctx) {
    await ctx.services.playerService.ensureUser(interaction.user.id, interaction.user.username);
    const achievements = await ctx.services.achievementService.listFor(interaction.user.id);
    const unlocked = achievements.filter((achievement) => achievement.unlockedAt);
    const lines = achievements.map((achievement) => {
      if (achievement.unlockedAt) {
        return `${achievement.icon} **${achievement.name}** — unlocked <t:${Math.floor(Date.parse(achievement.unlockedAt) / 1000)}:R>\n> ${achievement.description} (+${achievement.xp} XP)`;
      }
      return `🔒 ~~${achievement.name}~~ — locked\n> ${achievement.description}`;
    });
    await interaction.reply({
      embeds: [
        brandEmbed({
          title: '[ HELLO CAT // ACHIEVEMENT MATRIX ]',
          description: lines.join('\n\n'),
          color: COLORS.green,
          fields: [
            { name: 'UNLOCKED', value: `${unlocked.length} / ${achievements.length}`, inline: true },
          ],
          footer: `${BRAND.footer} • OPERATOR ACCOMPLISHMENTS`,
        }),
      ],
      ephemeral: true,
    });
  },
};
