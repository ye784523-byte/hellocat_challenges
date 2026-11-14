import { SlashCommandBuilder } from 'discord.js';
import { BRAND, COLORS } from '../../constants/index.js';
import { brandEmbed } from '../../utils/embeds.js';

export default {
  category: 'ctf',
  cooldown: 5,
  data: new SlashCommandBuilder().setName('categories').setDescription('Show challenge categories and active counts.'),
  async execute(interaction, ctx) {
    const categories = await ctx.services.challengeService.categories();
    await interaction.reply({
      embeds: [
        brandEmbed({
          title: '[ HELLO CAT // CHALLENGE TAXONOMY ]',
          description: categories
            .map((category) => `**${category.name}** — ${category.count} active challenge(s)`)
            .join('\n'),
          color: COLORS.green,
          footer: `${BRAND.footer} • USE /challenge browse CATEGORY:<name>`,
        }),
      ],
    });
  },
};
