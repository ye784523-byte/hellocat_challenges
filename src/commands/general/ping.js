import { SlashCommandBuilder } from 'discord.js';
import { BRAND, COLORS } from '../../constants/index.js';
import { brandEmbed } from '../../utils/embeds.js';

export default {
  category: 'general',
  cooldown: 3,
  data: new SlashCommandBuilder().setName('ping').setDescription('Show bot gateway and API latency.'),
  async execute(interaction, ctx) {
    const sent = await interaction.deferReply({ fetchReply: true });
    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    const ws = interaction.client.ws.ping;
    await interaction.editReply({
      embeds: [
        brandEmbed({
          title: '[ HELLO CAT // LINK DIAGNOSTICS ]',
          description: '```\nLINK STATUS : STABLE\n```',
          color: COLORS.green,
          fields: [
            { name: 'ROUNDTRIP', value: `${roundtrip} ms`, inline: true },
            { name: 'WEBSOCKET', value: `${ws} ms`, inline: true },
            { name: 'SHARD', value: String(interaction.guild?.shardId ?? 0), inline: true },
          ],
          footer: `${BRAND.footer} • ${BRAND.version}`,
        }),
      ],
    });
    ctx.logger.debug('Ping measured', { roundtrip, ws });
  },
};
