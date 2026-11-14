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

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

export default {
  category: 'games',
  cooldown: 15,
  data: new SlashCommandBuilder()
    .setName('guesscommand')
    .setDescription('Identify the correct Linux command for a scenario.'),
  async execute(interaction, ctx) {
    await interaction.deferReply({ ephemeral: true });
    const session = ctx.services.gameEngine.start('guesscommand', interaction.user.id);
    const view = session.game.view();

    const row = new ActionRowBuilder().addComponents(
      view.options.map((option, index) =>
        new ButtonBuilder()
          .setCustomId(`guess:${session.id}:${index}`)
          .setLabel(`${LETTERS[index]}. ${option}`.slice(0, 80))
          .setStyle(ButtonStyle.Secondary),
      ),
    );

    const embed = brandEmbed({
      title: '[ HELLO CAT // COMMAND RECONSTRUCTION ]',
      description: `\`\`\`\n${view.scenario}\n\`\`\``,
      color: COLORS.info,
      fields: [
        { name: 'OBJECTIVE', value: 'Select the command that solves the scenario.' },
        { name: 'REWARD', value: '60 XP + 15 CATCOINS (first successful drill each day)' },
      ],
      footer: `${BRAND.footer} • TRAINING SIMULATION`,
    });

    await interaction.editReply({ embeds: [embed], components: [row] });
    const message = await interaction.fetchReply();
    let busy = false;
    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 5 * 60_000,
      filter: (button) => button.user.id === interaction.user.id && button.customId.startsWith(`guess:${session.id}:`),
    });

    collector.on('collect', async (button) => {
      if (busy) return;
      busy = true;
      try {
        const index = Number(button.customId.split(':').pop());
        const { result } = ctx.services.gameEngine.submit(session.id, interaction.user.id, index);
        const reward = await awardGameReward(ctx, {
          userId: interaction.user.id,
          username: interaction.user.username,
          type: 'guesscommand',
          correct: result.correct,
          xp: 60,
          coins: 15,
        });
        const fields = [
          { name: 'YOUR ANSWER', value: `\`${result.feedback.selected}\``, inline: true },
          { name: 'CORRECT COMMAND', value: `\`${result.feedback.expected}\``, inline: true },
          { name: 'EXPLANATION', value: result.feedback.explanation },
        ];
        if (reward.xp > 0) {
          fields.push({
            name: 'REWARD',
            value: `+${formatNumber(reward.xp)} XP • +${formatNumber(reward.coins)} CATCOINS${
              reward.achievements.length
                ? `\n${reward.achievements.map((achievement) => `${achievement.icon} ${achievement.name}`).join(' • ')}`
                : ''
            }`,
          });
        } else if (result.correct) {
          fields.push({ name: 'REWARD', value: 'Daily training reward already claimed. No XP awarded.' });
        }
        await button.update({
          embeds: [
            brandEmbed({
              title: result.correct
                ? '[ DRILL COMPLETE // CORRECT ]'
                : '[ DRILL FAILED // INCORRECT ]',
              description: result.correct ? 'Command reconstruction verified.' : 'The selected command does not solve the scenario.',
              color: result.correct ? COLORS.green : COLORS.danger,
              fields,
              footer: `${BRAND.footer} • TRAINING SIMULATION`,
            }),
          ],
          components: [],
        });
        collector.stop('finished');
      } catch (error) {
        ctx.logger.error('Guess command failed', { error: error.message });
        await button
          .reply({ embeds: [errorEmbed('The training session could not be completed.')], ephemeral: true })
          .catch(() => null);
        collector.stop('error');
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
