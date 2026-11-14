import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { BRAND, CATEGORIES, COLORS, DIFFICULTIES } from '../../constants/index.js';
import { TUTORIAL_LESSONS, TUTORIAL_TRACKS } from '../../constants/tutorial.js';
import { brandEmbed, errorEmbed, truncate } from '../../utils/embeds.js';
import { paginate, paginationRow } from '../../utils/components.js';

const TOUR_TIMEOUT = 5 * 60_000;

function lessonEmbed(lesson, index, total) {
  return brandEmbed({
    title: `[ HELLO CAT // TUTORIAL ${index + 1} / ${total} ]`,
    description: `**${lesson.title}**\n${lesson.body}`,
    color: COLORS.green,
    fields: [
      { name: 'MODULE', value: lesson.tag, inline: true },
      { name: 'TOPIC', value: `\`${lesson.id}\``, inline: true },
      {
        name: 'COMMANDS',
        value: lesson.commands.map((command) => `\`${command.usage}\` — ${command.description}`).join('\n'),
      },
      { name: 'TIPS', value: lesson.tips.map((tip) => `• ${tip}`).join('\n') },
    ],
    footer: `${BRAND.footer} • /tutorial topic lesson:${lesson.id}`,
  });
}

function tourRow(index, total) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tutorial:prev')
      .setLabel('◀ PREV')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index <= 0),
    new ButtonBuilder()
      .setCustomId('tutorial:next')
      .setLabel('NEXT ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index >= total - 1),
    new ButtonBuilder().setCustomId('tutorial:close').setLabel('CLOSE').setStyle(ButtonStyle.Danger),
  );
}

function topicMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('tutorial:goto')
      .setPlaceholder('Jump to a topic…')
      .addOptions(
        TUTORIAL_LESSONS.map((lesson, index) => ({
          label: `${index + 1}. ${lesson.title}`.slice(0, 100),
          value: lesson.id,
          description: truncate(lesson.summary, 100),
        })),
      ),
  );
}

function tourPayload(index) {
  const total = TUTORIAL_LESSONS.length;
  return {
    embeds: [lessonEmbed(TUTORIAL_LESSONS[index], index, total)],
    components: [tourRow(index, total), topicMenu()],
  };
}

function trackEmbed(track, { count = 0, nextUp = null } = {}) {
  return brandEmbed({
    title: `[ HELLO CAT // STUDY TRACK ]`,
    description: `**${track.category}** — ${count} active challenge(s) in this domain.`,
    color: COLORS.info,
    fields: [
      { name: 'FOCUS', value: track.focus.map((item) => `• ${item}`).join('\n') },
      { name: 'TOOLKIT', value: track.toolkit.map((item) => `\`${item}\``).join(' • ') },
      { name: 'DRILL', value: `\`${track.drill}\`` },
      { name: 'NEXT UP', value: nextUp ?? 'No open challenge in this domain yet — check back later.' },
      { name: 'ADVISORY', value: track.tip },
    ],
    footer: `${BRAND.footer} • /tutorial roadmap category:${track.category}`,
  });
}

async function startTour(interaction, ctx) {
  await interaction.deferReply({ ephemeral: true });
  const total = TUTORIAL_LESSONS.length;
  let index = 0;
  const message = await interaction.editReply(tourPayload(index));

  const collector = message.createMessageComponentCollector({
    time: TOUR_TIMEOUT,
    filter: (component) => component.user.id === interaction.user.id,
  });

  collector.on('collect', async (component) => {
    try {
      if (component.customId === 'tutorial:close') {
        collector.stop('closed');
        await component.update({ components: [] });
        return;
      }
      if (component.customId === 'tutorial:next') {
        index = Math.min(index + 1, total - 1);
      } else if (component.customId === 'tutorial:prev') {
        index = Math.max(index - 1, 0);
      } else if (component.customId === 'tutorial:goto') {
        const target = TUTORIAL_LESSONS.findIndex((lesson) => lesson.id === component.values?.[0]);
        if (target >= 0) index = target;
      }
      await component.update(tourPayload(index));
    } catch (error) {
      ctx.logger.warn('Tutorial navigation failed', { error: error.message });
    }
  });

  collector.on('end', async () => {
    try {
      await interaction.editReply({ components: [] });
    } catch {
      /* interaction or message expired */
    }
  });
}

