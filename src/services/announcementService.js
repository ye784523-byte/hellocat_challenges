import { BRAND, COLORS, DIFFICULTY_COLORS } from '../constants/index.js';
import { brandEmbed, formatNumber, truncate } from '../utils/embeds.js';
import { siteUrl, terminalUrl } from '../utils/links.js';
import { tipForDate } from '../constants/tips.js';

/**
 * The channel assistant.
 *
 * The bot owns the conversation in the channel: it announces new challenges,
 * celebrates solves that happen in the web terminal, shares a daily tip and
 * keeps the leaderboard visible. Flag submission itself lives in the web
 * terminal, so every announcement points there.
 */
export class AnnouncementService {
  constructor({
    client,
    config,
    logger,
    leaderboardService,
    challengeService,
    playerService,
  }) {
    this.client = client;
    this.config = config;
    this.logger = logger;
    this.leaderboardService = leaderboardService;
    this.challengeService = challengeService;
    this.playerService = playerService;
  }

  /** The public address of the web terminal. */
  get webUrl() {
    return terminalUrl(this.config);
  }

  /** The public address of the landing page. */
  get siteUrl() {
    return siteUrl(this.config);
  }

  /** A deep link that opens a challenge in the web terminal. */
  challengeUrl(challengeId) {
    if (!this.webUrl) return null;
    return `${this.webUrl}?challenge=${encodeURIComponent(challengeId)}`;
  }

  /** The channel the assistant posts to. */
  get channelId() {
    return this.config.ANNOUNCEMENT_CHANNEL_ID || this.config.CHALLENGE_CHANNEL_ID || null;
  }

  resolveChannel(channelId = this.channelId) {
    if (!channelId) return null;
    const direct = this.client.channels.cache.get(channelId);
    if (direct?.isTextBased?.()) return direct;
    if (this.config.GUILD_ID) {
      const guild = this.client.guilds.cache.get(this.config.GUILD_ID);
      const viaGuild = guild?.channels?.cache?.get(channelId);
      if (viaGuild?.isTextBased?.()) return viaGuild;
    }
    return null;
  }

  async post(payload, { channelId = this.channelId } = {}) {
    const channel = this.resolveChannel(channelId);
    if (!channel) {
      this.logger.warn('Announcement skipped, no channel available', { channelId });
      return null;
    }
    try {
      return await channel.send(payload);
    } catch (error) {
      this.logger.error('Announcement failed', { channelId, error: error.message });
      return null;
    }
  }

  /**
   * Explains a challenge and points the operator at the web terminal where
   * the flag can be submitted.
   */
  challengeAnnouncement(challenge) {
    const url = this.challengeUrl(challenge.id);
    const fields = [
      { name: 'DIFFICULTY', value: String(challenge.difficulty).toUpperCase(), inline: true },
      { name: 'CATEGORY', value: String(challenge.category).toUpperCase(), inline: true },
      { name: 'REWARD', value: `${formatNumber(challenge.xp)} XP`, inline: true },
      {
        name: 'OBJECTIVE',
        value: truncate(challenge.objective, 1000),
      },
    ];
    if (url) {
      fields.push({
        name: 'SOLVE IT',
        value: `[Open the Hello Cat web terminal](${url}) — the lab loads this challenge automatically.`,
      });
    }

    return {
      content: '```\nNEW CHALLENGE PUBLISHED\n```',
      embeds: [
        brandEmbed({
          title: '[ HELLO CAT // CHALLENGE DATABASE ]',
          description: `**${challenge.title}**  \`${challenge.id}\`\n${truncate(challenge.description, 900)}`,
          color: DIFFICULTY_COLORS[challenge.difficulty] ?? COLORS.green,
          fields,
          footer: `${BRAND.footer} • SUBMIT YOUR FLAG IN THE WEB TERMINAL`,
        }),
      ],
    };
  }

  async announceChallenge(challenge) {
    const message = await this.post(this.challengeAnnouncement(challenge));
    if (message) {
      this.logger.info('Challenge announced', { challengeId: challenge.id });
    }
    return message;
  }

