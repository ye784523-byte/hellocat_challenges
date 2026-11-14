const FILES = Object.freeze({
  '/': { type: 'dir', entries: ['home', 'var'] },
  '/home': { type: 'dir', entries: ['analyst'] },
  '/home/analyst': {
    type: 'dir',
    entries: ['notes', 'welcome.txt'],
  },
  '/home/analyst/welcome.txt': {
    type: 'file',
    content: 'Hello Cat lab terminal. This environment is simulated. No host commands are executed.',
  },
  '/home/analyst/notes': { type: 'dir', entries: ['todo.txt', 'decoy.txt'] },
  '/home/analyst/notes/todo.txt': {
    type: 'file',
    content: 'TODO: audit rotation pending. Check /var/log/lab/audit.log for the operator token.',
  },
  '/home/analyst/notes/decoy.txt': {
    type: 'file',
    content: 'Nothing useful here. Keep moving, operator.',
  },
  '/var': { type: 'dir', entries: ['log'] },
  '/var/log': { type: 'dir', entries: ['lab'] },
  '/var/log/lab': { type: 'dir', entries: ['audit.log', 'access.log'] },
  '/var/log/lab/access.log': {
    type: 'file',
    content: '127.0.0.1 - GET /health 200\n127.0.0.1 - GET /challenges 200\n',
  },
  '/var/log/lab/audit.log': {
    type: 'file',
    content: 'AUDIT 2026-01-01 operator=white-rabbit token=HC{S1MUL4T3D_T3RM1N4L}\n',
  },
});

function resolvePath(cwd, target) {
  if (!target || target === '.') return cwd;
  const path = target.startsWith('/') ? target : `${cwd === '/' ? '' : cwd}/${target}`;
  const parts = [];
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return `/${parts.join('/')}`;
}

function tokenIn(content) {
  const match = /HC\{[A-Z0-9_]+\}/.exec(content);
  return match?.[0] ?? null;
}

export function createTerminal() {
  const state = {
    cwd: '/home/analyst',
    log: [
      'Hello Cat simulated terminal v1.0',
      'This is a fictional environment. Commands never touch the host.',
      'Objective: locate the operator token in /var/log/lab and read it.',
      'Type `help` for allowed commands.',
    ],
    finished: false,
    token: null,
    commands: 0,
  };

  function push(line) {
    state.log.push(line);
    if (state.log.length > 16) state.log = state.log.slice(-16);
  }

  function help() {
    return [
      'Allowed commands: pwd, ls [path], cd <path>, cat <file>, help, clear',
      'No shell metacharacters, pipes, or host execution are supported.',
    ];
  }

  function execute(raw) {
    const input = String(raw ?? '').trim();
    if (!input) return { output: 'Enter a command.' };
    if (input.length > 200) return { output: 'Command too long.' };
    if (/[;&|`$><\\]/.test(input)) {
      return { output: 'Security policy: shell metacharacters are not permitted in the simulator.' };
    }
    state.commands += 1;
    const [command, ...args] = input.split(/\s+/);
    const argument = args.join(' ');

    switch (command) {
      case 'help':
        return { output: help().join('\n') };
      case 'clear':
        state.log = ['[screen cleared]'];
        return {};
      case 'pwd':
        return { output: state.cwd };
      case 'ls': {
        const target = resolvePath(state.cwd, argument);
        const entry = FILES[target];
        if (!entry) return { output: `ls: cannot access '${argument || target}': No such file or directory` };
        if (entry.type === 'file') return { output: target.split('/').pop() };
        return { output: entry.entries.join('  ') };
      }
      case 'cd': {
        const target = resolvePath(state.cwd, argument || '/home/analyst');
        const entry = FILES[target];
        if (!entry) return { output: `cd: no such file or directory: ${argument}` };
        if (entry.type !== 'dir') return { output: `cd: not a directory: ${argument}` };
        state.cwd = target;
        return { output: '' };
      }
      case 'cat': {
        if (!argument) return { output: 'cat: missing file operand' };
        const target = resolvePath(state.cwd, argument);
        const entry = FILES[target];
        if (!entry) return { output: `cat: ${argument}: No such file or directory` };
        if (entry.type !== 'file') return { output: `cat: ${argument}: Is a directory` };
        const token = tokenIn(entry.content);
        if (token) {
          state.token = token;
          state.finished = true;
        }
        return { output: entry.content.trim() };
      }
      default:
        return { output: `command not found: ${command}. Type help for allowed commands.` };
    }
  }

  push(`analyst@hellocat:${state.cwd}$ pwd`);
  push(state.cwd);

  return {
    type: 'terminal',
    title: 'SIMULATED TERMINAL',
    submit(input) {
      if (state.finished) throw new Error('Terminal objective already complete.');
      push(`analyst@hellocat:${state.cwd}$ ${input}`);
      const result = execute(input);
      if (result.output) push(result.output);
      if (state.finished) {
        return {
          correct: true,
          finished: true,
          feedback: {
            expected: state.token,
            message: 'Operator token located. Simulated shell session complete.',
            output: result.output,
          },
        };
      }
      return {
        correct: false,
        finished: false,
        feedback: { message: result.output || 'OK', output: result.output },
      };
    },
    view() {
      return {
        kind: 'terminal',
        finished: state.finished,
        cwd: state.cwd,
        log: state.log.slice(),
        commands: state.commands,
      };
    },
  };
}
