import { SlashCommandBuilder } from 'discord.js';
import { BRAND, COLORS } from '../../constants/index.js';
import { brandEmbed, formatNumber } from '../../utils/embeds.js';

export default {
  category: 'general',
  cooldown: 5,
  data: new SlashCommandBuilder().setName('server').setDescription('Show server statistics.'),
  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      return interaction.reply({ content: 'This command is only available inside a server.', ephemeral: true });
    }
    await interaction.deferReply();
    const members = await guild.members.fetch().catch(() => null);
    const humans = members ? members.filter((member) => !member.user.bot).size : guild.memberCount;
    const bots = members ? members.filter((member) => member.user.bot).size : 0;
    const channels = guild.channels.cache;
    await interaction.editReply({
      embeds: [
        brandEmbed({
          title: `[ HELLO CAT // SERVER TELEMETRY ]`,
          description: `**${guild.name}**`,
          color: COLORS.green,
          fields: [
            { name: 'MEMBERS', value: formatNumber(humans), inline: true },
            { name: 'BOTS', value: formatNumber(bots), inline: true },
            { name: 'BOOSTS', value: formatNumber(guild.premiumSubscriptionCount ?? 0), inline: true },
            { name: 'TEXT CHANNELS', value: formatNumber(channels.filter((channel) => channel.isTextBased()).size), inline: true },
            { name: 'VOICE CHANNELS', value: formatNumber(channels.filter((channel) => channel.isVoiceBased()).size), inline: true },
            { name: 'ROLES', value: formatNumber(guild.roles.cache.size), inline: true },
            { name: 'CREATED', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: false },
            { name: 'OWNER', value: `<@${guild.ownerId}>`, inline: true },
            { name: 'ID', value: `\`${guild.id}\``, inline: true },
          ],
          footer: `${BRAND.footer} • SERVER SCAN`,
        }),
      ],
    });
  },
};
