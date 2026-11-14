import { rankForXp } from './rankingService.js';

/**
 * Builds the operator leaderboard.
 *
 * The ranking is driven by challenges solved, because that is the activity
 * the channel celebrates. Experience points break ties, and the catcoin
 * balance is carried along for the announcements.
 */
export class LeaderboardService {
  constructor({ usersRepo, submissionsRepo, economyRepo, logger }) {
    this.usersRepo = usersRepo;
    this.submissionsRepo = submissionsRepo;
    this.economyRepo = economyRepo;
    this.logger = logger;
  }

  /** Every operator with their solved count, experience and catcoins. */
  async entries(limit = 100) {
    const users = await this.usersRepo.all();
    const submissions = await this.submissionsRepo.all();
    const accounts = this.economyRepo ? await this.economyRepo.all() : [];

    const coinsByUser = new Map(accounts.map((account) => [String(account.id), account.coins ?? 0]));
    const solvedByUser = new Map();
    for (const submission of submissions) {
      if (!submission.correct) continue;
      const key = String(submission.userId);
      if (!solvedByUser.has(key)) solvedByUser.set(key, new Set());
      solvedByUser.get(key).add(submission.challengeId);
    }

    const rows = users.map((user) => {
      const userId = String(user.id);
      return {
        userId,
        username: user.username ?? 'operator',
        xp: user.xp ?? 0,
        solves: solvedByUser.get(userId)?.size ?? 0,
        coins: coinsByUser.get(userId) ?? 0,
        streak: user.streak?.current ?? 0,
        rank: rankForXp(user.xp ?? 0),
      };
    });

    return rows
      .sort((a, b) => b.solves - a.solves || b.xp - a.xp || a.username.localeCompare(b.username))
      .slice(0, limit)
      .map((row, index) => ({ ...row, position: index + 1 }));
  }

  /** The position of a single operator inside the full leaderboard. */
  async positionOf(userId) {
    const target = String(userId);
    const rows = await this.entries(Number.MAX_SAFE_INTEGER);
    const index = rows.findIndex((row) => row.userId === target);
    if (index === -1) {
      return { position: null, total: rows.length, ...(await this.entryFor(target)) };
    }
    return { position: index + 1, total: rows.length, ...rows[index] };
  }

  /** The leaderboard row of a single operator, even without a position. */
  async entryFor(userId) {
    const target = String(userId);
    const rows = await this.entries(Number.MAX_SAFE_INTEGER);
    return rows.find((row) => row.userId === target) ?? {
      userId: target,
      username: 'operator',
      xp: 0,
      solves: 0,
      coins: 0,
      streak: 0,
      rank: rankForXp(0),
    };
  }
}
