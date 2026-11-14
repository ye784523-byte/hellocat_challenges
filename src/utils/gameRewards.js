import { dateKey } from './time.js';

export async function awardGameReward(ctx, { userId, username, type, correct, xp = 0, coins = 0 }) {
  if (!correct) return { duplicate: false, xp: 0, coins: 0, achievements: [] };
  const key = `game:${type}:${dateKey(new Date(), ctx.config.BOT_TIMEZONE)}`;
  let xpResult = { duplicate: true, added: 0 };
  try {
    if (xp > 0) {
      xpResult = await ctx.services.playerService.addXp(userId, xp, {
        source: `game:${type}`,
        key,
        username,
      });
    }
  } catch (error) {
    ctx.logger.error('Game XP award failed', { error: error.message });
  }

  let coinsAwarded = 0;
  if (!xpResult.duplicate && coins > 0) {
    try {
      const credit = await ctx.services.economyService.credit(userId, coins, {
        reason: `Game reward: ${type}`,
        ref: key,
      });
      coinsAwarded = credit.credited;
    } catch (error) {
      ctx.logger.error('Game coin award failed', { error: error.message });
    }
  }

  let achievements = [];
  try {
    achievements = await ctx.services.achievementService.evaluate(userId, { username });
  } catch (error) {
    ctx.logger.error('Achievement evaluation failed', { error: error.message });
  }

  return {
    duplicate: xpResult.duplicate,
    xp: xpResult.added,
    coins: coinsAwarded,
    achievements,
  };
}
