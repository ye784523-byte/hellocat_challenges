import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const installerPath = path.join(root, 'install.sh');

async function readInstaller() {
  return fs.readFile(installerPath, 'utf8');
}

test('the installer ships with the terminal', async () => {
  const stat = await fs.stat(installerPath).catch(() => null);

  assert.ok(stat, 'install.sh must be part of the repository');
  assert.ok(stat.isFile(), 'install.sh must be a file');
});

test('the installer is valid bash', async () => {
  const result = spawnSync('bash', ['-n', installerPath], { encoding: 'utf8' });

  assert.equal(result.status, 0, `bash -n must accept the installer: ${result.stderr}`);
});

test('the installer offers the documented modes and options', async () => {
  const installer = await readInstaller();

  for (const option of ['--server', '--uninstall', '--dir', '--port', '--url', '--data-dir', '--yes']) {
    assert.ok(installer.includes(option), `the installer must support ${option}`);
  }

  const help = spawnSync('bash', [installerPath, '--help'], { encoding: 'utf8' });

  assert.equal(help.status, 0, '--help must exit cleanly');
  assert.match(help.stdout, /--server/, '--help must describe the server mode');
  assert.match(help.stdout, /--uninstall/, '--help must describe the uninstall mode');
  assert.match(help.stdout, /--data-dir/, '--help must describe the shared data directory');
});

test('the installer never overwrites an existing .env', async () => {
  const installer = await readInstaller();

  // The secrets of a running installation are irreplaceable: the stored flag
  // hashes are tied to FLAG_SECRET.
  assert.match(
    installer,
    /if \[ -f "\$env_file" \]; then[\s\S]*?return 0[\s\S]*?fi/,
    'an existing .env must be left untouched',
  );
});

test('the installer writes the secrets a fresh installation needs', async () => {
  const installer = await readInstaller();

  assert.match(installer, /FLAG_SECRET/, 'the installer must set FLAG_SECRET');
  assert.match(installer, /SESSION_SECRET/, 'the installer must set SESSION_SECRET');
  assert.match(installer, /randomBytes/, 'the secrets must be random');
});

test('the installer installs the systemd unit and the nginx site', async () => {
  const installer = await readInstaller();

  assert.match(installer, /deploy\/hellocat-web\.service/, 'the installer must install the unit');
  assert.match(installer, /deploy\/nginx\/hellocat-web\.conf/, 'the installer must install the site');
  assert.match(installer, /systemctl enable hellocat-web/, 'the installer must enable the service');
});
