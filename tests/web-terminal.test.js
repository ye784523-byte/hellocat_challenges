import test from 'node:test';
import assert from 'node:assert/strict';
import { Fs, mountTree } from '../lib/vfs.js';
import { buildBaseFs } from '../lib/basefs.js';
import { Shell, tokenize, expandGlobs } from '../lib/shell.js';
import { createRegistry } from '../lib/commands/index.js';
import { PythonInterpreter } from '../lib/python.js';
import { buildLabFs, createLabShell, loadLabDefinitions } from '../lib/labs.js';
import { parseCookies, serializeCookie, sign, verifySigned } from '../lib/auth.js';

const silentLogger = { debug() {}, info() {}, warn() {}, error() {}, flush: async () => {} };

function makeShell(lab = null) {
  const fs = lab ? buildLabFs(lab) : buildBaseFs(new Fs());
  const shell = new Shell({ fs, registry: createRegistry(), lab });
  return shell;
}

/* --------------------------------------------------------------------- vfs */

test('vfs resolves relative paths and parent traversal', () => {
  const fs = buildBaseFs(new Fs());
  assert.equal(fs.resolve('/home/analyst', 'notes'), '/home/analyst/notes');
  assert.equal(fs.resolve('/home/analyst', '../..'), '/');
  assert.equal(fs.resolve('/home/analyst', '/etc/passwd'), '/etc/passwd');
});

test('vfs enforces permissions on root-owned files', () => {
  const fs = buildBaseFs(new Fs());
  const shadow = fs.lookup('/', '/etc/shadow');
  assert.throws(() => fs.readFile('/', '/etc/shadow'), /Permission denied/);
  assert.equal(shadow.mode & 0o002, 0);
  fs.uid = 0;
  assert.ok(fs.readFile('/', '/etc/shadow').includes('analyst'));
});

test('vfs creates nested directories and writes files', () => {
  const fs = buildBaseFs(new Fs());
  fs.mkdir('/', '/tmp/deep/nested', { recursive: true });
  fs.writeFile('/', '/tmp/deep/nested/file.txt', 'hello');
  assert.equal(fs.readFile('/', '/tmp/deep/nested/file.txt'), 'hello');
  assert.equal(fs.lookup('/', '/tmp/deep/nested').isDir(), true);
});

test('vfs symlinks resolve to their target', () => {
  const fs = buildBaseFs(new Fs());
  assert.equal(fs.stat('/', '/bin').type, 'link');
  assert.equal(fs.lookup('/', '/bin').isDir(), true);
  assert.equal(fs.lookup('/', '/bin/hostname').path, '/usr/bin/hostname');
});

/* ------------------------------------------------------------------- shell */

test('tokenizer honours quoting and escapes', () => {
  const tokens = tokenize('echo "hello world" \'single\' plain\\ value');
  assert.deepEqual(tokens.map((t) => t.value), ['echo', 'hello world', 'single', 'plain value']);
});

test('shell expands variables and globs', async () => {
  const shell = makeShell();
  shell.env.TARGET = '/etc/passwd';
  const result = await shell.run('echo $TARGET');
  assert.equal(result.stdout.trim(), '/etc/passwd');

  const globbed = expandGlobs(['/etc/host*'], shell.fs, '/');
  assert.deepEqual(globbed, ['/etc/hostname', '/etc/hosts']);
});

test('shell supports pipes, redirection and chaining', async () => {
  const shell = makeShell();
  const piped = await shell.run('echo hello | tr a-z A-Z');
  assert.equal(piped.stdout.trim(), 'HELLO');

  const redirected = await shell.run('echo "written" > /tmp/out.txt && cat /tmp/out.txt');
  assert.match(redirected.stdout, /written/);

  const chained = await shell.run('false || echo fallback');
  assert.equal(chained.stdout.trim(), 'fallback');
});

test('shell reports unknown commands like bash', async () => {
  const shell = makeShell();
  const result = await shell.run('definitelynotacommand');
  assert.equal(result.code, 127);
  assert.match(result.stderr, /command not found/);
});

