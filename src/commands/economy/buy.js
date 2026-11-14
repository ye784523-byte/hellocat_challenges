import { SlashCommandBuilder } from 'discord.js';
import { BRAND, SHOP_ITEMS } from '../../constants/index.js';
import { successEmbed, errorEmbed, formatNumber } from '../../utils/embeds.js';
import { toUserMessage } from '../../utils/errors.js';

export default {
  category: 'economy',
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Purchase a cosmetic item with CATCOINS.')
    .addStringOption((option) =>
      option
        .setName('item')
        .setDescription('Shop item ID.')
        .setRequired(true)
        .setAutocomplete(true),
    ),
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      SHOP_ITEMS.filter(
        (item) =>
          item.id.includes(focused) ||
          item.name.toLowerCase().includes(focused) ||
          item.type.includes(focused),
      )
        .slice(0, 25)
        .map((item) => ({ name: `${item.name} — ${item.price} CATCOINS`, value: item.id })),
    );
  },
  async execute(interaction, ctx) {
    const itemId = interaction.options.getString('item');
    await interaction.deferReply({ ephemeral: true });
    try {
      const { item, account } = await ctx.services.economyService.purchase(interaction.user.id, itemId);
      await ctx.storage.auditRepo.append({
        action: 'economy.purchase',
        actorId: interaction.user.id,
        itemId: item.id,
        price: item.price,
      });
      await interaction.editReply({
        embeds: [
          successEmbed(
            [
              `Purchased **${item.name}** for **${formatNumber(item.price)} ${BRAND.currency}**.`,
              '',
              `New balance: **${formatNumber(account.coins)} ${BRAND.currency}**`,
              'The cosmetic is now available in `/inventory`.',
            ].join('\n'),
            'TRANSACTION COMPLETE',
          ),
        ],
      });
    } catch (error) {
      ctx.logger.warn('Purchase failed', { userId: interaction.user.id, itemId, error: error.message });
      await interaction.editReply({ embeds: [errorEmbed(toUserMessage(error))] });
    }
  },
};
