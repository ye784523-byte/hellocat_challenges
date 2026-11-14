import { GatewayIntentBits } from 'discord.js';

export function startDailyScheduler(client, ctx) {
  let running = false;

  async function tick() {
    if (running || !client.isReady()) return;
    running = true;
    try {
      const daily = await ctx.services.dailyService.ensureDaily();
      if (!daily.challenge) return;

      const channelId =
        ctx.config.CHALLENGE_CHANNEL_ID ||
        (await ctx.storage.settingsRepo.get()).guild?.dailyChannelId ||
        null;
      if (!channelId) return;

      const channel =
        client.channels.cache.get(channelId) ??
        (ctx.config.GUILD_ID
          ? client.guilds.cache.get(ctx.config.GUILD_ID)?.channels?.cache?.get(channelId)
          : null);
      if (!channel?.isTextBased?.()) return;

      const settings = await ctx.storage.settingsRepo.get();
      if (settings.daily?.date !== daily.date || settings.daily?.announcedAt) return;

      // The channel assistant explains the challenge and links the terminal.
      await ctx.services.announcementService.announceChallenge(daily.challenge);

      await ctx.storage.settingsRepo.update((data) => {
        if (data.daily?.date === daily.date) {
          data.daily.announcedAt = new Date().toISOString();
        }
        return data;
      });
      ctx.logger.info('Daily challenge announced', {
        date: daily.date,
        challengeId: daily.challenge.id,
        channelId,
      });
    } catch (error) {
      ctx.logger.warn('Daily scheduler tick failed', { error: error.message });
    } finally {
      running = false;
    }
  }

  const interval = setInterval(tick, 60_000);
  interval.unref?.();
  tick();
  return () => clearInterval(interval);
}
