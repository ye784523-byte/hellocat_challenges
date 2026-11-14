import { SlashCommandBuilder } from 'discord.js';
import { BRAND, COLORS } from '../../constants/index.js';
import { brandEmbed } from '../../utils/embeds.js';

export default {
  category: 'economy',
  cooldown: 5,
  data: new SlashCommandBuilder().setName('inventory').setDescription('Show your purchased cosmetics.'),
  async execute(interaction, ctx) {
    await interaction.deferReply({ ephemeral: true });
    const inventory = await ctx.services.economyService.inventory(interaction.user.id);
    if (inventory.length === 0) {
      return interaction.editReply({
        embeds: [
          brandEmbed({
            title: '[ HELLO CAT // INVENTORY ]',
            description: 'Inventory empty. Visit `/shop` to acquire cosmetic badges and titles.',
            color: COLORS.muted,
            footer: `${BRAND.footer} • ${BRAND.currency}`,
          }),
        ],
      });
    }
    const fields = inventory.map((item) => ({
      name: item.name,
      value: `Type: **${item.type}** • Cosmetic: ${item.cosmetic}\nAcquired <t:${Math.floor(Date.parse(item.purchasedAt) / 1000)}:R>`,
      inline: true,
    }));
    await interaction.editReply({
      embeds: [
        brandEmbed({
          title: '[ HELLO CAT // INVENTORY ]',
          description: `**${inventory.length}** cosmetic item(s) owned.`,
          color: COLORS.green,
          fields,
          footer: `${BRAND.footer} • ${BRAND.currency}`,
        }),
      ],
    });
  },
};
