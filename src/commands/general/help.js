import { SlashCommandBuilder } from 'discord.js';
import { BRAND, COLORS } from '../../constants/index.js';
import { brandEmbed } from '../../utils/embeds.js';
import { paginate, paginationRow } from '../../utils/components.js';

const CATEGORY_LABELS = {
  general: 'GENERAL SYSTEMS',
  profile: 'OPERATOR PROFILE',
  ctf: 'CHALLENGE ENGINE',
  tools: 'FIELD TOOLKIT',
  games: 'TRAINING SIMULATIONS',
  economy: 'CATCOIN ECONOMY',
  moderation: 'MODERATION',
  admin: 'ADMIN CONTROL',
};

export default {
  category: 'general',
  cooldown: 5,
  data: new SlashCommandBuilder().setName('help').setDescription('List available Hello Cat commands.'),
  async execute(interaction, ctx) {
    const grouped = new Map();
    for (const command of ctx.client.commands.values()) {
      const category = command.category ?? 'general';
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category).push(command);
    }

    const order = ['general', 'profile', 'ctf', 'tools', 'games', 'economy', 'moderation', 'admin'];
    const pages = [];
    for (const category of order) {
      const commands = (grouped.get(category) ?? []).sort((a, b) =>
        a.data.name.localeCompare(b.data.name),
      );
      if (commands.length === 0) continue;
      const lines = commands.map((command) => {
        const subcommands = command.data.options?.filter((option) => option.type === 1) ?? [];
        if (subcommands.length > 0) {
          return `\`/${command.data.name}\` — ${command.data.description}\n${subcommands
            .map((sub) => `  ↳ \`${command.data.name} ${sub.name}\` ${sub.description}`)
            .join('\n')}`;
        }
        return `\`/${command.data.name}\` — ${command.data.description}`;
      });
      pages.push(
        brandEmbed({
          title: `[ HELLO CAT // ${CATEGORY_LABELS[category] ?? category.toUpperCase()} ]`,
          description: lines.join('\n\n'),
          color: COLORS.green,
          fields: [
            { name: 'CATEGORY', value: `${order.indexOf(category) + 1} / ${order.length}`, inline: true },
            { name: 'COMMANDS', value: String(commands.length), inline: true },
          ],
          footer: `${BRAND.footer} • HELP INDEX`,
        }),
      );
    }

    if (pages.length === 0) {
      return interaction.reply({ content: 'No commands are loaded.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    await paginate(interaction, {
      pages,
      ephemeral: true,
      componentsFor: (index, total) => [paginationRow(index, total)],
    });
  },
};
