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
    { name: 'CWD', value: `\`${view.cwd}\``, inline: true },
    { name: 'COMMANDS', value: String(view.commands), inline: true },
    { name: 'REWARD', value: '100 XP + 25 CATCOINS (first terminal completion each day)', inline: true },
  ];
  if (note) fields.push({ name: 'SYSTEM', value: truncate(note, 500) });
  if (rewardLine) fields.push({ name: 'CREDIT', value: rewardLine });
  return {
    embeds: [
      brandEmbed({
        title: view.finished
          ? '[ SIMULATED TERMINAL // OBJECTIVE COMPLETE ]'
          : '[ HELLO CAT // SIMULATED TERMINAL ]',
        description: `\`\`\`ansi\n${truncate(view.log.join('\n'), 1800)}\n\`\`\``,
        color: view.finished ? COLORS.green : COLORS.charcoal,
        fields,
        footer: `${BRAND.footer} • HOST EXECUTION DISABLED`,
      }),
    ],
    components: view.finished
      ? []
      : [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`terminal:${session.id}:type`)
              .setLabel('TYPE COMMAND')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`terminal:${session.id}:abort`)
              .setLabel('ABORT')
              .setStyle(ButtonStyle.Danger),
          ),
        ],
  };
}

export default {
  category: 'games',
  cooldown: 10,
  data: new SlashCommandBuilder()
    .setName('terminal')
    .setDescription('Start a simulated terminal puzzle. No host commands are executed.'),
  async execute(interaction, ctx) {
    await interaction.deferReply({ ephemeral: true });
    const session = ctx.services.gameEngine.start('terminal', interaction.user.id);
    let busy = false;
    let view = session.game.view();
    let note = 'Hint: use ls, cd and cat to explore the fictional filesystem.';

    await interaction.editReply(render(session, view, note));
    const message = await interaction.fetchReply();
    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 10 * 60_000,
      filter: (button) =>
        button.user.id === interaction.user.id && button.customId.startsWith(`terminal:${session.id}:`),
    });

    collector.on('collect', async (button) => {
      if (busy) return;
      busy = true;
      try {
        if (button.customId.endsWith(':abort')) {
          await button.update({
            embeds: [
              brandEmbed({
                title: '[ TERMINAL SESSION TERMINATED ]',
                description: 'Simulation aborted by operator. No host state was modified.',
                color: COLORS.muted,
                footer: `${BRAND.footer} • SAFE SHUTDOWN`,
              }),
            ],
            components: [],
          });
          collector.stop('aborted');
          return;
        }

        const submitted = await awaitModal(
          button,
          modal(`terminalcmd:${session.id}:${interaction.user.id}`, 'Simulated Terminal // Command', [
            textInput('command', 'COMMAND', {
              style: TextInputStyle.Short,
              required: true,
              maxLength: 200,
              placeholder: 'pwd',
            }),
          ]),
        );
        if (!submitted) return;
        await submitted.deferUpdate().catch(() => null);

        const command = submitted.fields.getTextInputValue('command');
        const { result } = ctx.services.gameEngine.submit(session.id, interaction.user.id, command);
        view = session.game.view();
        note = result.feedback?.message ?? '';

        let rewardLine = '';
        if (result.finished) {
          const reward = await awardGameReward(ctx, {
            userId: interaction.user.id,
            username: interaction.user.username,
            type: 'terminal',
            correct: true,
            xp: 100,
            coins: 25,
          });
          rewardLine = reward.xp > 0
            ? `+${formatNumber(reward.xp)} XP • +${formatNumber(reward.coins)} CATCOINS${
                reward.achievements.length
                  ? `\n${reward.achievements.map((achievement) => `${achievement.icon} ${achievement.name}`).join(' • ')}`
                  : ''
              }`
            : 'Daily terminal reward already claimed. No XP awarded.';
        }

        await interaction.editReply(render(session, view, note, rewardLine));
        if (result.finished) collector.stop('finished');
      } catch (error) {
        ctx.logger.error('Terminal simulation failed', { error: error.message });
        if (!button.replied && !button.deferred) {
          await button
            .reply({ embeds: [errorEmbed('The simulated terminal rejected that operation.')], ephemeral: true })
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
