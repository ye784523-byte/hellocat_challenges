/**
 * Baseline Kali-like filesystem mounted into every simulated session.
 *
 * The tree is intentionally realistic enough that reconnaissance habits
 * (ls /usr/share/wordlists, cat /etc/passwd, find / -name '*.conf') behave the
 * way they would on a real workstation, while remaining entirely in memory.
 */

import { mountTree } from './vfs.js';

const BASE_MTIME = Date.UTC(2026, 10, 11, 8, 30, 0);

const PASSWD = `root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
analyst:x:1000:1000:Analyst,,,:/home/analyst:/bin/bash
operator:x:1001:1001:Operator,,,:/home/operator:/bin/bash
svc_backup:x:1002:1002:Service Account,,,:/var/lib/backup:/bin/bash
`;

const SHADOW = `root:*:19800:0:99999:7:::
daemon:*:19800:0:99999:7:::
bin:*:19800:0:99999:7:::
sys:*:19800:0:99999:7:::
www-data:*:19800:0:99999:7:::
analyst:$6$labsalt$4eC9pQ2rZm1kV3sJt8LbX0hA6uYdN4gK7wR1cHf5Mn2:19800:0:99999:7:::
operator:$6$labsalt$9aT3mZp5Xb7Vn2Kq8Lc4Jh1Rf6Wd0Sy3Ug9Ei5Oj7:19800:0:99999:7:::
svc_backup:$6$labsalt$2zQ8vBn4Mx6Ty1Ug3Ik9Oj5Hg7Pl3Zx0Cv2Bn8Mk4:19800:0:99999:7:::
`;

const GROUP = `root:x:0:
adm:x:4:
sudo:x:27:
analyst:x:1000:
analysts:x:1000:
operator:x:1001:
svc_backup:x:1002:
`;

const OS_RELEASE = `PRETTY_NAME="Kali GNU/Linux Rolling"
NAME="Kali GNU/Linux"
VERSION_ID="2026.1"
VERSION="Kali GNU/Linux 2026.1"
ID=kali
HOME_URL="https://www.kali.org/"
SUPPORT_URL="https://forums.kali.org/"
BUG_REPORT_URL="https://bugs.kali.org/"

LOGO=kali-logo
`;

const BASHRC = `# ~/.bashrc for analyst
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export HOME=/home/analyst
export USER=analyst
export LANG=en_US.UTF-8
export TERM=xterm-256color

# Kali tooling aliases
alias ll='ls -alF'
alias la='ls -A'
alias l='ls -CF'
alias cleanup='rm -rf /tmp/.cache/ops'
`;

const HISTORY = `ls
cd ~
cat notes/todo.txt
sudo nmap -sV -p- 10.20.0.44
gobuster dir -u http://vault.rabbit.lab -w /usr/share/wordlists/dirb/common.txt
strings artifact.bin | grep -i 'rabbit'
`;

const WORDLIST = `admin
backup
backup-2026
config
console
dashboard
db
debug
dev
docs
files
health
images
index
internal
login
logs
panel
private
robots.txt
secret
server-status
static
test
tmp
upload
uploads
user
vault
wp-admin
`;

const MOTD = `
    ▄▄▄▄▄▄   ▄▄▄▄▄▄▄▄▄▄
   ██▀▀▀██  ██▀▀▀██  ██▀▀▀██
   ██    ██ ██    ██ ██    ██
   ██    ██ ██    ██ ██    ██
   ██▄▄▄██  ██▄▄▄██  ██▄▄▄██
    ▀▀▀▀▀▀   ▀▀▀▀▀▀▀▀▀▀
        HELLO CAT LABS

   "Curiouser and curiouser!"
   Every system in this environment is fictional.
   Type 'help' for the command list.
`;

const BINARIES = [
  'bash', 'cat', 'chmod', 'chown', 'cp', 'cut', 'dash', 'date', 'dd',
  'df', 'diff', 'dirname', 'du', 'echo', 'egrep', 'env', 'file',
  'find', 'fgrep', 'fold', 'grep', 'groups', 'gunzip', 'gzip', 'head', 'hostname',
  'id', 'kill', 'less', 'ln', 'ls', 'man', 'mkdir', 'mktemp', 'more',
  'mv', 'nano', 'netstat', 'nproc', 'nslookup', 'od',
  'ping', 'printf', 'ps', 'pwd', 'readlink', 'realpath', 'rm', 'rmdir', 'sed',
  'seq', 'sh', 'sleep', 'sort', 'stat', 'strings', 'su', 'sudo', 'tail', 'tar',
  'tee', 'test', 'touch', 'tr', 'traceroute', 'tree', 'uniq', 'unzip', 'uptime',
  'useradd', 'users', 'wc', 'wget', 'who', 'whoami', 'xxd', 'yes', 'zip',
];

