import { SlashCommandBuilder } from 'discord.js';
import { BRAND, COLORS } from '../../constants/index.js';
import { brandEmbed } from '../../utils/embeds.js';

export default {
  category: 'profile',
  cooldown: 8,
  data: new SlashCommandBuilder().setName('history').setDescription('Show your recent challenge submissions.'),
  async execute(interaction, ctx) {
    await interaction.deferReply({ ephemeral: true });
    const submissions = (await ctx.storage.submissionsRepo.byUser(interaction.user.id))
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20);
    const challenges = await ctx.storage.challengeRepo.all();
    const byId = new Map(challenges.map((challenge) => [challenge.id, challenge]));

    if (submissions.length === 0) {
      return interaction.editReply({
        embeds: [brandEmbed({ title: '[ HELLO CAT // MISSION HISTORY ]', description: 'No submissions recorded yet. Begin with `/challenge browse`.', color: COLORS.muted })],
      });
    }

    const lines = submissions.map((submission) => {
      const challenge = byId.get(submission.challengeId);
      const title = challenge?.title ?? 'Unknown / deleted challenge';
      const status = submission.correct ? '✅ CAPTURED' : '❌ REJECTED';
      return `\`${submission.challengeId}\` **${title}**\n${status} • attempt #${submission.attemptNumber} • <t:${Math.floor(Date.parse(submission.createdAt) / 1000)}:R>`;
    });

    await interaction.editReply({
      embeds: [
        brandEmbed({
          title: '[ HELLO CAT // MISSION HISTORY ]',
          description: lines.join('\n\n'),
          color: COLORS.green,
          fields: [
            { name: 'SHOWING', value: `${submissions.length} most recent`, inline: true },
            { name: 'CAPTURES', value: String(submissions.filter((s) => s.correct).length), inline: true },
          ],
          footer: `${BRAND.footer} • SUBMISSION ARCHIVE`,
        }),
      ],
    });
  },
};