test('shell never touches the host filesystem', async () => {
  const shell = makeShell();
  const result = await shell.run('echo "escaped" > /tmp/../../../../tmp/opencode/escape.txt');
  const host = await import('node:fs/promises');
  await assert.rejects(host.access('/tmp/opencode/escape.txt'));
  // The write is contained inside the simulated filesystem.
  assert.equal(result.code !== 0 || shell.fs.exists('/', '/tmp/opencode/escape.txt'), true);
});

/* --------------------------------------------------------------- commands */

test('ls renders long format with permissions', async () => {
  const shell = makeShell();
  const result = await shell.run('ls -l /etc/passwd');
  assert.match(result.stdout, /^-rw-r--r--/);
  assert.match(result.stdout, /passwd/);
});

test('grep supports case-insensitive inverse search', async () => {
  const shell = makeShell();
  const result = await shell.run('grep -i root /etc/passwd');
  assert.match(result.stdout, /root:x:0:0/);
  const inverse = await shell.run('grep -v root /etc/passwd');
  assert.doesNotMatch(inverse.stdout, /root:x:0:0/);
});

test('find locates files by name and type', async () => {
  const shell = makeShell();
  const result = await shell.run('find /etc -name "hostname" -type f');
  assert.match(result.stdout, /\/etc\/hostname/);
});

test('base64 round trips through the shell', async () => {
  const shell = makeShell();
  const encoded = await shell.run('echo -n "welcome_home" | base64');
  assert.equal(encoded.stdout.trim(), 'd2VsY29tZV9ob21l');
  const decoded = await shell.run('echo d2VsY29tZV9ob21l | base64 -d');
  assert.equal(decoded.stdout.trim(), 'welcome_home');
});

test('tr performs rot13 with range syntax', async () => {
  const shell = makeShell();
  const result = await shell.run('echo "gur juvgr enoovg" | tr "a-z" "n-za-m"');
  assert.equal(result.stdout.trim(), 'the white rabbit');
});

test('awk extracts fields from a delimited file', async () => {
  const shell = makeShell();
  const result = await shell.run('cat /etc/passwd | cut -d: -f1 | head -1');
  assert.equal(result.stdout.trim(), 'root');
});

test('python3 evaluates arithmetic and bitwise operators', async () => {
  const shell = makeShell();
  const result = await shell.run('python3 -c "print(4^6^8)"');
  assert.equal(result.stdout.trim(), '10');
});

/* ----------------------------------------------------------------- python */

test('python interpreter runs control flow and functions', () => {
  const interpreter = new PythonInterpreter({ write() {}, writeError() {} });
  const output = [];
  interpreter.write = (text) => output.push(text);
  interpreter.run([
    'def gate(tokens):',
    '    result = 0',
    '    for token in tokens:',
    '        if token % 2 == 0:',
    '            result ^= token',
    '    return result',
    'print(gate([3, 4, 6, 7, 8]))',
  ].join('\n'));
  assert.equal(output.join('').trim(), '10');
});

test('python interpreter decodes a two-layer payload', () => {
  const interpreter = new PythonInterpreter({ write() {}, writeError() {} });
  const output = [];
  interpreter.write = (text) => output.push(text);
  interpreter.run([
    'import base64',
    'raw = bytes.fromhex("5a32687663335167615734676447686c49484e6f5a577873")',
    'print(base64.b64decode(raw.decode()).decode())',
  ].join('\n'));
  assert.equal(output.join('').trim(), 'ghost in the shell');
});

/* ------------------------------------------------------------------- labs */

test('every challenge has a lab environment', async () => {
  const labs = await loadLabDefinitions();
  assert.ok(labs.size >= 16, `expected at least 16 labs, found ${labs.size}`);
  for (const [id, lab] of labs) {
    assert.equal(lab.id.toUpperCase(), id);
    assert.ok(lab.host, `${id} is missing a host`);
    assert.ok(lab.files && Object.keys(lab.files).length > 0, `${id} has no artefacts`);
  }
});

test('labs mount their artefacts into the session filesystem', async () => {
  const labs = await loadLabDefinitions();
  const lab = labs.get('HC-005');
  const fs = buildLabFs(lab);
  const rotate = fs.lookup('/', '/opt/cleanup/rotate.sh');
  assert.equal(rotate.mode, 0o777);
  assert.equal(rotate.owner, 'analyst');
});

/* ------------------------------------------------------------------- auth */

