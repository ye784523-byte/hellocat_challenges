/**
 * The welcome briefing.
 *
 * A new member is walked through the whole loop: pick a target, read the
 * brief, unlock a hint and capture the flag in the web terminal.
 */

export const WELCOME_STEPS = Object.freeze([
  {
    step: '01',
    title: 'Pick a target',
    command: '/challenge browse difficulty:Easy',
    detail: 'The board lists every active lab with its category, difficulty and reward.',
  },
  {
    step: '02',
    title: 'Read the brief',
    command: '/challenge info id:HC-001',
    detail: 'The objective states exactly what to deliver. Solve the objective, not the backstory.',
  },
  {
    step: '03',
    title: 'Unlock a hint',
    command: '/hint challenge:HC-001',
    detail: 'Free hints first. Save your CATCOINS for the labs where you are genuinely stuck.',
  },
  {
    step: '04',
    title: 'Capture the flag',
    command: 'web terminal',
    detail: 'Flags are submitted in the web terminal, in a real shell against a fictional lab.',
  },
]);

export const WELCOME_LINKS = Object.freeze([
  { label: 'Browse the challenge board', command: '/challenge browse' },
  { label: 'See the leaderboard', command: '/leaderboard' },
  { label: 'Every command', command: '/help' },
  { label: 'How the terminal works', command: '/tutorial topic lesson:orientation' },
]);
