import { SlashCommandBuilder } from 'discord.js';
import { BRAND, COLORS } from '../../constants/index.js';
import { brandEmbed, formatNumber } from '../../utils/embeds.js';

export default {
  category: 'economy',
  cooldown: 5,
  data: new SlashCommandBuilder().setName('balance').setDescription('Show your CATCOIN balance.'),
  async execute(interaction, ctx) {
    await interaction.deferReply({ ephemeral: true });
    const account = await ctx.services.economyService.getAccount(interaction.user.id);
    const transactions = (account.transactions ?? []).slice(-5).reverse();
    const recent = transactions.length
      ? transactions
          .map((entry) => {
            const sign = entry.type === 'credit' ? '+' : '−';
            return `${sign}${formatNumber(entry.amount)} • ${entry.reason} • <t:${Math.floor(Date.parse(entry.at) / 1000)}:R>`;
          })
          .join('\n')
      : 'No transactions recorded.';
    await interaction.editReply({
      embeds: [
        brandEmbed({
          title: '[ HELLO CAT // CATCOIN LEDGER ]',
          description: `**${formatNumber(account.coins)} ${BRAND.currency}**`,
          color: COLORS.green,
          fields: [
            { name: 'OWNER', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'VALUE', value: 'No real-world monetary value', inline: true },
            { name: 'RECENT ACTIVITY', value: recent },
          ],
          footer: `${BRAND.footer} • VIRTUAL ECONOMY`,
        }),
      ],
    });
  },
};
