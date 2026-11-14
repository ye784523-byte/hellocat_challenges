import { SlashCommandBuilder } from 'discord.js';
import { BRAND, COLORS, COMMUNITY_RULES } from '../../constants/index.js';
import { brandEmbed } from '../../utils/embeds.js';

export default {
  category: 'general',
  cooldown: 5,
  data: new SlashCommandBuilder().setName('rules').setDescription('Display the community rules.'),
  async execute(interaction) {
    await interaction.reply({
      embeds: [
        brandEmbed({
          title: '[ HELLO CAT // COMMUNITY PROTOCOL ]',
          description: COMMUNITY_RULES.map((rule, index) => `**${index + 1}.** ${rule}`).join('\n\n'),
          color: COLORS.green,
          footer: `${BRAND.footer} • AUTHORIZED LEARNING ONLY`,
        }),
      ],
    });
  },
};
