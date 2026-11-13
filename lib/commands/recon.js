/**
 * Reconnaissance, encoding and cryptography commands.
 *
 * The scanners operate against the *lab environment* attached to the session
 * (hosts, web roots, DNS records) rather than against a real network, so the
 * output is always consistent with the challenge being solved.
 */

import crypto from 'node:crypto';
import { err, formatSize, hexDump, out, parseFlags, splitLines } from './util.js';

const COMMON_PORTS = [21, 22, 23, 25, 53, 80, 110, 139, 143, 389, 443, 445, 993, 995, 1433, 3306, 3389, 8080];

function readTarget(context, path) {
  if (!path) {
    err(context, 'missing operand');
    return null;
  }
  try {
    return context.fs.readFile(context.cwd, path);
  } catch (error) {
    err(context, `${path}: ${error.code === 'EACCES' ? 'Permission denied' : 'No such file or directory'}`);
    return null;
  }
}

function resolveHost(lab, target) {
  if (!lab?.hosts) return null;
  const key = String(target).replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
  for (const [name, definition] of Object.entries(lab.hosts)) {
    if (name.toLowerCase() === key || definition.ip === key) return { name, definition };
  }
  return null;
}

function serviceLabel(port, definition) {
  const service = definition?.service ?? 'unknown';
  const version = definition?.version ? ` ${definition.version}` : '';
  return `${service}${version}`;
}

