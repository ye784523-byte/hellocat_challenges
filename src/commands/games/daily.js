import { SlashCommandBuilder } from 'discord.js';
import { BRAND, COLORS } from '../../constants/index.js';
import { brandEmbed, errorEmbed } from '../../utils/embeds.js';

export default {
  category: 'games',
  cooldown: 10,
  data: new SlashCommandBuilder().setName('daily').setDescription('Open today\'s daily security operation.'),
  async execute(interaction, ctx) {
    await interaction.deferReply({ ephemeral: true });
    const status = await ctx.services.dailyService.status(interaction.user.id);
    if (!status.challenge) {
      return interaction.editReply({
        embeds: [
          errorEmbed(
            'No active daily challenge is available. An administrator must publish challenges first.',
          ),
        ],
      });
    }
    const user = await ctx.services.playerService.getUser(interaction.user.id);
    const settings = await ctx.storage.settingsRepo.get();
    const description = [
      `**DATE** \`${status.date}\` (${ctx.config.BOT_TIMEZONE})`,
      `**STATUS** ${status.completed ? '✅ COMPLETED' : '⏳ PENDING'}`,
      `**STREAK** ${user?.streak?.current ?? 0} day(s)`,
      `**DAILY BONUS** ${settings.guild.dailyRewardXp} XP • ${settings.guild.dailyRewardCoins} ${BRAND.currency}`,
      '',
      status.completed
        ? 'You already completed today\'s operation. Return tomorrow to extend your streak.'
        : 'Capture the daily challenge to earn its base reward plus the daily bonus.',
    ].join('\n');

    await interaction.editReply({
      embeds: [
        brandEmbed({
          title: '[ HELLO CAT // DAILY OPERATION ]',
          description,
          color: status.completed ? COLORS.muted : COLORS.green,
          footer: `${BRAND.footer} • RESET ${ctx.config.BOT_TIMEZONE}`,
        }),
      ],
    });

    const message = await interaction.fetchReply();
    const { challengeActionRow } = await import('../../utils/challengeUi.js');
    const webUrl = ctx.services.announcementService.challengeUrl(status.challenge.id) ?? '';
    await message.edit({ components: [challengeActionRow(status.challenge, { webUrl })] }).catch(() => null);

    const { ComponentType } = await import('discord.js');
    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 5 * 60_000,
      filter: (button) => button.user.id === interaction.user.id,
    });

    collector.on('collect', async (button) => {
      try {
        if (button.customId === 'challenge:close') {
          collector.stop('closed');
          await button.update({ components: [] });
          return;
        }
        if (button.customId === `challenge:hint:${status.challenge.id}`) {
          const { hintFlow } = await import('../../utils/challengeFlow.js');
          await hintFlow(button, ctx, status.challenge);
        }
      } catch (error) {
        ctx.logger.error('Daily action failed', { error: error.message });
      }
    });

    collector.on('end', async () => {
      await interaction.editReply({ components: [] }).catch(() => null);
    });
  },
};
