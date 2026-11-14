import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  SlashCommandBuilder,
} from 'discord.js';
import { BRAND, COLORS } from '../../constants/index.js';
import { brandEmbed, errorEmbed, formatNumber } from '../../utils/embeds.js';
import { awardGameReward } from '../../utils/gameRewards.js';

const LETTERS = ['A', 'B', 'C', 'D'];

function render(view, sessionId, feedback) {
  if (view.finished) {
    return {
      embeds: [
        brandEmbed({
          title: '[ QUIZ COMPLETE // DEBRIEF ]',
          description: `Final score: **${view.score} / ${view.total}**`,
          color: view.score >= Math.ceil(view.total / 2) ? COLORS.green : COLORS.warning,
          fields: feedback?.explanation
            ? [{ name: 'LAST EXPLANATION', value: feedback.explanation }]
            : [],
          footer: `${BRAND.footer} • TRAINING SIMULATION`,
        }),
      ],
      components: [],
    };
  }
  const row = new ActionRowBuilder().addComponents(
    view.options.map((option, index) =>
      new ButtonBuilder()
        .setCustomId(`quiz:${sessionId}:${index}`)
        .setLabel(`${LETTERS[index]}. ${option}`.slice(0, 80))
        .setStyle(ButtonStyle.Secondary),
    ),
  );
  const fields = [
    { name: 'QUESTION', value: `${view.index + 1} / ${view.total}`, inline: true },
    { name: 'SCORE', value: `${view.score}`, inline: true },
  ];
  if (feedback?.explanation) {
    fields.push({
      name: feedback.correct ? 'PREVIOUS ANSWER ✅' : 'PREVIOUS ANSWER ❌',
      value: `${feedback.explanation}\nCorrect: **${feedback.expected}**`,
    });
  }
  return {
    embeds: [
      brandEmbed({
        title: '[ HELLO CAT // CYBERSECURITY QUIZ ]',
        description: `\`\`\`\n${view.question}\n\`\`\``,
        color: COLORS.info,
        fields,
        footer: `${BRAND.footer} • TRAINING SIMULATION`,
      }),
    ],
    components: [row],
  };
}

export default {
  category: 'games',
  cooldown: 15,
  data: new SlashCommandBuilder()
    .setName('quiz')
    .setDescription('Take a five-question cybersecurity quiz.'),
  async execute(interaction, ctx) {
    await interaction.deferReply({ ephemeral: true });
    const session = ctx.services.gameEngine.start('quiz', interaction.user.id, { count: 5 });
    let feedback = null;
    let busy = false;
    let view = session.game.view();

    await interaction.editReply(render(view, session.id, feedback));
    const message = await interaction.fetchReply();
    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 8 * 60_000,
      filter: (button) => button.user.id === interaction.user.id && button.customId.startsWith(`quiz:${session.id}:`),
    });

    collector.on('collect', async (button) => {
      if (busy) return;
      busy = true;
      try {
        const index = Number(button.customId.split(':').pop());
        const { result } = ctx.services.gameEngine.submit(session.id, interaction.user.id, index);
        feedback = result.feedback;
        view = session.game.view();

        let rewardLine = '';
        if (result.finished) {
          const passed = result.score >= Math.ceil(result.total / 2);
          const reward = await awardGameReward(ctx, {
            userId: interaction.user.id,
            username: interaction.user.username,
            type: 'quiz',
            correct: passed,
            xp: result.score * 20,
            coins: result.score * 5,
          });
          if (reward.xp > 0) {
            rewardLine = `+${formatNumber(reward.xp)} XP • +${formatNumber(reward.coins)} CATCOINS${
              reward.achievements.length
                ? `\n${reward.achievements.map((achievement) => `${achievement.icon} ${achievement.name}`).join(' • ')}`
                : ''
            }`;
          } else if (passed) {
            rewardLine = 'Daily quiz reward already claimed.';
          }
        }

        const payload = render(view, session.id, feedback);
        if (result.finished) {
          payload.embeds[0].addFields({
            name: 'REWARD',
            value: rewardLine || 'No reward (score below passing threshold).',
          });
        }
        await button.update(payload);
        if (result.finished) collector.stop('finished');
      } catch (error) {
        ctx.logger.error('Quiz failed', { error: error.message });
        await button
          .reply({ embeds: [errorEmbed('The quiz session could not continue.')], ephemeral: true })
          .catch(() => null);
        collector.stop('error');
      } finally {
        busy = false;
      }
    });

    collector.on('end', async () => {
      try {
        await interaction.editReply({ components: [] });
      } catch {
        /* expired */
      }
    });
  },
};
