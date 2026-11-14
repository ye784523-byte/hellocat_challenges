import { SlashCommandBuilder } from 'discord.js';
import { BRAND, COLORS } from '../../constants/index.js';
import { brandEmbed } from '../../utils/embeds.js';

export default {
  category: 'general',
  cooldown: 5,
  data: new SlashCommandBuilder().setName('about').setDescription('Information about the Hello Cat bot.'),
  async execute(interaction) {
    await interaction.reply({
      embeds: [
        brandEmbed({
          title: '[ HELLO CAT // SYSTEM IDENTITY ]',
          description:
            'A cybersecurity operations terminal for Discord communities.\n\n' +
            '> *The white rabbit left a trail. The black cat reads it.*\n\n' +
            'Hello Cat provides authorized, fictional CTF challenges, training simulations, ' +
            'operator progression and lightweight community automation.',
          color: COLORS.green,
          fields: [
            { name: 'VERSION', value: BRAND.version, inline: true },
            { name: 'RUNTIME', value: `Node.js ${process.version}`, inline: true },
            { name: 'LIBRARY', value: 'discord.js v14', inline: true },
            { name: 'CURRENCY', value: `${BRAND.currency} (no real-world value)`, inline: false },
            {
              name: 'ETHICS',
              value:
                'All scenarios are fictional and educational. No challenge targets real third-party systems. ' +
                'The bot never executes host shell commands from Discord input.',
            },
          ],
          footer: `${BRAND.footer} • ${BRAND.tagline}`,
        }),
      ],
    });
  },
};