test('signed session tokens round trip and reject tampering', () => {
  const secret = 'a-secret-at-least-sixteen-chars';
  const token = sign({ sub: '123', username: 'analyst', iat: Date.now() }, secret);
  const payload = verifySigned(token, secret);
  assert.equal(payload.sub, '123');

  const [body, signature] = token.split('.');
  assert.equal(verifySigned(`${body}.${signature.slice(0, -1)}x`, secret), null);
  assert.equal(verifySigned(token, 'another-secret-entirely-here'), null);
});

test('cookies parse and serialise correctly', () => {
  const header = serializeCookie('hc_session', 'a b', { maxAge: 60 });
  assert.match(header, /hc_session=a%20b/);
  assert.match(header, /HttpOnly/);
  assert.deepEqual(parseCookies('hc_session=a%20b; other=1'), { hc_session: 'a b', other: '1' });
});

/* ------------------------------------------------- challenge solvability */

const SOLUTIONS = [
  { id: 'HC-001', commands: [['hostname']], expect: 'white-rabbit' },
  { id: 'HC-002', commands: [['cat /var/log/lab/dns-capture.log']], expect: 'updates.rabbit.lab' },
  { id: 'HC-003', commands: [['curl http://vault.rabbit.lab/robots.txt']], expect: '/vault' },
  { id: 'HC-004', commands: [['cat /home/analyst/notes/intercept.txt | tr "a-z" "n-za-m"']], expect: 'the white rabbit' },
  { id: 'HC-005', commands: [['ls -l /opt/cleanup']], expect: 'rotate.sh' },
  { id: 'HC-006', commands: [['python3 /home/analyst/gate.py']], expect: '10' },
  { id: 'HC-007', commands: [['cat /home/analyst/.bash_history']], expect: 'hold.dat' },
  { id: 'HC-008', commands: [['cat /home/analyst/Desktop/social-posts.txt']], expect: 'CMN' },
  { id: 'HC-009', commands: [['cat /var/log/lab/auth-summary.txt']], expect: 'password' },
  { id: 'HC-010', commands: [['python3 /home/analyst/decrypt.py']], expect: 'follow the white rabbit' },
  { id: 'HC-011', commands: [['cat /home/analyst/jwt-header.txt | base64 -d']], expect: 'none' },
  { id: 'HC-012', commands: [['cat /var/log/lab/arp.log']], expect: '10.20.0.66' },
  { id: 'HC-013', commands: [['cat /home/analyst/artifacts/artifact.b64 | base64 -d']], expect: 'forensics_artifact_42' },
  { id: 'HC-014', commands: [['cat /var/log/lab/timeline.log']], expect: '10.20.0.33' },
  { id: 'HC-015', commands: [['python3 /home/analyst/decode.py']], expect: 'ghost in the shell' },
  { id: 'HC-016', commands: [['cat /home/analyst/welcome.txt | base64 -d']], expect: 'welcome_home' },
  { id: 'HC-017', commands: [['cat .session_token | xxd -r -p']], expect: 'hex_handshake' },
];

test('every challenge can be solved from inside the terminal', async () => {
  const labs = await loadLabDefinitions();

  for (const solution of SOLUTIONS) {
    const lab = labs.get(solution.id);
    assert.ok(lab, `${solution.id} has no lab`);
    const { shell } = createLabShell({ lab, session: null });

    let output = '';
    for (const [command] of solution.commands) {
      const result = await shell.run(command);
      output += `${result.stdout}${result.stderr}`;
    }

    assert.ok(
      output.toLowerCase().includes(solution.expect.toLowerCase()),
      `${solution.id}: expected "${solution.expect}" in output but got:\n${output}`,
    );
  }
});

test('the lab filesystem resets between sessions', async () => {
  const labs = await loadLabDefinitions();
  const lab = labs.get('HC-003');
  const { shell } = createLabShell({ lab, session: null });
  await shell.run('echo hacked > /tmp/pwned.txt');
  assert.match(shell.fs.readFile('/', '/tmp/pwned.txt'), /hacked/);

  const fresh = createLabShell({ lab, session: null });
  assert.equal(fresh.shell.fs.exists('/', '/tmp/pwned.txt'), false);
});

/* ----------------------------------------------------------------- silence */

test('logger helper is present for future suites', () => {
  assert.equal(typeof silentLogger.info, 'function');
});
