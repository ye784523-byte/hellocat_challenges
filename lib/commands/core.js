/** Core navigation, shell builtins and system information commands. */

import { FsError, modeString, octal } from '../vfs.js';
import { ShellExit } from '../shell.js';
import { err, formatLongTimestamp, formatTimestamp, out, parseFlags, printTable } from './util.js';

const HELP_GROUPS = [
  {
    title: 'FILES & DIRECTORIES',
    commands: [
      ['ls [options] [path]', 'list directory contents'],
      ['cd [path]', 'change the working directory'],
      ['pwd', 'print the working directory'],
      ['cat FILE...', 'print file contents'],
      ['tree [path]', 'show the directory tree'],
      ['stat FILE', 'show file metadata'],
      ['file FILE', 'identify a file type'],
      ['mkdir / touch / rm / cp / mv / ln', 'create, move and remove files'],
      ['chmod MODE FILE', 'change file permissions'],
      ['chown OWNER FILE', 'change file ownership'],
    ],
  },
  {
    title: 'TEXT PROCESSING',
    commands: [
      ['grep PATTERN FILE...', 'search for a pattern'],
      ['find [path] [expression]', 'search for files'],
      ['head / tail / wc / cut / sort / uniq', 'extract and rearrange text'],
      ['tr SET1 SET2', 'translate or delete characters'],
      ['sed SCRIPT FILE', 'stream editor'],
      ['awk PROGRAM FILE', 'pattern scanning and processing'],
      ['xxd / hexdump / od', 'inspect binary content'],
    ],
  },
  {
    title: 'RECON & ENCODING',
    commands: [
      ['nmap [options] TARGET', 'port and service scanner'],
      ['nikto / gobuster / whatweb', 'web application scanners'],
      ['strings FILE', 'print printable strings'],
      ['base64 [-d] [FILE]', 'base64 encode or decode'],
      ['md5sum / sha256sum', 'hash files'],
      ['openssl COMMAND', 'cryptography and TLS helpers'],
    ],
  },
  {
    title: 'NETWORK',
    commands: [
      ['ping HOST', 'send ICMP echo requests'],
      ['curl / wget URL', 'fetch a URL'],
      ['dig / nslookup / host', 'DNS lookups'],
      ['netstat / ss / ip / arp', 'inspect connections and neighbours'],
      ['nc HOST PORT', 'open a TCP connection'],
    ],
  },
  {
    title: 'SESSION & LABS',
    commands: [
      ['help', 'show this help'],
      ['challenges', 'list the active challenges'],
      ['start <id>', 'load a challenge environment'],
      ['submit <flag>', 'submit a flag to the current challenge'],
      ['hint', 'reveal a hint for the current challenge'],
      ['history', 'show the command history'],
      ['whoami / id / uname / hostname', 'session information'],
      ['clear', 'clear the screen'],
    ],
  },
];

function requireArg(context, message) {
  err(context, message);
  return 1;
}