  /**
   * Celebrates a solve that happened in the web terminal with the ranking of
   * the operator, the number of challenges they captured and the catcoins
   * they collected.
   */
  async announceSolve({ submission, challenge }) {
    const entry = await this.leaderboardService.positionOf(submission.userId);
    const url = this.challengeUrl(challenge?.id ?? submission.challengeId);
    const username = entry.username ?? 'operator';

    const fields = [
      { name: 'CHALLENGE', value: `\`${challenge?.id ?? submission.challengeId}\`${challenge?.title ? ` // ${challenge.title}` : ''}`, inline: false },
      {
        name: 'RANKING',
        value: entry.position
          ? `**#${entry.position}** of ${formatNumber(entry.total)} operators\n${entry.rank?.name ?? 'Unranked'}`
          : `${entry.rank?.name ?? 'Unranked'}`,
        inline: true,
      },
      { name: 'SOLVED', value: `**${formatNumber(entry.solves)}** challenge${entry.solves === 1 ? '' : 's'} captured`, inline: true },
      { name: 'CATCOINS', value: `**${formatNumber(entry.coins)}** ${BRAND.currency} collected`, inline: true },
      { name: 'EXPERIENCE', value: `**${formatNumber(entry.xp)}** XP`, inline: true },
    ];
    if (entry.streak > 0) {
      fields.push({ name: 'STREAK', value: `${entry.streak} day${entry.streak === 1 ? '' : 's'}`, inline: true });
    }
    if (url) {
      fields.push({ name: 'NEXT CHALLENGE', value: `[Open the web terminal](${url})` });
    }

    const message = await this.post({
      content: `**${username}** captured a challenge.`,
      embeds: [
        brandEmbed({
          title: '[ FLAG ACCEPTED // SECTOR CLEARED ]',
          description: `\`\`\`\nFLAG: [REDACTED BY POLICY]\nSTATUS: VERIFIED\nOPERATOR: ${username}\n\`\`\``,
          color: COLORS.green,
          fields,
          footer: `${BRAND.footer} • SOLVED IN THE WEB TERMINAL`,
        }),
      ],
    });

    if (message) {
      this.logger.info('Solve announced', {
        userId: submission.userId,
        challengeId: submission.challengeId,
        position: entry.position,
      });
    }
    return message;
  }

  /**
   * Announces the challenges that became available because a prerequisite was
   * captured. The chain only moves forward when the operator clears the gate.
   */
  async announceUnlock({ challenge, unlocked = [] }) {
    if (!unlocked.length) return null;
    const fields = unlocked.map((entry) => ({
      name: `${entry.id} // ${entry.title}`,
      value: truncate(entry.objective, 256),
      inline: false,
    }));
    fields.push({
      name: 'DIFFICULTY',
      value: String(unlocked[0].difficulty).toUpperCase(),
      inline: true,
    });
    fields.push({
      name: 'REWARD',
      value: `${formatNumber(unlocked[0].xp)} XP`,
      inline: true,
    });
    const url = this.challengeUrl(unlocked[0].id);
    if (url) {
      fields.push({
        name: 'SOLVE IT',
        value: `[Open the Hello Cat web terminal](${url}) — the lab loads this challenge automatically.`,
      });
    }

    return this.post({
      content: '```\nNEW CHALLENGE UNLOCKED\n```',
      embeds: [
        brandEmbed({
          title: '[ HELLO CAT // ACCESS GRANTED ]',
          description: `\`${challenge?.id ?? 'HC-000'}\` was captured, which unsealed the next lab.`,
          color: COLORS.info,
          fields,
          footer: `${BRAND.footer} • PREREQUISITE CLEARED`,
        }),
      ],
    });
  }

  /** The daily tip and tricks post. */
  async announceDailyTip({ date = new Date() } = {}) {
    const tip = tipForDate(date);
    const leaders = await this.leaderboardService.entries(3);
    const fields = [
      { name: 'CATEGORY', value: tip.category, inline: true },
      { name: 'TIP', value: tip.title, inline: false },
    ];
    if (leaders.length > 0) {
      const lines = leaders.map(
        (row, index) =>
          `${index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'} **${row.username}** — ${formatNumber(row.solves)} solved • ${formatNumber(row.xp)} XP`,
      );
      fields.push({ name: 'TOP OPERATORS', value: lines.join('\n'), inline: false });
    }
    if (this.webUrl) {
      fields.push({ name: 'PRACTICE', value: `[Open the web terminal](${this.webUrl}) — new challenges are waiting.` });
    }

    const message = await this.post({
      content: '```\nDAILY TIP & TRICKS\n```',
      embeds: [
        brandEmbed({
          title: '[ HELLO CAT // CHANNEL ASSISTANT ]',
          description: tip.body,
          color: COLORS.info,
          fields,
          footer: `${BRAND.footer} • ONE TIP PER DAY`,
        }),
      ],
    });

    if (message) {
      this.logger.info('Daily tip posted', { tipId: tip.id });
    }
    return message;
  }

  /** A compact leaderboard recap for the channel. */
  async announceLeaderboard({ limit = 5 } = {}) {
    const rows = await this.leaderboardService.entries(limit);
    if (rows.length === 0) return null;
    const lines = rows.map((row, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `\`#${String(index + 1).padStart(2, '0')}\``;
      return `${medal} **${row.username}** — ${formatNumber(row.solves)} solved • ${formatNumber(row.xp)} XP • ${formatNumber(row.coins)} ${BRAND.currency}`;
    });
    return this.post({
      content: '```\nCHALLENGE LEADERBOARD\n```',
      embeds: [
        brandEmbed({
          title: '[ HELLO CAT // CHALLENGE LEADERBOARD ]',
          description: lines.join('\n'),
          color: COLORS.green,
          footer: `${BRAND.footer} • RANKED BY CHALLENGES SOLVED`,
        }),
      ],
    });
  }
}
