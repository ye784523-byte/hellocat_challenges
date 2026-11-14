import { dateKey, weekKey } from '../utils/time.js';

const MAX_SOLVES_PER_TICK = 10;

/**
 * Keeps the channel alive.
 *
 * The web terminal and the bot are separate processes that share the JSON
 * store, so the assistant polls the submissions for solves that were not
 * announced yet and celebrates them in the channel.
 */
export function startAnnouncementScheduler(client, ctx) {
  let running = false;

  /** The moment of the newest solve that was already announced. */
  async function baseline() {
    const settings = await ctx.storage.settingsRepo.get();
    if (settings.announcements?.solvesSince) return settings.announcements.solvesSince;
    const now = new Date().toISOString();
    await ctx.storage.settingsRepo.update((data) => {
      data.announcements ??= {};
      data.announcements.solvesSince = now;
      return data;
    });
    return now;
  }

  async function announceSolves() {
    const since = await baseline();
    const submissions = await ctx.storage.submissionsRepo.all();
    const pending = submissions
      .filter((entry) => entry.correct && entry.createdAt > since)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, MAX_SOLVES_PER_TICK);
    if (pending.length === 0) return;

    for (const submission of pending) {
      try {
        const challenge = await ctx.services.challengeService.get(submission.challengeId);
        await ctx.services.announcementService.announceSolve({ submission, challenge });
        // A cleared prerequisite unseals the next challenge in the chain.
        const unlocked = await ctx.services.challengeService.unlockedBy?.(submission.challengeId);
        if (unlocked?.length) {
          await ctx.services.announcementService.announceUnlock({ challenge, unlocked });
        }
      } catch (error) {
        ctx.logger.warn('Solve announcement failed', {
          challengeId: submission.challengeId,
          error: error.message,
        });
      }
    }

    const newest = pending[pending.length - 1].createdAt;
    await ctx.storage.settingsRepo.update((data) => {
      data.announcements ??= {};
      if (!data.announcements.solvesSince || data.announcements.solvesSince < newest) {
        data.announcements.solvesSince = newest;
      }
      return data;
    });
  }

  async function announceDailyTip() {
    const today = dateKey(new Date(), ctx.config.BOT_TIMEZONE);
    const settings = await ctx.storage.settingsRepo.get();
    if (settings.announcements?.tipDate === today) return;
    await ctx.services.announcementService.announceDailyTip();
    await ctx.storage.settingsRepo.update((data) => {
      data.announcements ??= {};
      data.announcements.tipDate = today;
      data.announcements.tipAnnouncedAt = new Date().toISOString();
      return data;
    });
  }

  /** The leaderboard recap is posted once per week. */
  async function announceWeeklyLeaderboard() {
    const week = weekKey(new Date(), ctx.config.BOT_TIMEZONE);
    const settings = await ctx.storage.settingsRepo.get();
    if (settings.announcements?.leaderboardWeek === week) return;
    const message = await ctx.services.announcementService.announceLeaderboard();
    if (!message) return;
    await ctx.storage.settingsRepo.update((data) => {
      data.announcements ??= {};
      data.announcements.leaderboardWeek = week;
      data.announcements.leaderboardAnnouncedAt = new Date().toISOString();
      return data;
    });
  }

  async function tick() {
    if (running || !client.isReady()) return;
    running = true;
    try {
      if (ctx.config.ANNOUNCE_SOLVES) await announceSolves();
      if (ctx.config.DAILY_TIPS_ENABLED) await announceDailyTip();
      if (ctx.config.WEEKLY_LEADERBOARD_ENABLED) await announceWeeklyLeaderboard();
    } catch (error) {
      ctx.logger.warn('Announcement scheduler tick failed', { error: error.message });
    } finally {
      running = false;
    }
  }

  const interval = setInterval(tick, (ctx.config.ANNOUNCE_POLL_SECONDS ?? 15) * 1000);
  interval.unref?.();
  tick();
  return {
    tick,
    stop: () => clearInterval(interval),
  };
}
