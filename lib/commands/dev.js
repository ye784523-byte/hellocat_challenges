/** Interpreter and developer tooling commands. */

import { PythonInterpreter } from '../python.js';
import { err, out, parseFlags } from './util.js';

export const devCommands = {
  python3: {
    usage: 'python3 [options] [FILE | -c CODE]',
    summary: 'run the lab Python interpreter',
    run(context) {
      const { flags, operands } = parseFlags(context.args, {
        boolean: ['V', 'v', 'i', 'u', 'q'],
        withValue: ['c', 'm'],
      });

      if (flags.V) {
        out(context, 'Python 3.11.2 (main, Nov 11 2026, 15:00:00) [GCC 13.2.0] on linux');
        return 0;
      }

      const interpreter = new PythonInterpreter({
        write: (text) => context.stdout.write(text),
        writeError: (text) => context.stderr.write(text),
      });

      let source = null;
      let filename = '<stdin>';

      if (flags.c !== undefined) {
        source = String(flags.c);
        filename = '<string>';
      } else if (operands.length > 0) {
        const target = operands[0];
        try {
          source = context.fs.readFile(context.cwd, target);
          filename = target;
        } catch (error) {
          err(context, `python3: can't open file '${target}': [Errno 2] No such file or directory`);
          return 2;
        }
      } else {
        source = context.stdin;
        filename = '<stdin>';
      }

      if (!source.trim()) return 0;

      const code = interpreter.run(source, { filename });
      return code;
    },
  },

  python: {
    usage: 'python3 [options] [FILE | -c CODE]',
    summary: 'run the lab Python interpreter',
    run(context) {
      context.args = ['3', ...context.args];
      return devCommands.python3.run(context);
    },
  },

  perl: {
    usage: 'perl [options] [FILE | -e CODE]',
    summary: 'run a short Perl-style one-liner',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { withValue: ['e'] });
      const code = flags.e ?? operands[0];
      if (!code) {
        err(context, 'Usage: perl [switches] [--] [programfile] [arguments]');
        return 2;
      }
      // A deliberately small subset: substitutions and prints.
      let working = code;
      working = working.replace(/s\/([^/]*)\/([^/]*)\//g, (_match, from, to) => from);
      const printMatch = /print\s+["']([^"']*)["']/.exec(code);
      if (printMatch) out(context, printMatch[1]);
      else out(context, working);
      return 0;
    },
  },

  git: {
    usage: 'git [command]',
    summary: 'version control helper',
    run(context) {
      const [subcommand] = context.args;
      switch (subcommand) {
        case 'status':
          out(context, 'On branch main');
          out(context, 'nothing to commit, working tree clean');
          return 0;
        case 'log':
          out(context, 'commit 9f2a1c4b7d3e6f0a1b2c3d4e5f60718293a4b5c6');
          out(context, 'Author: Hello Cat Intel <intel@hellocat.lab>');
          out(context, 'Date:   Tue Nov 11 09:00:00 2026 +0000');
          out(context, '');
          out(context, '    initial lab import');
          return 0;
        case 'clone':
          err(context, 'fatal: could not read from remote repository (lab simulation)');
          return 128;
        case undefined:
          out(context, 'usage: git [-v | --version] [-h | --help] [-C <path>] ...');
          return 1;
        default:
          err(context, `git: '${subcommand}' is not a git command. See 'git --help'.`);
          return 1;
      }
    },
  },

  gcc: {
    usage: 'gcc [options] FILE',
    summary: 'compile a C source file (lab simulation)',
    run(context) {
      const target = context.args.find((argument) => !argument.startsWith('-'));
      if (!target) {
        err(context, 'gcc: fatal error: no input files');
        return 1;
      }
      try {
        context.fs.readFile(context.cwd, target);
      } catch {
        err(context, `gcc: error: ${target}: No such file or directory`);
        return 1;
      }
      out(context, `${target.replace(/\.[^.]+$/, '')}.o generated (lab simulation)`);
      return 0;
    },
  },

  nano: {
    usage: 'nano FILE',
    summary: 'edit a file in a simple screen editor',
    run(context) {
      const target = context.args[0];
      if (!target) {
        err(context, 'Usage: nano [options] FILE');
        return 1;
      }
      let content = '';
      try {
        content = context.fs.readFile(context.cwd, target);
      } catch {
        content = '';
      }
      out(context, `  GNU nano 7.2                    ${target}`);
      out(context, '');
      for (const line of content.split('\n')) out(context, line);
      out(context, '');
      out(context, '^G Get Help    ^O Write Out   ^W Where Is   ^K Cut Text   ^X Exit');
      out(context, '[ lab editor: content left unchanged ]');
      return 0;
    },
  },

  vim: {
    usage: 'vim FILE',
    summary: 'edit a file in a simple screen editor',
    run(context) {
      return devCommands.nano.run(context);
    },
  },
};
