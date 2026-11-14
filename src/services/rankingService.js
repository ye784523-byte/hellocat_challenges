import { RANKS } from '../constants/index.js';

export function rankForXp(xp) {
  const safeXp = Math.max(0, Number(xp) || 0);
  let index = 0;
  for (let i = 0; i < RANKS.length; i += 1) {
    if (safeXp >= RANKS[i].minXp) index = i;
  }
  const current = RANKS[index];
  const next = RANKS[index + 1] ?? null;
  const floor = current.minXp;
  const ceiling = next ? next.minXp : floor;
  const span = Math.max(1, ceiling - floor);
  const intoRank = Math.max(0, safeXp - floor);
  const progress = next ? Math.min(1, intoRank / span) : 1;

  return {
    name: current.name,
    index: index + 1,
    totalRanks: RANKS.length,
    minXp: floor,
    next: next ? { name: next.name, minXp: next.minXp } : null,
    xpIntoRank: intoRank,
    xpToNext: next ? Math.max(0, next.minXp - safeXp) : 0,
    progress,
    isMax: !next,
  };
}

export function nextRank(xp) {
  return rankForXp(xp).next;
}

export function rankName(xp) {
  return rankForXp(xp).name;
}

export function rankThresholds() {
  return RANKS.map((rank) => ({ ...rank }));
}