export const coreCommands = {
  help: {
    usage: 'help',
    summary: 'show the available commands',
    run(context) {
      for (const group of HELP_GROUPS) {
        out(context, `\x1b[1;32m${group.title}\x1b[0m`);
        for (const [usage, summary] of group.commands) {
          out(context, `  \x1b[1;36m${usage.padEnd(42)}\x1b[0m ${summary}`);
        }
        out(context, '');
      }
      out(context, 'Every command runs against an in-memory filesystem. No host commands execute.');
      return 0;
    },
  },

  man: {
    usage: 'man COMMAND',
    summary: 'show help for a command',
    run(context) {
      const [name] = context.args;
      if (!name) return requireArg(context, 'What manual page do you want?');
      const definition = context.shell.registry.get(name);
      if (!definition) {
        err(context, `No manual entry for ${name}`);
        return 1;
      }
      out(context, `\x1b[1m${name}\x1b[0m — ${definition.summary ?? 'no description'}`);
      out(context, `\n\x1b[1mSYNOPSIS\x1b[0m\n    ${definition.usage ?? name}`);
      return 0;
    },
  },

  pwd: {
    usage: 'pwd',
    summary: 'print the working directory',
    run(context) {
      out(context, context.cwd);
      return 0;
    },
  },

  cd: {
    usage: 'cd [path]',
    summary: 'change the working directory',
    run(context) {
      const target = context.args[0] ?? context.env.HOME ?? '/home/analyst';
      if (target === '-') {
        const previous = context.env.OLDPWD ?? context.cwd;
        out(context, context.cwd);
        context.cwd = previous;
        return 0;
      }
      const node = context.fs.lookup(context.cwd, target);
      if (!node.isDir()) {
        err(context, `cd: ${target}: Not a directory`);
        return 1;
      }
      context.fs.assertRead(node);
      context.env.OLDPWD = context.cwd;
      context.cwd = node.path;
      context.env.PWD = node.path;
      return 0;
    },
  },

  ls: {
    usage: 'ls [options] [path...]',
    summary: 'list directory contents',
    run(context) {
      const { flags, operands } = parseFlags(context.args, {
        boolean: ['l', 'a', 'A', 'h', 't', 'S', 'r', 'R', '1', 'F', 'd'],
        aliases: { all: 'a', almost: 'A', long: 'l', human: 'h', recursive: 'R' },
      });

      const paths = operands.length > 0 ? operands : ['.'];
      const showAll = Boolean(flags.a);
      const showAlmost = Boolean(flags.A);
      const long = Boolean(flags.l);

      for (const path of paths) {
        let node;
        try {
          node = context.fs.lookup(context.cwd, path);
        } catch (error) {
          err(context, `ls: cannot access '${path}': ${error.code === 'EACCES' ? 'Permission denied' : 'No such file or directory'}`);
          return 1;
        }

        const isDir = node.isDir();
        if (!isDir) {
          if (long) {
            out(context, describeNode(context, node, flags));
          } else {
            out(context, node.name);
          }
          continue;
        }

        try {
          context.fs.assertRead(node);
        } catch {
          err(context, `ls: cannot open directory '${path}': Permission denied`);
          return 1;
        }

        let entries = [...node.children.values()];
        if (!showAll && !showAlmost) {
          entries = entries.filter((child) => !child.name.startsWith('.'));
        } else if (showAlmost) {
          entries = entries.filter((child) => child.name !== '.' && child.name !== '..');
        }

        entries.sort((a, b) => a.name.localeCompare(b.name));
        if (flags.t) entries.sort((a, b) => b.mtime - a.mtime);
        if (flags.S) entries.sort((a, b) => b.size - a.size);
        if (flags.r) entries.reverse();

        if (paths.length > 1) out(context, `${path}:`);
        if (long) {
          const rows = entries.map((child) => describeNode(context, child, flags));
          out(context, `total ${entries.reduce((sum, child) => sum + Math.ceil(child.size / 512), 0)}`);
          out(context, rows.join('\n'));
        } else if (flags.F) {
          out(context, entries.map((child) => decorate(child.name, child)).join('  '));
        } else if (flags['1']) {
          out(context, entries.map((child) => child.name).join('\n'));
        } else {
          out(context, entries.map((child) => child.name).join('  '));
        }
      }
      return 0;
    },
  },

  cat: {
    usage: 'cat FILE...',
    summary: 'print file contents',
    run(context) {
      const files = context.args.filter((arg) => arg !== '-');
      const useStdin = files.length === 0;
      if (useStdin) {
        out(context, context.stdin.replace(/\n$/, ''));
        return 0;
      }
      let code = 0;
      for (const file of files) {
        try {
          const content = context.fs.readFile(context.cwd, file);
          context.stdout.write(content);
          if (content.length > 0 && !content.endsWith('\n')) context.stdout.write('\n');
        } catch (error) {
          err(context, `cat: ${file}: ${error.code === 'EACCES' ? 'Permission denied' : error.code === 'EISDIR' ? 'Is a directory' : 'No such file or directory'}`);
          code = 1;
        }
      }
      return code;
    },
  },

  echo: {
    usage: 'echo [options] [args...]',
    summary: 'write arguments to stdout',
    run(context) {
      const args = [...context.args];
      let noNewline = false;
      let interpretEscapes = false;
      while (args.length > 0 && args[0].startsWith('-') && args[0].length > 1 && !/^-\d/.test(args[0])) {
        const flag = args[0].slice(1);
        if (!/^[neE]+$/.test(flag)) break;
        if (flag.includes('n')) noNewline = true;
        if (flag.includes('E')) interpretEscapes = true;
        args.shift();
      }
      let text = args.join(' ');
      if (interpretEscapes) {
        text = text.replace(/\\(n|t|r|a|0[0-7]+|x[0-9a-fA-F]+)/g, (match, escape) => {
          switch (escape) {
            case 'n': return '\n';
            case 't': return '\t';
            case 'r': return '\r';
            case 'a': return '\x07';
            default:
              if (escape.startsWith('0')) return String.fromCharCode(parseInt(escape.slice(1), 8));
              return String.fromCharCode(parseInt(escape.slice(1), 16));
          }
        });
      }
      context.stdout.write(text);
      if (!noNewline) context.stdout.write('\n');
      return 0;
    },
  },

  printf: {
    usage: 'printf FORMAT [args...]',
    summary: 'format and print data',
    run(context) {
      const [format = '', ...rest] = context.args;
      let index = 0;
      const result = format.replace(/\\(n|t|r|a|0[0-7]+|x[0-9a-fA-F]+)/g, (match, escape) => {
        switch (escape) {
          case 'n': return '\n';
          case 't': return '\t';
          case 'r': return '\r';
          case 'a': return '\x07';
          default:
            if (escape.startsWith('0')) return String.fromCharCode(parseInt(escape.slice(1), 8));
            return String.fromCharCode(parseInt(escape.slice(1), 16));
        }
      }).replace(/%[sdifx%]/g, (match) => {
        if (match === '%%') return '%';
        const value = rest[index];
        index += 1;
        if (match === '%i' || match === '%d') return String(Math.trunc(Number(value) || 0));
        if (match === '%f') return String(Number(value) || 0);
        if (match === '%x') return (Number(value) || 0).toString(16);
        return value === undefined ? '' : String(value);
      });
      context.stdout.write(result);
      return 0;
    },
  },

  clear: {
    usage: 'clear',
    summary: 'clear the screen',
    run(context) {
      context.stdout.write('\x1b[2J\x1b[H');
      return 0;
    },
  },

  history: {
    usage: 'history',
    summary: 'show the command history',
    run(context) {
      const history = context.shell.history;
      const width = String(history.length).length;
      history.forEach((command, index) => {
        out(context, `${String(index + 1).padStart(width)}  ${command}`);
      });
      return 0;
    },
  },

  env: {
    usage: 'env',
    summary: 'print the environment',
    run(context) {
      for (const [key, value] of Object.entries(context.env)) {
        out(context, `${key}=${value}`);
      }
      return 0;
    },
  },

  export: {
    usage: 'export NAME=value',
    summary: 'set an environment variable',
    run(context) {
      for (const assignment of context.args) {
        const index = assignment.indexOf('=');
        if (index === -1) continue;
        context.env[assignment.slice(0, index)] = assignment.slice(index + 1);
      }
      return 0;
    },
  },

  unset: {
    usage: 'unset NAME',
    summary: 'remove an environment variable',
    run(context) {
      for (const name of context.args) delete context.env[name];
      return 0;
    },
  },

  alias: {
    usage: 'alias [name=value]',
    summary: 'define or list aliases',
    run(context) {
      if (context.args.length === 0) {
        for (const [name, value] of context.shell.aliases) {
          out(context, `alias ${name}='${value}'`);
        }
        return 0;
      }
      for (const assignment of context.args) {
        const index = assignment.indexOf('=');
        if (index === -1) continue;
        context.shell.aliases.set(assignment.slice(0, index), assignment.slice(index + 1));
      }
      return 0;
    },
  },

  unalias: {
    usage: 'unalias name',
    summary: 'remove an alias',
    run(context) {
      for (const name of context.args) context.shell.aliases.delete(name);
      return 0;
    },
  },

  which: {
    usage: 'which COMMAND',
    summary: 'locate a command',
    run(context) {
      let code = 0;
      for (const name of context.args) {
        if (context.shell.registry.has(name)) {
          out(context, `/usr/bin/${name}`);
        } else if (context.shell.aliases.has(name)) {
          out(context, `${name}: aliased to ${context.shell.aliases.get(name)}`);
        } else {
          err(context, `which: no ${name} in (/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin)`);
          code = 1;
        }
      }
      return code;
    },
  },

  type: {
    usage: 'type COMMAND',
    summary: 'describe how a command would be interpreted',
    run(context) {
      for (const name of context.args) {
        if (context.shell.aliases.has(name)) {
          out(context, `${name} is aliased to \`${context.shell.aliases.get(name)}'`);
        } else if (context.shell.registry.has(name)) {
          out(context, `${name} is ${context.shell.registry.get(name).summary ?? 'a shell command'}`);
        } else {
          out(context, `${name}: not found`);
        }
      }
      return 0;
    },
  },

  exit: {
    usage: 'exit',
    summary: 'close the terminal session',
    run(context) {
      throw new ShellExit(Number(context.args[0]) || 0);
    },
  },

  logout: {
    usage: 'logout',
    summary: 'close the terminal session',
    run(context) {
      throw new ShellExit(0);
    },
  },

  sleep: {
    usage: 'sleep SECONDS',
    summary: 'pause for a number of seconds',
    run(context) {
      const seconds = Number(context.args[0]);
      if (!Number.isFinite(seconds) || seconds < 0) {
        return requireArg(context, 'sleep: invalid time interval');
      }
      const until = Date.now() + Math.min(seconds, 5) * 1000;
      while (Date.now() < until) {
        // Simulated sleep: bounded so the session stays responsive.
      }
      return 0;
    },
  },

  date: {
    usage: 'date',
    summary: 'print the system date',
    run(context) {
      out(context, new Date().toUTCString());
      return 0;
    },
  },

  whoami: {
    usage: 'whoami',
    summary: 'print the current user',
    run(context) {
      out(context, context.user);
      return 0;
    },
  },

  id: {
    usage: 'id',
    summary: 'print user and group identity',
    run(context) {
      const fs = context.fs;
      const uid = fs.uid;
      const groups = fs.groups.join(',');
      out(context, `uid=${uid}(${context.user}) gid=${fs.gid}(${fs.groups[0] ?? 'analysts'}) groups=${uid}(${fs.groups[0] ?? 'analysts'})${groups ? `,${groups}` : ''}`);
      return 0;
    },
  },

  groups: {
    usage: 'groups',
    summary: 'print the groups of the current user',
    run(context) {
      out(context, context.fs.groups.join(' '));
      return 0;
    },
  },

  hostname: {
    usage: 'hostname',
    summary: 'print the host name',
    run(context) {
      out(context, context.hostname);
      return 0;
    },
  },

  uname: {
    usage: 'uname [options]',
    summary: 'print system information',
    run(context) {
      const { flags } = parseFlags(context.args, { boolean: ['a', 'r', 's', 'm', 'n', 'o', 'p', 'v'] });
      const kernel = '6.6.1-lab';
      const release = '6.6.1-lab';
      const machine = 'x86_64';
      const system = 'Linux';
      const nodename = context.hostname;

      if (flags.a) {
        out(context, `${system} ${nodename} ${release} #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux`);
        return 0;
      }
      if (flags.r) { out(context, release); return 0; }
      if (flags.m) { out(context, machine); return 0; }
      if (flags.n) { out(context, nodename); return 0; }
      if (flags.o) { out(context, 'GNU/Linux'); return 0; }
      if (flags.v) { out(context, '#1 SMP PREEMPT_DYNAMIC'); return 0; }
      if (flags.p) { out(context, 'x86_64'); return 0; }
      out(context, system);
      return 0;
    },
  },

  uptime: {
    usage: 'uptime',
    summary: 'show how long the system has been running',
    run(context) {
      out(context, ` 15:42:07 up 3:57,  2 users,  load average: 0.31, 0.24, 0.19`);
      return 0;
    },
  },

  who: {
    usage: 'who',
    summary: 'show who is logged in',
    run(context) {
      out(context, 'analyst   pts/0        2026-11-11 09:02 (10.20.0.33)');
      out(context, 'operator  pts/1        2026-11-11 09:11 (10.20.0.44)');
      return 0;
    },
  },

  w: {
    usage: 'w',
    summary: 'show logged in users and their activity',
    run(context) {
      out(context, ' 15:42:07 up 3:57,  2 users,  load average: 0.31, 0.24, 0.19');
      out(context, 'USER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT');
      out(context, 'analyst  pts/0    10.20.0.33       09:02   0.00s  0.03s  0.01s w');
      out(context, 'operator pts/1    10.20.0.44       09:11   1.20s  0.00s  0.00s -');
      return 0;
    },
  },

  last: {
    usage: 'last',
    summary: 'show recent login records',
    run(context) {
      out(context, 'analyst   pts/0        10.20.0.33         Tue Nov 10 21:44   still logged in');
      out(context, 'operator  pts/1        10.20.0.44         Tue Nov 10 18:02 - 19:10  (00:08)');
      out(context, 'root     pts/0        10.20.0.2          Mon Nov  9 07:44 - 08:01  (00:17)');
      out(context, '\nwtmp begins Tue Nov  3 09:00:02 2026');
      return 0;
    },
  },

  sudo: {
    usage: 'sudo COMMAND',
    summary: 'run a command as another user',
    async run(context) {
      const [name, ...rest] = context.args;
      if (!name) return requireArg(context, 'usage: sudo COMMAND');
      if (!context.shell.registry.has(name)) {
        err(context, `sudo: ${name}: command not found`);
        return 1;
      }
      const previous = { user: context.user, uid: context.fs.uid, gid: context.fs.gid, groups: context.fs.groups };
      context.user = 'root';
      context.fs.uid = 0;
      context.fs.gid = 0;
      context.fs.groups = ['root'];
      context.env.USER = 'root';
      context.env.HOME = '/root';
      try {
        const result = await runCommand(context, name, rest);
        return result;
      } finally {
        context.user = previous.user;
        context.fs.uid = previous.uid;
        context.fs.gid = previous.gid;
        context.fs.groups = previous.groups;
        context.env.USER = previous.user;
        context.env.HOME = '/home/analyst';
      }
    },
  },

  su: {
    usage: 'su [user]',
    summary: 'switch user',
    run(context) {
      const target = context.args[0];
      if (!target) {
        err(context, 'su: no target user specified');
        return 1;
      }
      out(context, `Password: `);
      out(context, 'su: Authentication failure');
      return 1;
    },
  },

  true: {
    usage: 'true',
    summary: 'do nothing, successfully',
    run() {
      return 0;
    },
  },

  false: {
    usage: 'false',
    summary: 'do nothing, unsuccessfully',
    run() {
      return 1;
    },
  },
};

async function runCommand(context, name, args) {
  const definition = context.shell.registry.get(name);
  const savedArgs = context.argv;
  context.argv = args;
  context.args = args;
  try {
    return (await definition.run(context)) ?? 0;
  } finally {
    context.argv = savedArgs;
    context.args = savedArgs;
  }
}

function decorate(name, node) {
  if (node.isLink()) return `${name}@`;
  if (node.isDir()) return `${name}/`;
  if (node.mode & 0o111) return `${name}*`;
  return name;
}

function describeNode(context, node, flags) {
  const size = flags.h ? formatHuman(node.size) : String(node.size);
  const time = formatTimestamp(node.mtime);
  const target = node.isLink() ? ` -> ${node.target}` : '';
  return `${modeString(node.mode, node.type)} ${String(node.uid).padStart(2)} ${node.group.padEnd(8)} ${size.padStart(8)} ${time} ${node.name}${target}`;
}

function formatHuman(bytes) {
  const units = ['B', 'K', 'M', 'G'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${value}` : `${value.toFixed(1)}${units[unit]}`;
}

export { formatLongTimestamp, printTable, FsError, octal };
