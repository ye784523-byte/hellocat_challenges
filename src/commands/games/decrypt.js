import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  SlashCommandBuilder,
  TextInputStyle,
} from 'discord.js';
import { BRAND, COLORS } from '../../constants/index.js';
import { brandEmbed, errorEmbed, formatNumber, truncate } from '../../utils/embeds.js';
import { awaitModal, modal, textInput } from '../../utils/components.js';
import { awardGameReward } from '../../utils/gameRewards.js';

function render(session, view, note = '', rewardLine = '') {
  const fields = [
    { name: 'METHOD', value: view.method, inline: true },
    { name: 'ATTEMPTS', value: `${view.attempts} / 5`, inline: true },
    { name: 'REWARD', value: '80 XP + 20 CATCOINS (first decryption each day)', inline: true },
    { name: 'CLUE', value: view.clue },
    { name: 'OPERATOR NOTE', value: view.extra },
    { name: 'CIPHERTEXT', value: `\`\`\`\n${truncate(view.encoded, 900)}\n\`\`\`` },
  ];
  if (note) fields.push({ name: 'SYSTEM', value: note });
  if (view.finished && view.expected) fields.push({ name: 'PLAINTEXT', value: `\`${view.expected}\`` });
  if (rewardLine) fields.push({ name: 'CREDIT', value: rewardLine });
  return {
    embeds: [
      brandEmbed({
        title: view.finished
          ? '[ CRYPTOGRAPHY DRILL // RESOLVED ]'
          : '[ HELLO CAT // CRYPTOGRAPHY DRILL ]',
        description: 'Recover the plaintext from the provided educational cipher.',
        color: view.finished ? COLORS.green : COLORS.info,
        fields,
        footer: `${BRAND.footer} • AUTHORIZED TRAINING`,
      }),
    ],
    components: view.finished
      ? []
      : [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`decrypt:${session.id}:solve`)
              .setLabel('SUBMIT PLAINTEXT')
              .setStyle(ButtonStyle.Primary),
          ),
        ],
  };
}

export default {
  category: 'games',
  cooldown: 15,
  data: new SlashCommandBuilder()
    .setName('decrypt')
    .setDescription('Solve an educational cryptography puzzle.'),
  async execute(interaction, ctx) {
    await interaction.deferReply({ ephemeral: true });
    const session = ctx.services.gameEngine.start('decrypt', interaction.user.id);
    let busy = false;
    let view = session.game.view();
    let note = '';

    await interaction.editReply(render(session, view, note));
    const message = await interaction.fetchReply();
    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 10 * 60_000,
      filter: (button) =>
        button.user.id === interaction.user.id && button.customId.startsWith(`decrypt:${session.id}:`),
    });

    collector.on('collect', async (button) => {
      if (busy) return;
      busy = true;
      try {
        const submitted = await awaitModal(
          button,
          modal(`decryptans:${session.id}:${interaction.user.id}`, 'Cryptography Drill // Plaintext', [
            textInput('plaintext', 'PLAINTEXT', {
              style: TextInputStyle.Paragraph,
              required: true,
              maxLength: 300,
              placeholder: 'Enter the decoded message',
            }),
          ]),
        );
        if (!submitted) return;
        await submitted.deferUpdate().catch(() => null);

        const answer = submitted.fields.getTextInputValue('plaintext');
        const { result } = ctx.services.gameEngine.submit(session.id, interaction.user.id, answer);
        view = session.game.view();
        note = result.feedback?.message ?? '';

        let rewardLine = '';
        if (result.finished) {
          if (result.correct) {
            const reward = await awardGameReward(ctx, {
              userId: interaction.user.id,
              username: interaction.user.username,
              type: 'decrypt',
              correct: true,
              xp: 80,
              coins: 20,
            });
            rewardLine = reward.xp > 0
              ? `+${formatNumber(reward.xp)} XP • +${formatNumber(reward.coins)} CATCOINS${
                  reward.achievements.length
                    ? `\n${reward.achievements.map((achievement) => `${achievement.icon} ${achievement.name}`).join(' • ')}`
                    : ''
                }`
              : 'Daily decryption reward already claimed. No XP awarded.';
          }
        }

        await interaction.editReply(render(session, view, note, rewardLine));
        if (result.finished) collector.stop('finished');
      } catch (error) {
        ctx.logger.error('Decrypt drill failed', { error: error.message });
        if (!button.replied && !button.deferred) {
          await button
            .reply({ embeds: [errorEmbed('The cryptography drill could not continue.')], ephemeral: true })
            .catch(() => null);
        }
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
