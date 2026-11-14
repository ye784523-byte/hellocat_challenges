export const BRAND = Object.freeze({
  name: 'HELLO CAT',
  tagline: 'SECURITY OPERATIONS TERMINAL',
  footer: 'HELLO CAT // SECURE CHANNEL',
  currency: 'CATCOINS',
  version: '1.0.0',
});

export const COLORS = Object.freeze({
  green: 0x00ff88,
  darkGreen: 0x1f8f5a,
  charcoal: 0x161b18,
  black: 0x070a08,
  warning: 0xffc857,
  danger: 0xff4d5e,
  info: 0x38bdf8,
  muted: 0x5c6b62,
});

export const CATEGORIES = Object.freeze([
  'Linux',
  'Networking',
  'Web Security',
  'Cryptography',
  'Digital Forensics',
  'OSINT',
  'Programming',
  'General Security',
]);

export const DIFFICULTIES = Object.freeze(['Easy', 'Medium', 'Hard', 'Expert']);

export const DIFFICULTY_COLORS = Object.freeze({
  Easy: COLORS.green,
  Medium: COLORS.info,
  Hard: COLORS.warning,
  Expert: COLORS.danger,
});

export const RANKS = Object.freeze([
  { name: 'Script Kiddie', minXp: 0 },
  { name: 'Packet Scout', minXp: 250 },
  { name: 'Terminal Runner', minXp: 750 },
  { name: 'Cyber Analyst', minXp: 1750 },
  { name: 'Exploit Researcher', minXp: 3500 },
  { name: 'Security Engineer', minXp: 6500 },
  { name: 'Ghost Operator', minXp: 11000 },
  { name: 'Root Access', minXp: 18000 },
]);

export const ACHIEVEMENTS = Object.freeze([
  {
    id: 'first-blood',
    name: 'First Blood',
    description: 'Complete your first challenge.',
    xp: 50,
    coins: 25,
    icon: '🩸',
    check: (stats) => stats.solves >= 1,
  },
  {
    id: 'terminal-ghost',
    name: 'Terminal Ghost',
    description: 'Complete 10 challenges.',
    xp: 150,
    coins: 75,
    icon: '👻',
    check: (stats) => stats.solves >= 10,
  },
  {
    id: 'cipher-breaker',
    name: 'Cipher Breaker',
    description: 'Solve 5 cryptography challenges.',
    xp: 120,
    coins: 60,
    icon: '🔐',
    check: (stats) => (stats.categoryCounts.Cryptography ?? 0) >= 5,
  },
  {
    id: 'daily-operator',
    name: 'Daily Operator',
    description: 'Complete 7 daily challenges.',
    xp: 150,
    coins: 75,
    icon: '📅',
    check: (stats) => stats.dailyCompletions >= 7,
  },
  {
    id: 'root-hunter',
    name: 'Root Hunter',
    description: 'Complete an Expert challenge.',
    xp: 200,
    coins: 100,
    icon: '🏴',
    check: (stats) => stats.expertSolves >= 1,
  },
  {
    id: 'polyglot',
    name: 'Polyglot',
    description: 'Solve at least one challenge in every category.',
    xp: 250,
    coins: 125,
    icon: '🌐',
    check: (stats) =>
      Object.values(stats.categoryCounts).filter((count) => count > 0).length >= 8,
  },
  {
    id: 'night-shift',
    name: 'Night Shift',
    description: 'Hold a 3-day daily streak.',
    xp: 90,
    coins: 40,
    icon: '🌙',
    check: (stats) => stats.bestStreak >= 3,
  },
  {
    id: 'cat-burglar',
    name: 'Cat Burglar',
    description: 'Accumulate 500 CATCOINS.',
    xp: 100,
    coins: 0,
    icon: '🐈',
    check: (stats) => stats.coins >= 500,
  },
]);

export const SHOP_ITEMS = Object.freeze([
  {
    id: 'badge-white-rabbit',
    name: 'White Rabbit Badge',
    type: 'badge',
    price: 150,
    description: 'A minimal white rabbit sigil for your profile.',
    cosmetic: 'rabbit',
  },
  {
    id: 'badge-black-cat',
    name: 'Black Cat Badge',
    type: 'badge',
    price: 150,
    description: 'A black cat silhouette for operators who move quietly.',
    cosmetic: 'black-cat',
  },
  {
    id: 'title-packet-ghost',
    name: 'Packet Ghost Title',
    type: 'title',
    price: 300,
    description: 'Display the title "Packet Ghost" on your profile.',
    cosmetic: 'Packet Ghost',
  },
  {
    id: 'title-root-whisperer',
    name: 'Root Whisperer Title',
    type: 'title',
    price: 500,
    description: 'Display the title "Root Whisperer" on your profile.',
    cosmetic: 'Root Whisperer',
  },
  {
    id: 'rank-neon-terminal',
    name: 'Neon Terminal Rank',
    type: 'cosmetic-rank',
    price: 750,
    description: 'A cosmetic terminal-green rank accent.',
    cosmetic: 'Neon Terminal',
  },
  {
    id: 'badge-zero-day',
    name: 'Zero Day Badge',
    type: 'badge',
    price: 1000,
    description: 'For operators who collect knowledge, not exploits.',
    cosmetic: 'zero-day',
  },
]);

export const COMMUNITY_RULES = Object.freeze([
  '**Authorized learning only.** All challenges use fictional systems and lab scenarios. Never target real systems, accounts, or people.',
  '**No harassment.** Keep security discussion respectful and professional.',
  '**No credential theft or phishing.** Do not share, request, or use stolen credentials.',
  '**No flag leaks.** Do not post challenge flags, solutions, or hints outside the intended channels.',
  '**No spam.** Rate limits and anti-spam monitoring are active.',
  '**No illegal content.** Discussing defensive concepts is welcome; sharing malicious tooling for real-world abuse is not.',
  '**Follow moderator instructions.** Reports are reviewed confidentially.',
]);

export const DEFAULT_SETTINGS = Object.freeze({
  guild: {
    dailyChallengeEnabled: true,
    dailyRewardXp: 75,
    dailyRewardCoins: 30,
    dailyChannelId: null,
    challengeChannelId: null,
  },
  daily: {
    date: null,
    challengeId: null,
    completions: {},
  },
  announcements: {
    solvesSince: null,
    tipDate: null,
    tipAnnouncedAt: null,
    leaderboardWeek: null,
    leaderboardAnnouncedAt: null,
  },
  meta: {
    createdAt: null,
    updatedAt: null,
  },
});

export const DEFAULT_COOLDOWNS = Object.freeze({
  ping: 3,
  help: 5,
  tutorial: 5,
  hint: 8,
  challenge: 5,
  challenges: 5,
  tools: 3,
  quiz: 15,
  guesscommand: 15,
  terminal: 10,
  decrypt: 15,
  daily: 10,
  leaderboard: 8,
  profile: 5,
  rank: 5,
  history: 8,
  shop: 5,
  buy: 5,
  inventory: 5,
  balance: 5,
  achievements: 5,
});
