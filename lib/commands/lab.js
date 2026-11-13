/** Challenge-aware commands: list, start, submit and hint. */

import { err, out, parseFlags } from './util.js';

function severityColor(difficulty) {
  return {
    Easy: '\x1b[1;32m',
    Medium: '\x1b[1;36m',
    Hard: '\x1b[1;33m',
    Expert: '\x1b[1;31m',
  }[difficulty] ?? '';
}

export const labCommands = {
  challenges: {
    usage: 'challenges',
    summary: 'list the active challenges',
    async run(context) {
      const { flags } = parseFlags(context.args, { boolean: ['all', 'solved'] });
      const list = await context.session.listChallenges();
      const solved = new Set(await context.session.solvedChallengeIds());
      const visible = list.filter((challenge) => flags.all || challenge.active);

      out(context, `\x1b[1;32m${visible.length}\x1b[0m challenges available in the Hello Cat lab:\n`);
      for (const challenge of visible) {
        const marker = solved.has(challenge.id)
          ? '\x1b[1;32m✔\x1b[0m'
          : challenge.locked
            ? '\x1b[1;33m🔒\x1b[0m'
            : '\x1b[2m·\x1b[0m';
        const colour = severityColor(challenge.difficulty);
        const gate = challenge.locked
          ? ` \x1b[2m(locked: solve ${(challenge.missingPrerequisites ?? []).join(', ')})\x1b[0m`
          : '';
        out(context, `  ${marker} \x1b[1m${challenge.id}\x1b[0m  ${challenge.title.padEnd(28)} ${colour}${challenge.difficulty.padEnd(7)}\x1b[0m ${challenge.category}${gate}`);
      }
      out(context, '\nUse \x1b[1mstart <id>\x1b[0m to load an environment, \x1b[1msubmit <flag>\x1b[0m to submit a flag.');
      return 0;
    },
  },

  start: {
    usage: 'start <challenge-id>',
    summary: 'load a challenge environment',
    async run(context) {
      const { operands } = parseFlags(context.args);
      const id = operands[0];
      if (!id) {
        err(context, 'Usage: start <challenge-id>');
        return 1;
      }
      const result = await context.session.startChallenge(id.toUpperCase());
      if (!result.ok) {
        err(context, result.message);
        return 1;
      }
      out(context, result.banner);
      out(context, `\x1b[1;32mObjective:\x1b[0m ${result.objective}`);
      out(context, `\x1b[2mType 'help' for commands, 'submit <flag>' to answer.\x1b[0m`);
      return 0;
    },
  },

  submit: {
    usage: 'submit <flag>',
    summary: 'submit a flag for the active challenge',
    async run(context) {
      const { operands } = parseFlags(context.args);
      const flag = operands.join(' ').trim();
      if (!flag) {
        err(context, 'Usage: submit <flag>');
        return 1;
      }
      const result = await context.session.submitFlag(flag);
      if (result.ok) {
        out(context, `\x1b[1;32m✔ Correct!\x1b[0m ${result.message}`);
        return 0;
      }
      err(context, `✘ ${result.message}`);
      return 1;
    },
  },

  hint: {
    usage: 'hint [index]',
    summary: 'reveal a hint for the active challenge',
    async run(context) {
      const result = await context.session.requestHint();
      if (!result.ok) {
        err(context, result.message);
        return 1;
      }
      out(context, `\x1b[1;33mHint:\x1b[0m ${result.text}`);
      return 0;
    },
  },

  objective: {
    usage: 'objective',
    summary: 'show the objective of the active challenge',
    async run(context) {
      const objective = await context.session.objective();
      if (!objective) {
        err(context, 'No challenge is loaded. Try: start HC-001');
        return 1;
      }
      out(context, objective);
      return 0;
    },
  },

  reset: {
    usage: 'reset',
    summary: 'reset the active challenge environment',
    async run(context) {
      const result = await context.session.resetChallenge();
      if (!result.ok) {
        err(context, result.message);
        return 1;
      }
      out(context, result.banner);
      return 0;
    },
  },
};
