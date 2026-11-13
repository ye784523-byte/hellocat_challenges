/** System inspection and service management commands. */

import { err, out, parseFlags, printTable } from './util.js';

export const systemCommands = {
  ps: {
    usage: 'ps [options]',
    summary: 'report process status',
    run(context) {
      const { flags } = parseFlags(context.args, {
        boolean: ['a', 'e', 'f', 'x', 'u'],
        withValue: ['u', 'o'],
      });
      const rows = [
        ['PID', 'TTY', 'TIME', 'CMD'],
        ['1204', '?', '0:00', '/usr/sbin/sshd -D'],
        ['1288', '?', '0:00', 'sshd: analyst@pts/0'],
        ['1492', 'pts/0', '0:00', 'bash'],
        ['1501', 'pts/0', '0:00', 'ps'],
        ['812', '?', '0:00', 'sshd: /usr/sbin/sshd -D'],
        ['671', '?', '0:00', 'systemd-resolved'],
      ];
      if (flags.ef) {
        out(context, 'UID        PID  PPID  C STIME TTY          TIME CMD');
        out(context, 'root      1204     1  0 08:58 ?        00:00:00 sshd: /usr/sbin/sshd -D');
        out(context, 'analyst   1492  1288  0 09:02 pts/0    00:00:00 bash');
        return 0;
      }
      out(context, printTable(rows));
      return 0;
    },
  },

  top: {
    usage: 'top',
    summary: 'display running processes',
    run(context) {
      out(context, 'top - 15:42:11 up 3:57,  2 users,  load average: 0.31, 0.24, 0.19');
      out(context, 'Tasks: 214 total,   1 running, 213 sleeping,   0 stopped,   0 zombie');
      out(context, '%Cpu(s):  3.1 us,  1.4 sy,  0.0 ni, 95.2 id,  0.0 wa,  0.0 hi,  0.3 si');
      out(context, 'MiB Mem :  16056.3 total,   4062.4 free,   2044.9 used,   9949.0 buff/cache');
      out(context, '');
      out(context, '    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND');
      out(context, '   1492 analyst   20   0  10832  5312  3896 S   0.7   0.3   0:00.42 bash');
      out(context, '   2210 analyst   20   0  10456  3420  2480 S   0.3   0.2   0:00.11 curl');
      return 0;
    },
  },

  kill: {
    usage: 'kill [-SIGNAL] PID...',
    summary: 'terminate a process',
    run(context) {
      const pids = context.args.filter((argument) => !argument.startsWith('-'));
      if (pids.length === 0) {
        err(context, 'usage: kill [options] <pid> [...]');
        return 1;
      }
      for (const pid of pids) {
        out(context, `kill: (${pid}) - Terminated`);
      }
      return 0;
    },
  },

  dmesg: {
    usage: 'dmesg',
    summary: 'print the kernel ring buffer',
    run(context) {
      let content = '';
      try {
        content = context.fs.readFile(context.cwd, '/proc/dmesg');
      } catch {
        content = '';
      }
      try {
        content = context.fs.readFile(context.cwd, '/var/log/dmesg');
      } catch {
        /* keep the previous value */
      }
      out(context, content.trim() || '[    0.000000] Linux version 6.6.1-lab');
      return 0;
    },
  },

  lsof: {
    usage: 'lsof [-i] [-p PID]',
    summary: 'list open files',
    run(context) {
      const rows = [
        'COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME',
        'sshd      1204 root    3u  IPv4  11854      0t0  TCP *:ssh (LISTEN)',
        'sshd      1288 root    4u  IPv4  11860      0t0  TCP *:ssh->10.20.0.33:51122 (ESTABLISHED)',
        'curl      2210 analy   3u  IPv4  11899      0t0  TCP 10.20.0.33:39114->10.20.0.44:http (ESTABLISHED)',
      ];
      out(context, printTable(rows));
      return 0;
    },
  },

  mount: {
    usage: 'mount',
    summary: 'list mounted file systems',
    run(context) {
      out(context, '/dev/sda1 on / type ext4 (rw,relatime)');
      out(context, '/dev/sda2 on /boot type ext4 (rw,relatime)');
      out(context, 'tmpfs on /run type tmpfs (rw,nosuid,nodev,size=16054k)');
      out(context, 'tmpfs on /tmp type tmpfs (rw,nosuid,nodev,size=16054k,mode=1777)');
      return 0;
    },
  },

  free: {
    usage: 'free [-h]',
    summary: 'show memory usage',
    run(context) {
      out(context, printTable([
        ['Mem:', 'total', 'used', 'free', 'shared', 'buff/cache', 'available'],
        [' ', '15Gi', '2.0Gi', '4.0Gi', '120Mi', '9.7Gi', '12Gi'],
        ['Swap:', '2.0Gi', '0.0B', '2.0Gi', '', '', ''],
      ]));
      return 0;
    },
  },

  lscpu: {
    usage: 'lscpu',
    summary: 'display CPU information',
    run(context) {
      out(context, 'Architecture:                       x86_64');
      out(context, 'CPU op-mode(s):                     32-bit, 64-bit');
      out(context, 'CPU(s):                             8');
      out(context, 'Thread(s) per core:                 2');
      out(context, 'Model name:                         Intel(R) Core(TM) i7-10700 CPU @ 2.90GHz');
      out(context, 'Hypervisor vendor:                  KVM');
      out(context, 'Virtualization type:                 full');
      return 0;
    },
  },

  lsusb: {
    usage: 'lsusb',
    summary: 'list USB devices',
    run(context) {
      out(context, 'Bus 001 Device 002: ID 1d6b:0003 Linux Foundation 3.0 root hub');
      out(context, 'Bus 002 Device 001: ID 1d6b:0003 Linux Foundation 3.0 root hub');
      return 0;
    },
  },

  systemctl: {
    usage: 'systemctl [status|start|stop] UNIT',
    summary: 'control systemd services',
    run(context) {
      const [action, unit] = context.args;
      if (!action) {
        out(context, 'Usage: systemctl [OPTIONS...] COMMAND [UNIT...]');
        return 1;
      }
      const known = ['ssh', 'cron', 'nginx', 'apache2', 'docker', 'networking', 'auditd'];
      if (unit && !known.includes(unit)) {
        out(context, `Unit ${unit}.service could not be found.`);
        return 5;
      }
      if (action === 'status') {
        out(context, `● ${unit ?? 'ssh'}.service - OpenBSD Secure Shell server`);
        out(context, '     Loaded: loaded (/lib/systemd/system/ssh.service; enabled)');
        out(context, '     Active: active (running) since Tue 2026-11-11 08:55:01 UTC; 6h 47m ago');
        return 0;
      }
      if (action === 'start' || action === 'stop' || action === 'restart') {
        out(context, action === 'stop'
          ? `Stopped ${unit ?? 'ssh'}.service.`
          : `Started ${unit ?? 'ssh'}.service.`);
        return 0;
      }
      out(context, `Unknown operation ${action}.`);
      return 1;
    },
  },

  service: {
    usage: 'service SERVICE STATUS',
    summary: 'run an init script',
    run(context) {
      const [name, action] = context.args;
      if (!name) {
        err(context, 'usage: service <name> <status|start|stop|restart>');
        return 1;
      }
      if (!action) {
        err(context, `service: no action specified for ${name}`);
        return 1;
      }
      out(context, action === 'status'
        ? `● ${name}.service - ${name} daemon\n     Active: active (running)`
        : `${action === 'stop' ? 'Stopped' : 'Started'} ${name}.service.`);
      return 0;
    },
  },

  crontab: {
    usage: 'crontab [-l|-e]',
    summary: 'install or inspect the cron table',
    run(context) {
      const { flags } = parseFlags(context.args, { boolean: ['l', 'e'] });
      if (flags.e) {
        out(context, 'no crontab for analyst');
        return 0;
      }
      out(context, '# m h dom mon dow command');
      out(context, '*/5 * * * * /usr/local/bin/rotate-logs.sh');
      out(context, '0 3 * * 0 /usr/local/bin/cleanup.sh');
      return 0;
    },
  },

  journalctl: {
    usage: 'journalctl [-u UNIT] [-n N]',
    summary: 'query the system journal',
    run(context) {
      const { flags } = parseFlags(context.args, { boolean: ['u', 'n', 'f', 'x'], withValue: ['u', 'n'] });
      const unit = flags.u ?? 'ssh.service';
      out(context, `-- Logs begin at Tue 2026-11-11 08:55:01 UTC --`);
      out(context, `Nov 11 08:58:11 kali-lab sshd[1204]: Accepted publickey for analyst from 10.20.0.33 port 51244 ssh2`);
      out(context, `Nov 11 09:02:47 kali-lab sudo: analyst : TTY=pts/0 ; PWD=/home/analyst ; USER=root ; COMMAND=/usr/bin/nmap`);
      out(context, `Nov 11 09:14:03 kali-lab ${unit}: session opened for user analyst`);
      out(context, `-- No entries --`);
      return 0;
    },
  },

  passwd: {
    usage: 'passwd [USER]',
    summary: 'change a user password',
    run(context) {
      const user = context.args[0] ?? context.user;
      if (user !== context.user && !context.fs.isRoot) {
        err(context, `passwd: You may not change the password for ${user}.`);
        return 1;
      }
      out(context, `New password: `);
      out(context, `Retype new password: `);
      out(context, 'passwd: password updated successfully');
      return 0;
    },
  },

  useradd: {
    usage: 'useradd [options] USER',
    summary: 'create a new user account',
    run(context) {
      const user = context.args.find((argument) => !argument.startsWith('-'));
      if (!user) {
        err(context, 'usage: useradd [options] LOGIN');
        return 1;
      }
      if (!context.fs.isRoot) {
        err(context, 'useradd: permission denied');
        return 1;
      }
      out(context, `useradd: user '${user}' already exists`);
      return 9;
    },
  },
};

export const processCommands = systemCommands;
