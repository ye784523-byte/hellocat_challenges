import { SlashCommandBuilder } from 'discord.js';
import { BRAND, COLORS } from '../../constants/index.js';
import { brandEmbed, progressBar, formatNumber } from '../../utils/embeds.js';
import { rankForXp } from '../../services/rankingService.js';

export default {
  category: 'profile',
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Display an operator profile.')
    .addUserOption((option) =>
      option.setName('user').setDescription('Operator to inspect (defaults to you).').setRequired(false),
    ),
  async execute(interaction, ctx) {
    await interaction.deferReply();
    const target = interaction.options.getUser('user') ?? interaction.user;
    await ctx.services.playerService.ensureUser(target.id, target.username);
    const [user, account, achievements, solutions] = await Promise.all([
      ctx.services.playerService.getUser(target.id),
      ctx.services.economyService.getAccount(target.id),
      ctx.services.achievementService.listFor(target.id),
      ctx.storage.submissionsRepo.solvedChallengeIds(target.id),
    ]);
    const rank = rankForXp(user?.xp ?? 0);
    const unlocked = achievements.filter((achievement) => achievement.unlockedAt);
    const purchases = account.inventory ?? [];
    const titles = purchases.filter((item) => item.type === 'title').map((item) => item.cosmetic);
    const badges = purchases.filter((item) => item.type === 'badge').map((item) => item.cosmetic);

    const embed = brandEmbed({
      title: '[ HELLO CAT // OPERATOR DOSSIER ]',
      description: `**${target.username}**\n\`${target.id}\``,
      color: COLORS.green,
      fields: [
        { name: 'RANK', value: `${rank.name} (${rank.index}/${rank.totalRanks})`, inline: true },
        { name: 'XP', value: formatNumber(user?.xp ?? 0), inline: true },
        { name: 'CATCOINS', value: formatNumber(account.coins), inline: true },
        { name: 'CAPTURES', value: formatNumber(solutions.length), inline: true },
        { name: 'ACHIEVEMENTS', value: `${unlocked.length}/${achievements.length}`, inline: true },
        { name: 'STREAK', value: `${user?.streak?.current ?? 0} day(s)`, inline: true },
        {
          name: 'PROGRESS',
          value: `${progressBar(rank.isMax ? 1 : rank.xpIntoRank, rank.isMax ? 1 : Math.max(1, rank.xpIntoRank + rank.xpToNext), 14)}${
            rank.xpToNext > 0 ? `\n${formatNumber(rank.xpToNext)} XP → ${rank.next.name}` : '\nMaximum rank achieved.'
          }`,
        },
        { name: 'TITLES', value: titles.length ? titles.join(', ') : 'None equipped' },
        { name: 'BADGES', value: badges.length ? badges.join(', ') : 'No cosmetic badges' },
      ],
      footer: `${BRAND.footer} • PROFILE QUERY`,
    });
    embed.setThumbnail(target.displayAvatarURL({ size: 256 }));
    await interaction.editReply({ embeds: [embed] });
  },
};