const TOOLING = [
  'aircrack-ng', 'amass', 'bettercap', 'burpsuite', 'crunch', 'dirb', 'enum4linux',
  'ffuf', 'gobuster', 'hashcat', 'hydra', 'john', 'masscan', 'msfconsole',
  'nikto', 'nmap', 'nuclei', 'sqlmap', 'wfuzz', 'whatweb', 'wpscan',
];

const FILE_TREE = {
  '/etc/passwd': { content: PASSWD },
  '/etc/shadow': { content: SHADOW, mode: 0o640, owner: 'root', group: 'shadow' },
  '/etc/group': { content: GROUP },
  '/etc/hostname': { content: 'kali-lab\n' },
  '/etc/hosts': {
    content: `127.0.0.1\tlocalhost
127.0.1.1\tkali-lab
10.20.0.2\tdns.rabbit.lab
10.20.0.15\tworkstation.rabbit.lab
10.20.0.33\tanalyst.rabbit.lab
10.20.0.44\tfiles.rabbit.lab
10.20.0.66\tunknown.rabbit.lab
`,
  },
  '/etc/resolv.conf': { content: 'nameserver 10.20.0.2\nsearch rabbit.lab\n' },
  '/etc/os-release': { content: OS_RELEASE },
  '/etc/motd': { content: MOTD },
  '/etc/services': {
    content: `tcpmux\t\t1/tcp
echo\t\t7/tcp
ftp\t\t21/tcp
ssh\t\t22/tcp
telnet\t\t23/tcp
smtp\t\t25/tcp
domain\t\t53/tcp\tdomain
http\t\t80/tcp\twww
https\t\t443/tcp
pop3\t\t110/tcp
imap2\t\t143/tcp
snmp\t\t161/udp
ldap\t\t389/tcp
mysql\t\t3306/tcp
rdp\t\t3389/tcp
`,
  },
  '/etc/profile': {
    content: 'export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\nexport HOME=/home/analyst\nexport USER=analyst\n',
  },
  '/etc/bash.bashrc': { content: BASHRC },
  '/etc/login.defs': {
    content: 'PASS_MAX_DAYS\t99999\nPASS_MIN_DAYS\t0\nPASS_WARN_AGE\t7\nUMASK\t\t022\n',
  },
  '/etc/issue': { content: 'Kali GNU/Linux 2026.1 \\n \\l\n' },
  '/home/analyst/.bashrc': { content: BASHRC, owner: 'analyst', group: 'analysts', uid: 1000, gid: 1000 },
  '/home/analyst/.profile': { content: '. "$HOME/.bashrc"\n', owner: 'analyst', group: 'analysts', uid: 1000, gid: 1000 },
  '/home/analyst/.bash_history': { content: HISTORY, owner: 'analyst', group: 'analysts', uid: 1000, gid: 1000 },
  '/home/analyst/notes/todo.txt': {
    content: 'Lab notes — do not lose these.\n\n- rotate credentials on the vault host\n- pull the latest wordlist to /usr/share/wordlists\n- finish the forensic timeline write-up\n',
    owner: 'analyst', group: 'analysts', uid: 1000, gid: 1000,
  },
  '/home/analyst/notes/recon.md': {
    content: '# Recon cheatsheet\n\nnmap -sV -p- 10.20.0.44\ngrep -R "password" /etc\nstrings suspicious.bin | grep -i rabbit\nxxd suspicious.bin | head\n',
    owner: 'analyst', group: 'analysts', uid: 1000, gid: 1000,
  },
  '/home/analyst/Documents': { type: 'dir', owner: 'analyst', group: 'analysts', uid: 1000, gid: 1000 },
  '/home/analyst/Downloads': { type: 'dir', owner: 'analyst', group: 'analysts', uid: 1000, gid: 1000 },
  '/home/analyst/Desktop': { type: 'dir', owner: 'analyst', group: 'analysts', uid: 1000, gid: 1000 },
  '/var/log/auth.log': {
    content: 'Nov 11 08:58:11 kali-lab sshd[1204]: Accepted publickey for analyst from 10.20.0.33 port 51244 ssh2\nNov 11 09:02:47 kali-lab sudo: analyst : TTY=pts/0 ; PWD=/home/analyst ; USER=root ; COMMAND=/usr/bin/nmap\nNov 11 09:14:03 kali-lab sshd[1288]: Failed password for invalid user admin from 198.51.100.23 port 40222 ssh2\n',
  },
  '/var/log/syslog': {
    content: 'Nov 11 08:55:01 kali-lab systemd[1]: Reached target Graphical Interface.\nNov 11 09:00:12 kali-lab NetworkManager[811]: <device> state change: 2 -> 3\nNov 11 09:00:14 kali-lab kernel: [19811.442] IPv6: ADDRCONF(NETDEV_CHANGE): eth0: link becomes ready\n',
  },
  '/var/log/dmesg': {
    content: '[    0.000000] Linux version 6.6.1-lab (gcc 13.2.0) #1 SMP PREEMPT_DYNAMIC\n[    0.000000] Command line: BOOT_IMAGE=/vmlinuz-6.6.1-lab root=/dev/sda1 ro quiet\n[    1.204551] e1000: eth0 NIC Link is Up 1000 Mbps Full Duplex\n',
  },
  '/var/log/lastlog': {
    content: 'root : 0 : Thu Nov  5 08:12:00 +0000\nanalyst : 1000 : Tue Nov 10 21:44:12 +0000\n',
  },
  '/usr/share/wordlists/dirb/common.txt': { content: WORDLIST },
  '/usr/share/nmap/nmap-services': {
    content: '# port\tprotocol\tservice\n21/tcp\tftp\n22/tcp\tssh\n80/tcp\thttp\n443/tcp\thttps\n3306/tcp\tmysql\n8080/tcp\thttp-proxy\n',
  },
  '/proc/cpuinfo': {
    content: 'processor\t: 0\nvendor_id\t: GenuineIntel\nmodel name\t: Intel(R) Core(TM) i7-10700 CPU @ 2.90GHz\ncpu family\t: 6\nmodel\t\t: 106\ncpu MHz\t\t: 2900.000\ncache size\t: 16384 KB\n',
  },
  '/proc/meminfo': {
    content: 'MemTotal:       16307456 kB\nMemFree:         4218832 kB\nBuffers:          218104 kB\nSwapTotal:       2097148 kB\nSwapFree:        2097148 kB\n',
  },
  '/proc/version': {
    content: 'Linux version 6.6.1-lab (gcc 13.2.0) #1 SMP PREEMPT_DYNAMIC Debian 6.6.1-lab\n',
  },
  '/proc/uptime': { content: '14283.42 12044.11\n' },
  '/proc/net/arp': {
    content: 'IP address       HW type     Flags       HW address            Mask     Device\n10.20.0.1        0x1         0x2         00:11:22:33:44:55     *        eth0\n10.20.0.44       0x1         0x2         00:11:22:33:44:77     *        eth0\n',
  },
  '/proc/self/cmdline': { content: '/bin/bash\x00' },
  '/tmp': { type: 'dir', mode: 0o1777 },
  '/var/tmp': { type: 'dir' },
  '/var/lib/backup': { type: 'dir', owner: 'svc_backup', group: 'svc_backup', uid: 1002, gid: 1002 },
  '/srv': { type: 'dir' },
  '/opt/challenges': { type: 'dir' },
  '/opt/recon': { type: 'dir' },
  '/root': { type: 'dir', mode: 0o700 },
  '/media': { type: 'dir' },
  '/mnt': { type: 'dir' },
  '/boot': { type: 'dir' },
  '/usr/sbin': { type: 'dir' },
  '/usr/local/bin': { type: 'dir' },
  '/usr/share': { type: 'dir' },
  '/home/operator': { type: 'dir', owner: 'operator', group: 'operator', uid: 1001, gid: 1001 },
};

export function buildBaseFs(fs, { mtime = BASE_MTIME } = {}) {
  // The image is provisioned as root; ownership is then fixed per entry.
  const identity = { user: fs.user, uid: fs.uid, gid: fs.gid, groups: fs.groups };
  fs.user = 'root';
  fs.uid = 0;
  fs.gid = 0;
  fs.groups = ['root'];

  try {
    mountTree(fs, FILE_TREE, { mtime });

    const binaries = {};
    for (const binary of [...BINARIES, ...TOOLING]) {
      binaries[`/usr/bin/${binary}`] = { content: '', mode: 0o755, mtime };
    }
    mountTree(fs, binaries, { mtime });

    // Usr-merge symlinks, exactly like a modern Debian derivative.
    for (const [link, target] of [['/bin', '/usr/bin'], ['/sbin', '/usr/sbin'], ['/lib', '/usr/lib']]) {
      fs.link('/', target, link, { symbolic: true });
    }
  } finally {
    fs.user = identity.user;
    fs.uid = identity.uid;
    fs.gid = identity.gid;
    fs.groups = identity.groups;
  }

  return fs;
}