export const reconCommands = {
  nmap: {
    usage: 'nmap [options] TARGET',
    summary: 'port and service scanner',
    run(context) {
      const { flags, operands } = parseFlags(context.args, {
        boolean: ['sV', 'sC', 'sn', 'Pn', 'A', 'T4', 'T5', 'v'],
        withValue: ['p', 'oN'],
      });
      const target = operands[0];
      if (!target) {
        err(context, 'Nmap usage error: need a target. Use -h for help');
        return 1;
      }
      const host = resolveHost(context.lab, target);
      if (!host) {
        err(context, `nmap: host "${target}" not found in the lab inventory`);
        return 1;
      }

      const { name, definition } = host;
      out(context, `Starting Nmap 7.95 ( https://nmap.org ) at 2026-11-11 15:42`);
      out(context, `Nmap scan report for ${name} (${definition.ip})`);
      out(context, `Host is up (0.0042s latency).`);

      const ports = definition.ports ?? {};
      const requested = flags.p ? parsePortSpec(String(flags.p)) : Object.keys(ports);
      const open = requested.filter((port) => ports[port]);

      if (flags.sn) {
        out(context, `Nmap scan report for ${name} (${definition.ip})`);
        out(context, `Host is up.`);
        out(context, `Not shown: 254 filtered hosts`);
        return 0;
      }

      if (open.length === 0) {
        out(context, `No ports are open.`);
        out(context, `Host is up.`);
        return 0;
      }

      out(context, `Not shown: ${977 - open.length} filtered ports`);
      for (const port of open) {
        const service = ports[port];
        const state = service.state ?? 'open';
        const reason = service.reason ?? 'syn-ack';
        const serviceName = service.service ?? 'unknown';
        out(context, `PORT     STATE SERVICE VERSION`);
        out(context, `${port.padEnd(8)} ${state.padEnd(6)} ${serviceName.padEnd(8)} ${service.version ?? ''}${flags.sV ? '' : ` (${reason})`}`);
      }
      if (flags.sV) {
        out(context, '');
        out(context, `Service detection performed.`);
      }
      out(context, '');
      out(context, `Nmap done: 1 IP address (1 host up) scanned in 0.42 seconds`);
      return 0;
    },
  },

  nikto: {
    usage: 'nikto -h HOST',
    summary: 'web vulnerability scanner',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { withValue: ['h', 'p', 'C'] });
      const target = flags.h ?? operands[0];
      if (!target) {
        err(context, 'nikto: no target specified');
        return 1;
      }
      const host = resolveHost(context.lab, target);
      if (!host) {
        err(context, `nikto: unable to resolve "${target}"`);
        return 1;
      }
      out(context, `- Nikto v2.5.0`);
      out(context, `+ Target IP: ${host.definition.ip}`);
      out(context, `+ Target Hostname: ${host.name}`);
      out(context, `+ Server: ${host.definition.server ?? 'nginx 1.24.0'}`);
      out(context, `+ retrieved x-powered-by header: ${host.definition.poweredBy ?? 'PHP/8.2.7'}`);
      out(context, '');
      const findings = context.lab?.nikto ?? [
        '"/admin/" contains a link to an uninteresting directory',
        '"/backup/" might be interesting',
        '"/server-status" is accessible, Apache status page',
        'Server leaks inodes via /etc/passwd',
      ];
      for (const finding of findings) out(context, `+ ${finding}`);
      out(context, `+ Test "http-methods" for HTTP methods`);
      out(context, `+ 0 items(s) found.`);
      return 0;
    },
  },

  gobuster: {
    usage: 'gobuster dir -u URL -w WORDLIST',
    summary: 'brute-force directory discovery',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { withValue: ['u', 'w', 'x', 't'] });
      const url = flags.u ?? operands[0];
      const wordlist = flags.w ?? '/usr/share/wordlists/dirb/common.txt';
      if (!url) {
        err(context, 'gobuster: no URL provided (use -u)');
        return 1;
      }
      const host = resolveHost(context.lab, url);
      const webroot = context.lab?.webroot ?? {};
      const base = url.replace(/\/$/, '');

      out(context, `===============================================================\x1b[1;31mGobuster\x1b[0m v3.6`);
      out(context, `===============================================================\x1b[1;31mGobuster\x1b[0m v3.6`);
      out(context, `by SJ (`);
      out(context, `===============================================================\x1b[1;31mGobuster\x1b[0m v3.6`);
      out(context, `===============================================================\x1b[1;31mGobuster\x1b[0m v3.6`);
      out(context, '');
      out(context, `===============================================================\x1b[1;31mGobuster\x1b[0m v3.6`);
      out(context, `===============================================================\x1b[1;31mGobuster\x1b[0m v3.6`);
      out(context, `===============================================================\x1b[1;31mGobuster\x1b[0m v3.6`);
      out(context, '');
      out(context, `[+] Starting Gobuster directory enumeration on ${base}`);

      let words;
      try {
        words = splitLines(context.fs.readFile(context.cwd, wordlist)).filter(Boolean);
      } catch {
        err(context, `gobuster: unable to open wordlist: ${wordlist}`);
        return 1;
      }

      const hits = [];
      for (const word of words) {
        const key = `/${word}`.replace(/\/$/, '');
        if (webroot[key] !== undefined) {
          hits.push([key, '200', '0B', '0B']);
        }
      }
      for (const [path, status, size] of hits) {
        out(context, `${path.padEnd(30)} (Status: ${status}) [Size: ${size}]`);
      }
      out(context, '');
      out(context, `===============================================================\x1b[1;31mGobuster\x1b[0m v3.6`);
      out(context, '');
      return 0;
    },
  },

  dirb: {
    usage: 'dirb URL WORDLIST',
    summary: 'web directory scanner',
    run(context) {
      context.args = ['-u', ...context.args];
      return reconCommands.gobuster.run(context);
    },
  },

  ffuf: {
    usage: 'ffuf -u URL -w WORDLIST',
    summary: 'fuzz web parameters and directories',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { withValue: ['u', 'w', 'e', 'fc'] });
      const url = flags.u ?? operands[0];
      const wordlist = flags.w ?? '/usr/share/wordlists/dirb/common.txt';
      if (!url) {
        err(context, 'ffuf: no URL provided (use -u)');
        return 1;
      }
      const webroot = context.lab?.webroot ?? {};
      let words;
      try {
        words = splitLines(context.fs.readFile(context.cwd, wordlist)).filter(Boolean);
      } catch {
        err(context, `ffuf: unable to open wordlist: ${wordlist}`);
        return 1;
      }
      out(context, '/\'___\'\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'_\'/\'___\'');
      for (const word of words) {
        const key = `/${word}`.replace(/\/$/, '');
        if (webroot[key] !== undefined) {
          out(context, `${key.padEnd(24)} [Status: 200, Size: ${webroot[key].length}]`);
        }
      }
      out(context, '');
      out(context, `:: Method : GET`);
      out(context, `:: Progress: [${words.length}/${words.length}]`);
      return 0;
    },
  },

  whatweb: {
    usage: 'whatweb URL',
    summary: 'identify the technology behind a web site',
    run(context) {
      const target = context.args[0];
      if (!target) {
        err(context, 'whatweb: no target');
        return 1;
      }
      const host = resolveHost(context.lab, target);
      out(context, `http://${target} [200] [${host?.definition.server ?? 'nginx 1.24.0'}] [PHP/8.2.7] [MySQL 8.0] [Debian] [Compression: gzip] [Cookie: PHPSESSID]`);
      return 0;
    },
  },

  strings: {
    usage: 'strings [-n N] FILE...',
    summary: 'print printable strings in a file',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { withValue: ['n'] });
      const minimum = Number(flags.n ?? 4);
      const files = operands.length > 0 ? operands : ['-'];
      for (const file of files) {
        const content = file === '-' ? context.stdin : readTarget(context, file);
        if (content === null) return 1;
        const found = (content.match(/[\x20-\x7e]{4,}/g) ?? []).filter((piece) => piece.length >= minimum);
        out(context, found.join('\n'));
      }
      return 0;
    },
  },

  xxd: {
    usage: 'xxd [-r] [FILE]',
    summary: 'hex dump or reverse a hex dump',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { boolean: ['r', 'p'], withValue: ['l', 's'] });
      const file = operands[0];
      const piped = file === undefined || file === '-';
      if (flags.r) {
        const source = piped ? context.stdin : readTarget(context, file);
        if (source === null) return 1;
        const cleaned = source.replace(/^[0-9a-fA-F]+:\s+/gm, '').replace(/[|].*$/gm, '').replace(/\s+/g, '');
        const hex = cleaned.match(/[0-9a-fA-F]{2}/g)?.join('') ?? '';
        const bytes = Buffer.from(hex, 'hex');
        context.stdout.write(bytes.toString('utf8'));
        return 0;
      }
      const content = piped ? context.stdin : readTarget(context, file);
      if (content === null) return 1;
      const buffer = Buffer.from(content, 'utf8');
      if (flags.p) {
        out(context, buffer.toString('hex'));
        return 0;
      }
      out(context, hexDump(buffer));
      return 0;
    },
  },

  hexdump: {
    usage: 'hexdump [-C] [FILE]',
    summary: 'display file content in hexadecimal',
    run(context) {
      const content = context.args[0] === '-' ? context.stdin : readTarget(context, context.args[0]);
      if (content === null) return 1;
      out(context, hexDump(Buffer.from(content, 'utf8')));
      return 0;
    },
  },

  od: {
    usage: 'od [-c] [-A x] [FILE]',
    summary: 'dump file content in octal and other formats',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { boolean: ['c', 'b', 'x', 'A'], withValue: ['A', 't', 'N'] });
      const content = operands[0] === '-' ? context.stdin : readTarget(context, operands[0]);
      if (content === null) return 1;
      const buffer = Buffer.from(content, 'utf8');
      if (flags.c) {
        const rows = [];
        for (let index = 0; index < buffer.length; index += 16) {
          const slice = buffer.subarray(index, index + 16);
          rows.push(slice.toString('latin1').replace(/[^\x20-\x7e]/g, '.').split('').map((char) => ` ${char}`).join(''));
        }
        out(context, rows.join('\n'));
        return 0;
      }
      const octal = [...buffer].map((byte) => byte.toString(8).padStart(3, '0')).join(' ');
      out(context, `0000000  ${octal}`);
      return 0;
    },
  },

  base64: {
    usage: 'base64 [-d] [FILE]',
    summary: 'base64 encode or decode',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { boolean: ['d', 'D', 'i'] });
      const content = operands[0] === '-' || operands.length === 0
        ? context.stdin
        : readTarget(context, operands[0]);
      if (content === null) return 1;

      if (flags.d || flags.D) {
        try {
          const decoded = Buffer.from(content.replace(/\s+/g, ''), 'base64').toString('utf8');
          context.stdout.write(decoded);
          if (decoded.length > 0 && !decoded.endsWith('\n')) context.stdout.write('\n');
        } catch {
          err(context, 'base64: invalid input');
          return 1;
        }
        return 0;
      }

      const encoded = Buffer.from(content, 'utf8').toString('base64');
      const wrapped = encoded.match(/.{1,76}/g) ?? [];
      out(context, wrapped.join('\n'));
      return 0;
    },
  },

  md5sum: {
    usage: 'md5sum FILE...',
    summary: 'compute an MD5 checksum',
    run(context) {
      return hashCommand(context, 'md5');
    },
  },

  sha1sum: {
    usage: 'sha1sum FILE...',
    summary: 'compute a SHA-1 checksum',
    run(context) {
      return hashCommand(context, 'sha1');
    },
  },

  sha256sum: {
    usage: 'sha256sum FILE...',
    summary: 'compute a SHA-256 checksum',
    run(context) {
      return hashCommand(context, 'sha256');
    },
  },

  openssl: {
    usage: 'openssl COMMAND',
    summary: 'cryptography and TLS helpers',
    run(context) {
      const [subcommand, ...rest] = context.args;
      if (!subcommand) {
        out(context, 'OpenSSL 3.0.13 (30 Jan 2024)');
        out(context, 'Usage: openssl <command> [options]');
        return 0;
      }
      switch (subcommand) {
        case 'version':
          out(context, 'OpenSSL 3.0.13 30 Jan 2024 (Library: OpenSSL 3.0.13)');
          return 0;
        case 'enc': {
          const decode = rest.includes('-d');
          const algorithm = rest.find((argument) => argument.startsWith('-'))?.slice(1) ?? 'base64';
          if (algorithm !== 'base64') {
            err(context, `openssl enc: unsupported algorithm in the lab environment: ${algorithm}`);
            return 1;
          }
          const data = context.stdin;
          const result = decode
            ? Buffer.from(data.replace(/\s+/g, ''), 'base64').toString('utf8')
            : Buffer.from(data, 'utf8').toString('base64');
          context.stdout.write(result);
          if (!result.endsWith('\n')) context.stdout.write('\n');
          return 0;
        }
        case 'dgst': {
          const algorithm = (rest.find((argument) => argument.startsWith('-')) ?? '-md5').slice(1);
          const digest = crypto.createHash(algorithm).update(context.stdin).digest('hex');
          out(context, `${digest.toUpperCase()}  (stdin)`);
          return 0;
        }
        case 'rand': {
          const length = Number(rest[0] ?? 16);
          out(context, crypto.randomBytes(length).toString('hex'));
          return 0;
        }
        case 'passwd': {
          const password = context.stdin.trim();
          out(context, `06$${crypto.createHash('sha256').update(password).digest('base64')}`);
          return 0;
        }
        default:
          err(context, `openssl: unknown command '${subcommand}'`);
          return 1;
      }
    },
  },

  hashcat: {
    usage: 'hashcat [options] HASH [WORDLIST]',
    summary: 'advanced password recovery (simulated)',
    run(context) {
      const { flags, operands } = parseFlags(context.args, {
        boolean: ['a', 'O', '--force'],
        withValue: ['m', 'i', 'w'],
      });
      const hash = operands[0];
      if (!hash) {
        err(context, 'hashcat: no hash specified');
        return 1;
      }
      const mode = flags.m ?? '0';
      out(context, `hashcat (v6.2.6) starting in hash mode 0 (MD5)`);
      out(context, `Hash mode: ${mode} (${mode === '0' ? 'MD5' : 'raw'})`);
      out(context, `Speed.GPU.#1: 12345.6 MH/s`);
      out(context, `Session: simulated lab environment — no cracking performed`);
      out(context, `Status: Stopped`);
      return 0;
    },
  },

  john: {
    usage: 'john [options] HASHFILE',
    summary: 'password cracker (simulated)',
    run(context) {
      out(context, 'Warning: no password hashes loaded (lab simulation)');
      out(context, `Using default bcrypt cost factor (12)`);
      return 0;
    },
  },

  binwalk: {
    usage: 'binwalk FILE',
    summary: 'scan a binary for embedded data',
    run(context) {
      const content = readTarget(context, context.args[0]);
      if (content === null) return 1;
      out(context, `DECIMAL   HEXADECIMAL     DESCRIPTION`);
      out(context, `--------------------------------------------------------------------------------`);
      out(context, `0x00000000 0x7F454C46     ELF 64-bit LSB executable, x86-64`);
      out(context, `0x00000038 0x00000001     Image is executable`);
      const matches = content.match(/HC\{[^}]+\}/g);
      if (matches) {
        out(context, `0x${content.indexOf(matches[0]).toString(16).padStart(8, '0')} 0x${'00'.repeat(4)}     Embedded string: ${matches[0]}`);
      }
      return 0;
    },
  },

  exiftool: {
    usage: 'exiftool FILE',
    summary: 'read metadata from a file',
    run(context) {
      const content = readTarget(context, context.args[0]);
      if (content === null) return 1;
      out(context, '========== lab-image.jpg ==========');
      out(context, 'File Type                       : JPEG');
      out(context, 'Image Size                      : 640x480');
      out(context, 'Comment                         : captured during authorised lab exercise');
      return 0;
    },
  },

  enum4linux: {
    usage: 'enum4linux TARGET',
    summary: 'SMB enumeration (simulated)',
    run(context) {
      const target = context.args[0];
      if (!target) {
        err(context, 'enum4linux: no target');
        return 1;
      }
      out(context, `SMALL: Connecting to ${target}`);
      out(context, `SMALL: enum4linux v0.1.0 - Simulated lab enumeration`);
      out(context, `=== Sharing Enumeration ===`);
      out(context, `\\${target}\\IPC$    IPC$   Default    no access available`);
      out(context, `\\${target}\\ADMIN$  ADMIN$  Default    no access available`);
      out(context, `=== Privilege Enumeration ===`);
      out(context, `Current User: analyst`);
      return 0;
    },
  },

  dupe: {
    usage: 'dupe [options]',
    summary: 'duplicate account scanner (simulated)',
    run(context) {
      out(context, '[*] Checking for duplicate accounts in the local lab...');
      out(context, '[+] No duplicate accounts found.');
      return 0;
    },
  },

  size: {
    usage: 'size [FILE]',
    summary: 'print the size of a file',
    run(context) {
      const content = readTarget(context, context.args[0]);
      if (content === null) return 1;
      out(context, `${formatSize(Buffer.byteLength(content))} \t${context.args[0]}`);
      return 0;
    },
  },
};

function hashCommand(context, algorithm) {
  const files = context.args;
  if (files.length === 0) {
    err(context, `${algorithm}sum: missing operand`);
    return 1;
  }
  for (const file of files) {
    const content = readTarget(context, file);
    if (content === null) return 1;
    const digest = crypto.createHash(algorithm).update(content, 'utf8').digest('hex');
    out(context, `${digest}  ${file}`);
  }
  return 0;
}

function parsePortSpec(spec) {
  const ports = [];
  for (const part of spec.split(',')) {
    if (part.includes('-')) {
      const [from, to] = part.split('-').map(Number);
      for (let port = from; port <= to; port += 1) ports.push(`${port}/tcp`);
    } else {
      ports.push(`${part}/tcp`);
    }
  }
  return ports.length > 0 ? ports : COMMON_PORTS.map((port) => `${port}/tcp`);
}

export { parsePortSpec, resolveHost, serviceLabel };
