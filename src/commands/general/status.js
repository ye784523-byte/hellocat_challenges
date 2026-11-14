import { SlashCommandBuilder, version as djsVersion } from 'discord.js';
import { BRAND, COLORS } from '../../constants/index.js';
import { brandEmbed, formatNumber } from '../../utils/embeds.js';
import { durationText } from '../../utils/time.js';

export default {
  category: 'general',
  cooldown: 5,
  data: new SlashCommandBuilder().setName('status').setDescription('Show bot operational status and telemetry.'),
  async execute(interaction, ctx) {
    await interaction.deferReply({ ephemeral: true });
    const [userCount, challengeStats, submissionCount, auditCount] = await Promise.all([
      ctx.storage.usersRepo.count(),
      ctx.services.challengeService.stats(),
      ctx.storage.submissionsRepo.solvedCount(),
      ctx.storage.auditRepo.count(),
    ]);
    const memory = process.memoryUsage();
    const uptimeMs = Date.now() - ctx.startedAt;
    await interaction.editReply({
      embeds: [
        brandEmbed({
          title: '[ HELLO CAT // OPERATIONAL STATUS ]',
          description: '```\nSYSTEM : ONLINE\nMODE    : AUTHORIZED LAB OPERATIONS\n```',
          color: COLORS.green,
          fields: [
            { name: 'UPTIME', value: durationText(uptimeMs), inline: true },
            { name: 'WS PING', value: `${interaction.client.ws.ping} ms`, inline: true },
            { name: 'GUILDS', value: formatNumber(interaction.client.guilds.cache.size), inline: true },
            { name: 'OPERATORS', value: formatNumber(userCount), inline: true },
            { name: 'CHALLENGES', value: `${challengeStats.active} active / ${challengeStats.total} total`, inline: true },
            { name: 'CAPTURES', value: formatNumber(submissionCount), inline: true },
            { name: 'AUDIT ENTRIES', value: formatNumber(auditCount), inline: true },
            {
              name: 'MEMORY',
              value: `RSS ${Math.round(memory.rss / 1024 / 1024)} MB • Heap ${Math.round(memory.heapUsed / 1024 / 1024)} MB`,
              inline: true,
            },
            { name: 'STACK', value: `discord.js ${djsVersion} • Node ${process.version}`, inline: false },
            { name: 'TIMEZONE', value: ctx.config.BOT_TIMEZONE, inline: true },
          ],
          footer: `${BRAND.footer} • HEALTH REPORT`,
        }),
      ],
    });
  },
};