async function showTopic(interaction) {
  const id = interaction.options.getString('lesson');
  const index = TUTORIAL_LESSONS.findIndex((lesson) => lesson.id === id);
  if (index < 0) {
    return interaction.reply({ embeds: [errorEmbed('Unknown tutorial topic.')], ephemeral: true });
  }
  await interaction.reply({
    embeds: [lessonEmbed(TUTORIAL_LESSONS[index], index, TUTORIAL_LESSONS.length)],
    ephemeral: true,
  });
}

async function showRoadmap(interaction, ctx) {
  const category = interaction.options.getString('category');
  const categories = await ctx.services.challengeService.categories();
  const counts = new Map(categories.map((entry) => [entry.name, entry.count]));

  if (category) {
    const track = TUTORIAL_TRACKS.find((entry) => entry.category === category);
    if (!track) {
      return interaction.reply({ embeds: [errorEmbed('Unknown study track.')], ephemeral: true });
    }
    const challenges = await ctx.services.challengeService.list({
      category,
      userId: interaction.user.id,
    });
    const solved = new Set(await ctx.storage.submissionsRepo.solvedChallengeIds(interaction.user.id));
    const byDifficulty = (a, b) =>
      DIFFICULTIES.indexOf(a.difficulty) - DIFFICULTIES.indexOf(b.difficulty);
    const pending = challenges.filter((challenge) => !solved.has(challenge.id));
    const nextUp = pending.filter((challenge) => !challenge.locked).sort(byDifficulty)[0];
    const sealed = pending.filter((challenge) => challenge.locked).sort(byDifficulty)[0];
    await interaction.reply({
      embeds: [
        trackEmbed(track, {
          count: counts.get(category) ?? 0,
          nextUp: nextUp
            ? `**${nextUp.id}** • ${nextUp.title}\n\`${nextUp.difficulty.toUpperCase()}\` • ${nextUp.xp} XP`
            : sealed
              ? `**${sealed.id}** • ${sealed.title}\n🔒 Sealed — capture ${(sealed.missingPrerequisites ?? []).join(', ')} first.`
              : 'You have captured every active challenge in this domain.',
        }),
      ],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const pages = TUTORIAL_TRACKS.map((track) =>
    trackEmbed(track, { count: counts.get(track.category) ?? 0 }),
  );
  await paginate(interaction, {
    pages,
    ephemeral: true,
    componentsFor: (index, total) => [paginationRow(index, total)],
  });
}

export default {
  category: 'general',
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName('tutorial')
    .setDescription('Learn the terminal: guided tour, single topics and study tracks.')
    .addSubcommand((subcommand) =>
      subcommand.setName('start').setDescription('Launch the interactive guided tour.'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('topic')
        .setDescription('Read a single tutorial topic.')
        .addStringOption((option) =>
          option
            .setName('lesson')
            .setDescription('Topic to read.')
            .setRequired(true)
            .addChoices(...TUTORIAL_LESSONS.map((lesson) => ({ name: lesson.title, value: lesson.id }))),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('roadmap')
        .setDescription('Study plan for each security domain.')
        .addStringOption((option) =>
          option
            .setName('category')
            .setDescription('Focus on a single domain (omit for the full roadmap).')
            .addChoices(...CATEGORIES.map((entry) => ({ name: entry, value: entry }))),
        ),
    ),
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'start') return startTour(interaction, ctx);
    if (subcommand === 'topic') return showTopic(interaction, ctx);
    if (subcommand === 'roadmap') return showRoadmap(interaction, ctx);
    return interaction.reply({ embeds: [errorEmbed('Unknown tutorial subcommand.')], ephemeral: true });
  },
};
