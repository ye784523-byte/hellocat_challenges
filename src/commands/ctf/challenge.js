import { SlashCommandBuilder } from 'discord.js';
import { BRAND, CATEGORIES, COLORS, DIFFICULTIES } from '../../constants/index.js';
import { brandEmbed, errorEmbed, formatNumber } from '../../utils/embeds.js';
import { paginate, paginationRow } from '../../utils/components.js';
import { challengeActions, challengeEmbed } from '../../utils/challengeUi.js';

const PAGE_SIZE = 6;

export function createChallengeCommand(name = 'challenge') {
  return {
  category: 'ctf',
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName(name)
    .setDescription('Browse, inspect and start CTF challenges.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('browse')
        .setDescription('Browse the active challenge database.')
        .addStringOption((option) =>
          option
            .setName('category')
            .setDescription('Filter by category.')
            .addChoices(...CATEGORIES.map((category) => ({ name: category, value: category }))),
        )
        .addStringOption((option) =>
          option
            .setName('difficulty')
            .setDescription('Filter by difficulty.')
            .addChoices(...DIFFICULTIES.map((difficulty) => ({ name: difficulty, value: difficulty }))),
        )
        .addStringOption((option) =>
          option.setName('search').setDescription('Search by title or ID.').setMaxLength(60),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('info')
        .setDescription('Show detailed challenge intelligence.')
        .addStringOption((option) =>
          option
            .setName('id')
            .setDescription('Challenge ID, e.g. HC-001.')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('start')
        .setDescription('Open a challenge with action controls.')
        .addStringOption((option) =>
          option
            .setName('id')
            .setDescription('Challenge ID, e.g. HC-001.')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),

  async autocomplete(interaction, ctx) {
    const focused = interaction.options.getFocused().toLowerCase();
    const challenges = await ctx.services.challengeService.list();
    const filtered = challenges
      .filter(
        (challenge) =>
          challenge.id.toLowerCase().includes(focused) ||
          challenge.title.toLowerCase().includes(focused),
      )
      .slice(0, 25)
      .map((challenge) => ({
        name: `${challenge.id} // ${challenge.title} [${challenge.difficulty}]`,
        value: challenge.id,
      }));
    await interaction.respond(filtered);
  },

  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'browse') return browse(interaction, ctx);
    if (subcommand === 'info') return info(interaction, ctx);
    if (subcommand === 'start') return start(interaction, ctx);
    return interaction.reply({ embeds: [errorEmbed('Unknown challenge subcommand.')], ephemeral: true });
  },
  };
}

export default createChallengeCommand('challenge');

async function browse(interaction, ctx) {
  await interaction.deferReply();
  const category = interaction.options.getString('category');
  const difficulty = interaction.options.getString('difficulty');
  const search = interaction.options.getString('search');
  const challenges = await ctx.services.challengeService.list({
    category,
    difficulty,
    search,
    userId: interaction.user.id,
  });

  if (challenges.length === 0) {
    return interaction.editReply({
      embeds: [
        brandEmbed({
          title: '[ HELLO CAT // CHALLENGE DATABASE ]',
          description: 'No active challenges match that filter. Intel is being prepared.',
          color: COLORS.muted,
        }),
      ],
    });
  }

  const pages = [];
  for (let offset = 0; offset < challenges.length; offset += PAGE_SIZE) {
    const slice = challenges.slice(offset, offset + PAGE_SIZE);
    const lines = slice.map((challenge) => {
      const gate = challenge.locked
        ? ` • 🔒 requires ${(challenge.missingPrerequisites ?? []).join(', ')}`
        : '';
      return `**${challenge.id}** • **${challenge.title}**\n\`${challenge.category.toUpperCase()}\` • \`${challenge.difficulty.toUpperCase()}\` • ${formatNumber(challenge.xp)} XP • ${challenge.maxAttempts ? `${challenge.maxAttempts} attempts` : 'unlimited'}${gate}`;
    });
    pages.push(
      brandEmbed({
        title: '[ HELLO CAT // CHALLENGE DATABASE ]',
        description: lines.join('\n\n'),
        color: COLORS.green,
        fields: [
          { name: 'ACTIVE', value: String(challenges.length), inline: true },
          { name: 'PAGE', value: `${Math.floor(offset / PAGE_SIZE) + 1} / ${Math.ceil(challenges.length / PAGE_SIZE)}`, inline: true },
          { name: 'FILTER', value: [category, difficulty, search].filter(Boolean).join(' • ') || 'NONE', inline: true },
        ],
        footer: `${BRAND.footer} • /challenge info <id>`,
      }),
    );
  }

  await paginate(interaction, {
    pages,
    componentsFor: (index, total) => [paginationRow(index, total)],
  });
}

async function info(interaction, ctx) {
  const id = interaction.options.getString('id').toUpperCase();
  const challenge = await ctx.services.challengeService.get(id);
  if (!challenge || !challenge.active || !challenge.published) {
    return interaction.reply({ embeds: [errorEmbed('Challenge not found or not published.')], ephemeral: true });
  }
  const gate = await ctx.services.challengeService.prerequisiteState(interaction.user.id, challenge);
  const webUrl = gate.locked ? '' : ctx.services.announcementService.challengeUrl(challenge.id) ?? '';
  await interaction.reply({
    embeds: [challengeEmbed(challenge, { webUrl, locked: gate.locked, missing: gate.missing })],
    ephemeral: true,
  });
}

async function start(interaction, ctx) {
  const id = interaction.options.getString('id').toUpperCase();
  const challenge = await ctx.services.challengeService.get(id);
  if (!challenge || !challenge.active || !challenge.published) {
    return interaction.reply({ embeds: [errorEmbed('Challenge not found or not published.')], ephemeral: true });
  }
  const gate = await ctx.services.challengeService.prerequisiteState(interaction.user.id, challenge);
  if (gate.locked) {
    return interaction.reply({
      embeds: [
        brandEmbed({
          title: '[ HELLO CAT // ACCESS DENIED ]',
          description: `**${challenge.title}** (\`${challenge.id}\`) is locked.\nCapture ${gate.missing.map((entry) => `\`${entry}\``).join(', ')} first — the lab environment stays sealed until then.`,
          color: COLORS.warning,
          footer: `${BRAND.footer} • PREREQUISITE NOT MET`,
        }),
      ],
      ephemeral: true,
    });
  }
  const solved = await ctx.storage.submissionsRepo.solved(interaction.user.id, challenge.id);
  const webUrl = ctx.services.announcementService.challengeUrl(challenge.id) ?? '';
  await challengeActions(interaction, ctx, challenge, {
    extraDescription: solved ? '✅ **ALREADY CAPTURED** — replay submissions do not award XP.' : '',
    webUrl,
  });
}
