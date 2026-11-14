import { SlashCommandBuilder } from 'discord.js';
import { BRAND, COLORS, SHOP_ITEMS } from '../../constants/index.js';
import { brandEmbed, formatNumber } from '../../utils/embeds.js';

export default {
  category: 'economy',
  cooldown: 5,
  data: new SlashCommandBuilder().setName('shop').setDescription('Browse the CATCOIN cosmetic shop.'),
  async execute(interaction, ctx) {
    await interaction.deferReply({ ephemeral: true });
    const account = await ctx.services.economyService.getAccount(interaction.user.id);
    const owned = new Set((account.inventory ?? []).map((item) => item.itemId));
    const fields = SHOP_ITEMS.map((item) => ({
      name: `${owned.has(item.id) ? '✅' : '🛒'} ${item.name} — ${formatNumber(item.price)} ${BRAND.currency}`,
      value: `${item.description}\n\`${item.id}\` • type: ${item.type}${owned.has(item.id) ? ' • OWNED' : ''}`,
    }));
    await interaction.editReply({
      embeds: [
        brandEmbed({
          title: '[ HELLO CAT // BLACK MARKET TERMINAL ]',
          description:
            'Cosmetic goods only. CATCOINS are virtual and cannot be bought, sold, or exchanged for real value.',
          color: COLORS.green,
          fields,
          footer: `${BRAND.footer} • BALANCE ${formatNumber(account.coins)} ${BRAND.currency}`,
        }),
      ],
    });
  },
};
