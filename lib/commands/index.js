/** Registry of every command available inside the simulated terminal. */

import { coreCommands } from './core.js';
import { devCommands } from './dev.js';
import { fsCommands } from './fsops.js';
import { labCommands } from './lab.js';
import { netCommands } from './net.js';
import { reconCommands } from './recon.js';
import { systemCommands } from './system.js';
import { textCommands } from './text.js';

export const COMMAND_GROUPS = Object.freeze({
  core: coreCommands,
  fs: fsCommands,
  text: textCommands,
  recon: reconCommands,
  net: netCommands,
  system: systemCommands,
  dev: devCommands,
  lab: labCommands,
});

export function createRegistry(extra = {}) {
  const registry = new Map();
  for (const group of Object.values(COMMAND_GROUPS)) {
    for (const [name, definition] of Object.entries(group)) {
      registry.set(name, { name, ...definition });
    }
  }
  for (const [name, definition] of Object.entries(extra)) {
    registry.set(name, { name, ...definition });
  }
  return registry;
}

export function commandCatalogue() {
  const catalogue = [];
  for (const group of Object.values(COMMAND_GROUPS)) {
    for (const [name, definition] of Object.entries(group)) {
      catalogue.push({ name, usage: definition.usage ?? name, summary: definition.summary ?? '' });
    }
  }
  return catalogue.sort((a, b) => a.name.localeCompare(b.name));
}

export { coreCommands, devCommands, fsCommands, labCommands, netCommands, reconCommands, systemCommands, textCommands };
