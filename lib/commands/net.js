/** Network commands, simulated against the lab inventory. */

import { err, out, parseFlags } from './util.js';

function parseUrl(raw) {
  const text = String(raw ?? '');
  const match = /^(?:([a-z]+):\/\/)?([^/:?#]+)?(?::(\d+))?([^?#]*)/i.exec(text);
  if (!match) return null;
  const [, scheme, host, port, path] = match;
  return {
    scheme: scheme ?? 'http',
    host: host ?? 'localhost',
    port: port ? Number(port) : (scheme === 'https' ? 443 : 80),
    path: path && path.length > 0 ? path : '/',
  };
}

function resolveLabHost(lab, host) {
  if (!lab?.hosts) return null;
  const needle = String(host).toLowerCase();
  for (const [name, definition] of Object.entries(lab.hosts)) {
    if (name.toLowerCase() === needle || definition.ip === needle) return { name, definition };
  }
  return null;
}

export const netCommands = {
  curl: {
    usage: 'curl [options] URL',
    summary: 'transfer data from a URL',
    run(context) {
      const { flags, operands } = parseFlags(context.args, {
        boolean: ['I', 'i', 's', 'S', 'L', 'k', 'v', 'f'],
        withValue: ['o', 'H', 'X', 'w'],
      });
      const target = operands[0];
      if (!target) {
        err(context, 'curl: try \'curl --help\' or \'curl --manual\' for more information');
        return 2;
      }
      const url = parseUrl(target);
      const host = resolveLabHost(context.lab, url.host);

      if (flags.v || flags.s) {
        out(context, `* Host ${url.host} resolved to ${host?.definition.ip ?? '127.0.0.1'}`);
        out(context, `* Trying ${host?.definition.ip ?? '127.0.0.1'}:${url.port}...`);
      }

      if (!host) {
        const message = `curl: (6) Could not resolve host: ${url.host}`;
        if (flags.s || flags.v) out(context, message);
        else err(context, message);
        return 6;
      }

      const webroot = context.lab?.webroot ?? {};
      const key = url.path === '/' ? '/index.html' : url.path.replace(/\/$/, '');
      const body = webroot[key] ?? webroot[url.path];

      if (flags.I || flags.i) {
        out(context, `HTTP/1.1 ${body === undefined ? '404 Not Found' : '200 OK'}`);
        out(context, `Server: ${host.definition.server ?? 'nginx/1.24.0'}`);
        out(context, `Date: Tue, 11 Nov 2026 15:42:07 GMT`);
        out(context, `Content-Type: text/html`);
        out(context, `Content-Length: ${body === undefined ? 0 : body.length}`);
        out(context, `Connection: keep-alive`);
        out(context, '');
        return body === undefined ? 0 : 0;
      }

      if (body === undefined) {
        const message = `curl: (22) The requested URL returned error: 404`;
        if (flags.s) out(context, message);
        else err(context, message);
        return 22;
      }

      if (flags.o) {
        context.fs.writeFile(context.cwd, String(flags.o), body);
        if (flags.s || flags.v) out(context, `* Saved to ${flags.o}`);
        return 0;
      }

      context.stdout.write(body);
      if (!body.endsWith('\n')) context.stdout.write('\n');
      return 0;
    },
  },

  wget: {
    usage: 'wget [options] URL',
    summary: 'retrieve a file from the network',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { boolean: ['q', 'O', 'spider'], withValue: ['O'] });
      const target = operands[0];
      if (!target) {
        err(context, 'wget: missing URL');
        return 1;
      }
      const url = parseUrl(target);
      const host = resolveLabHost(context.lab, url.host);
      if (!host) {
        err(context, `wget: unable to resolve host address '${url.host}'`);
        return 4;
      }
      const webroot = context.lab?.webroot ?? {};
      const key = url.path === '/' ? '/index.html' : url.path.replace(/\/$/, '');
      const body = webroot[key] ?? webroot[url.path];
      if (body === undefined) {
        err(context, `wget: server returned error: HTTP/1.1 404 Not Found`);
        return 8;
      }
      if (flags.spider) {
        out(context, `HTTP/1.1 200 OK`);
        out(context, `Length: ${body.length} [text/html]`);
        return 0;
      }
      const filename = flags.O ?? (key.split('/').pop() || 'index.html');
      context.fs.writeFile(context.cwd, String(filename), body);
      if (!flags.q) {
        out(context, `--2026-11-11 15:42:07--  http://${url.host}${url.path}`);
        out(context, `Resolving ${url.host}...`);
        out(context, `Connecting to ${url.host}|${host.definition.ip}|:80...`);
        out(context, `HTTP request sent, awaiting response... 200 OK`);
        out(context, `Length: ${body.length} [text/html]`);
        out(context, `Saving to: '${filename}'`);
        out(context, ``);
        out(context, `'${filename}' saved [${body.length}/${body.length}]`);
      }
      return 0;
    },
  },

  ping: {
    usage: 'ping [-c N] HOST',
    summary: 'send ICMP echo requests',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { withValue: ['c', 'i', 'W'] });
      const target = operands[0];
      if (!target) {
        err(context, 'ping: usage error: Destination address required');
        return 1;
      }
      const host = resolveLabHost(context.lab, target);
      const count = Number(flags.c ?? 4);
      const address = host?.definition.ip ?? '127.0.0.1';

      out(context, `PING ${host?.name ?? target} (${address}) 56(84) bytes of data.`);
      for (let index = 0; index < count; index += 1) {
        const sequence = index + 1;
        const time = (0.021 + Math.random() * 0.012).toFixed(3);
        out(context, `64 bytes from ${address} (${host?.name ?? target}): icmp_seq=${sequence} ttl=64 time=${time} ms`);
      }
      out(context, `--- ${host?.name ?? target} ping statistics ---`);
      out(context, `${count} packets transmitted, ${count} received, 0% packet loss, time 3003ms`);
      return 0;
    },
  },

  dig: {
    usage: 'dig [@server] DOMAIN [type]',
    summary: 'perform a DNS query',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { boolean: ['+short', 'x', 'any', 'ns'], withValue: ['t'] });
      const name = operands.find((operand) => !operand.startsWith('+'));
      if (!name) {
        err(context, 'dig: usage error: no name given');
        return 1;
      }
      const records = context.lab?.dns ?? {};
      const address = records[name];
      out(context, ''); 
      out(context, `; <<>> DiG 9.18.12-0ubuntu0 <<>> ${name}`);
      out(context, `;; global options: +cmd`);
      out(context, `;; Got answer:`);
      out(context, `;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 48121`);
      out(context, `;; flags: qr aa rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 0`);
      out(context, '');
      if (address) {
        out(context, `;; QUESTION SECTION:`);
        out(context, `;${name}.\t\t\tIN\tA`);
        out(context, '');
        out(context, `;; ANSWER SECTION:`);
        out(context, `${name}.\t300\tIN\tA\t${address}`);
      } else {
        out(context, `;; QUESTION SECTION:`);
        out(context, `;${name}.\t\t\tIN\tA`);
        out(context, '');
        out(context, `;; AUTHORITY SECTION:`);
        out(context, `rabbit.lab.\t300\tIN\tSOA\tns.rabbit.lab. hostmaster.rabbit.lab. 2026111101 3600 900 604800 300`);
      }
      out(context, '');
      out(context, `;; Query time: 12 msec`);
      out(context, `;; SERVER: 10.20.0.2#53(10.20.0.2)`);
      out(context, `;; WHEN: Tue Nov 11 15:42:07 UTC 2026`);
      out(context, `;; MSG SIZE  rcvd: 61`);
      return 0;
    },
  },

  nslookup: {
    usage: 'nslookup DOMAIN',
    summary: 'query a name server',
    run(context) {
      const name = context.args.find((argument) => !argument.startsWith('-'));
      if (!name) {
        err(context, 'nslookup: no name given');
        return 1;
      }
      const address = context.lab?.dns?.[name];
      out(context, `Server:\t\t10.20.0.2`);
      out(context, `Address:\t10.20.0.2#53`);
      out(context, '');
      if (address) {
        out(context, `Name:\t${name}`);
        out(context, `Address: ${address}`);
      } else {
        out(context, `** server can't find ${name}: NXDOMAIN`);
      }
      return 0;
    },
  },

  host: {
    usage: 'host DOMAIN',
    summary: 'perform a simple DNS lookup',
    run(context) {
      const name = context.args[0];
      if (!name) {
        err(context, 'host: no name given');
        return 1;
      }
      const address = context.lab?.dns?.[name];
      out(context, address
        ? `${name} has address ${address}`
        : `${name} has no address record`);
      return 0;
    },
  },

  netstat: {
    usage: 'netstat [options]',
    summary: 'display network connections',
    run(context) {
      const { flags } = parseFlags(context.args, { boolean: ['a', 't', 'u', 'l', 'n', 'p'] });
      const rows = [
        'Active Internet connections (only servers)',
        'Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name',
        'tcp        0      0 10.20.0.33:22           10.20.0.44:51122        ESTABLISHED 1204/sshd',
        'tcp        0      0 10.20.0.33:39114        10.20.0.44:80          ESTABLISHED 2210/curl',
        'tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      812/sshd',
        'tcp        0      0 127.0.0.53:53           0.0.0.0:*               LISTEN      671/systemd-resolve',
        'udp        0      0 0.0.0.0:68              0.0.0.0:*                           743/dhclient',
      ];
      if (flags.t || flags.a) {
        out(context, rows.join('\n'));
        return 0;
      }
      out(context, 'Active UNIX domain sockets (w/o servers)');
      out(context, 'Proto RefCnt Flags       Type       State         I-Node   Path');
      out(context, 'unix  2      [ ACC ]     STREAM     LISTENING     28144    /run/systemd/journal/stdout');
      out(context, 'unix  3      [ ]         STREAM     CONNECTED     30112    /run/user/1000/pulse/native');
      return 0;
    },
  },

  ss: {
    usage: 'ss [options]',
    summary: 'display socket statistics',
    run(context) {
      const { flags } = parseFlags(context.args, { boolean: ['a', 't', 'l', 'n', 'p'] });
      const rows = [
        'Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process',
        'tcp   ESTAB  0      0      10.20.0.33:22      10.20.0.44:51122     users:(("sshd",pid=1204,fd=3))',
        'tcp   LISTEN 0      128    0.0.0.0:22        0.0.0.0:*             users:(("sshd",pid=812,fd=3))',
      ];
      if (flags.l) {
        out(context, 'State    Recv-Q   Send-Q     Local Address:Port     Peer Address:Port  Process');
        out(context, 'LISTEN   0        128            0.0.0.0:22              0.0.0.0:*        users:(("sshd",pid=812,fd=3))');
        return 0;
      }
      out(context, rows.join('\n'));
      return 0;
    },
  },

  ip: {
    usage: 'ip [options]',
    summary: 'network configuration utility',
    run(context) {
      const subcommand = context.args[0];
      if (subcommand === 'addr' || subcommand === 'a') {
        out(context, '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000');
        out(context, '    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00');
        out(context, '    inet 127.0.0.1/8 scope host lo');
        out(context, '2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc pfifo_fast state UP group default qlen 1000');
        out(context, '    link/ether 00:11:22:33:44:66 brd ff:ff:ff:ff:ff:ff');
        out(context, '    inet 10.20.0.33/24 brd 10.20.0.255 scope global eth0');
        return 0;
      }
      if (subcommand === 'route') {
        out(context, 'default via 10.20.0.1 dev eth0 proto dhcp metric 100');
        out(context, '10.20.0.0/24 dev eth0 proto kernel scope link src 10.20.0.33 metric 100');
        return 0;
      }
      if (subcommand === 'link') {
        out(context, '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000');
        out(context, '2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc pfifo_fast state UP mode DEFAULT group default qlen 1000');
        return 0;
      }
      out(context, 'Usage: ip [ OPTIONS ] OBJECT');
      return 1;
    },
  },

  ifconfig: {
    usage: 'ifconfig [interface]',
    summary: 'configure network interfaces',
    run(context) {
      out(context, 'eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500');
      out(context, '        inet 10.20.0.33  netmask 255.255.255.0  broadcast 10.20.0.255');
      out(context, '        ether 00:11:22:33:44:66  txqueuelen 1000  (Ethernet)');
      out(context, '        RX packets 48211  bytes 11204422 (11.2 MB)');
      out(context, '        TX packets 22184  bytes 3988112 (3.9 MB)');
      out(context, 'lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536');
      out(context, '        inet 127.0.0.1  netmask 255.0.0.0');
      return 0;
    },
  },

  arp: {
    usage: 'arp [-n]',
    summary: 'manipulate the ARP cache',
    run(context) {
      const table = context.lab?.arp ?? [
        ['10.20.0.1', '00:11:22:33:44:55', 'C', 'eth0'],
        ['10.20.0.2', '00:11:22:33:44:56', 'C', 'eth0'],
        ['10.20.0.44', '00:11:22:33:44:77', 'C', 'eth0'],
      ];
      out(context, 'Address                  HWtype  HWaddress           Flags Mask            Iface');
      for (const [address, mac, flags, iface] of table) {
        out(context, `${address.padEnd(25)} <unknown> ${mac.padEnd(18)} ${flags}   ${iface}`);
      }
      return 0;
    },
  },

  traceroute: {
    usage: 'traceroute HOST',
    summary: 'trace the route to a host',
    run(context) {
      const target = context.args[0];
      if (!target) {
        err(context, 'traceroute: no host');
        return 1;
      }
      const host = resolveLabHost(context.lab, target);
      out(context, `traceroute to ${host?.name ?? target} (${host?.definition.ip ?? '127.0.0.1'}), 30 hops max, 60 byte packets`);
      out(context, ` 1  10.20.0.1  0.412 ms  0.389 ms  0.401 ms`);
      out(context, ` 2  10.20.0.44  1.204 ms  1.098 ms  1.155 ms`);
      out(context, ` 3  ${host?.definition.ip ?? '127.0.0.1'}  2.006 ms  1.988 ms  2.011 ms`);
      return 0;
    },
  },

  nc: {
    usage: 'nc [options] HOST PORT',
    summary: 'open a TCP connection',
    run(context) {
      const { flags, operands } = parseFlags(context.args, { boolean: ['v', 'l', 'n', 'w', 'z'], withValue: ['w', 'p'] });
      const target = operands[0];
      const port = operands[1];
      if (!target) {
        err(context, 'nc: no host specified');
        return 1;
      }
      if (flags.z) {
        const host = resolveLabHost(context.lab, target);
        const open = host?.definition.ports?.[`${port}/tcp`];
        out(context, open ? `Connection to ${target} ${port} port [tcp/*] succeeded!` : `nc: connect to ${target} port ${port} (tcp) failed: Connection refused`);
        return open ? 0 : 1;
      }
      const host = resolveLabHost(context.lab, target);
      const service = host?.definition.ports?.[`${port}/tcp`];
      if (flags.v) {
        out(context, `Connection to ${host?.definition.ip ?? target} ${port} port [tcp/*] succeeded!`);
      }
      out(context, service?.banner ?? `Connected to ${host?.definition.ip ?? target}.`);
      out(context, 'Type Ctrl+D to close the connection.');
      return 0;
    },
  },

  tcpdump: {
    usage: 'tcpdump [options]',
    summary: 'capture packets from a network interface',
    run(context) {
      out(context, 'tcpdump: verbose output suppressed, use -v for more verbosity');
      out(context, "reading from network interface eth0, link-layer type EN10MB (Ethernet), capture size 262144");
      out(context, '15:42:07.114021 IP 10.20.0.33.51122 > 10.20.0.44.80: Flags [S], seq 384211, win 64240, options [mss 1460,sackOK,TS val 41221 ecr 0,nop,wscale 7], length 0');
      out(context, '15:42:07.114887 IP 10.20.0.44.80 > 10.20.0.33.51122: Flags [S.], seq 1928374, ack 384212, win 65160, length 0');
      out(context, '15:42:07.114901 IP 10.20.0.33.51122 > 10.20.0.44.80: Flags [.], ack 1, win 502, length 0');
      out(context, '4 packets captured');
      out(context, '4 packets received by filter');
      out(context, '0 packets dropped by kernel');
      return 0;
    },
  },

  whois: {
    usage: 'whois DOMAIN',
    summary: 'query a whois server',
    run(context) {
      const name = context.args[0];
      if (!name) {
        err(context, 'whois: no domain given');
        return 1;
      }
      out(context, `Domain Name: ${name.toUpperCase()}`);
      out(context, 'Registry Domain ID: HC-LAB-001');
      out(context, 'Registrar: Fictional Registrar Ltd.');
      out(context, 'Updated Date: 2026-10-04T12:00:00Z');
      out(context, 'Creation Date: 2026-01-04T12:00:00Z');
      out(context, 'Registry Expiry Date: 2027-01-04T12:00:00Z');
      out(context, 'Name Server: NS1.RABBIT.LAB');
      out(context, 'DNSSEC: unsigned');
      return 0;
    },
  },
};

export { parseUrl };
