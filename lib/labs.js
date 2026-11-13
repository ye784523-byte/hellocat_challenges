/**
 * Lab loader: turns a lab definition into a ready-to-use simulated session.
 *
 * Each lab describes the artefacts an operator needs (files, hosts, DNS
 * records, a small web root) so that a challenge can be solved with ordinary
 * command line habits inside the browser terminal.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Fs, mountTree } from './vfs.js';
import { buildBaseFs } from './basefs.js';
import { Shell } from './shell.js';
import { createRegistry } from './commands/index.js';

const LAB_DIR = path.resolve(import.meta.dirname, '..', 'labs');

export const DEFAULT_LAB = {
  id: 'HC-016',
  title: 'First Contact',
  host: 'kali-lab',
  user: 'analyst',
  cwd: '/home/analyst',
  banner: '  Hello Cat lab terminal ready. Type `challenges` to see what is available.',
  hosts: {
    'kali-lab': {
      ip: '10.20.0.33',
      ports: { '22/tcp': { service: 'ssh', version: 'OpenSSH 9.6p1 Debian 3' } },
    },
  },
  dns: {},
  arp: [['10.20.0.1', '00:11:22:33:44:55', 'C', 'eth0']],
  files: {},
};

export async function loadLabDefinitions(labDir = LAB_DIR) {
  const definitions = new Map();
  let entries = [];
  try {
    entries = await fs.readdir(labDir);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return definitions;
  }

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const raw = await fs.readFile(path.join(labDir, entry), 'utf8');
    let definition;
    try {
      definition = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Lab ${entry} is not valid JSON: ${error.message}`);
    }
    if (!definition.id) throw new Error(`Lab ${entry} is missing an id`);
    definitions.set(definition.id.toUpperCase(), definition);
  }
  return definitions;
}

/**
 * Build a fresh filesystem for a lab.
 * @param {object} lab lab definition
 * @returns {import('./vfs.js').Fs}
 */
export function buildLabFs(lab) {
  const fs = new Fs({ user: lab.user ?? 'analyst', uid: 1000, gid: 1000, groups: ['analysts'] });
  buildBaseFs(fs);

  const files = lab.files ?? {};
  if (Object.keys(files).length > 0) {
    const identity = { user: fs.user, uid: fs.uid, gid: fs.gid, groups: fs.groups };
    fs.user = 'root';
    fs.uid = 0;
    fs.gid = 0;
    fs.groups = ['root'];
    try {
      mountTree(fs, files);
    } finally {
      fs.user = identity.user;
      fs.uid = identity.uid;
      fs.gid = identity.gid;
      fs.groups = identity.groups;
    }
  }

  // The lab hostname is authoritative for this environment.
  if (lab.host) {
    const hostnameFile = fs.lookup('/', '/etc/hostname', { follow: false });
    hostnameFile.content = `${lab.host}\n`;
  }

  return fs;
}

/**
 * Create a shell bound to a lab.
 * @param {object} options
 * @param {object} options.lab lab definition
 * @param {object} options.session session facade used by the lab commands
 */
export function createLabShell({ lab, session }) {
  const fs = buildLabFs(lab);
  const registry = createRegistry();
  const shell = new Shell({
    fs,
    registry,
    lab,
    session,
    user: lab.user ?? 'analyst',
    hostname: lab.host ?? 'kali-lab',
    cwd: lab.cwd ?? '/home/analyst',
    env: {
      HOME: lab.user === 'analyst' ? '/home/analyst' : `/home/${lab.user ?? 'analyst'}`,
    },
  });
  shell.fs = fs;
  return { shell, fs };
}

export { LAB_DIR };
