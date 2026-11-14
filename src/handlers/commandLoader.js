import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(full)));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
  }
  return files;
}

export async function loadCommands(client, commandsDir, { logger } = {}) {
  const files = await collectFiles(commandsDir);
  let loaded = 0;
  for (const file of files) {
    const module = await import(pathToFileURL(file).href);
    const command = module.default ?? module.command;
    if (!command?.data || typeof command.execute !== 'function') {
      logger?.warn('Skipped invalid command module', { file });
      continue;
    }
    const name = command.data.name;
    if (!name) {
      logger?.warn('Skipped command without name', { file });
      continue;
    }
    if (client.commands.has(name)) {
      throw new Error(`Duplicate command name detected: ${name}`);
    }
    const category = command.category ?? path.basename(path.dirname(file));
    client.commands.set(name, { ...command, category, file });
    loaded += 1;
    logger?.debug('Command loaded', { name, category });
  }
  logger?.info('Command registry loaded', { count: loaded });
  return loaded;
}

export function commandData(client) {
  return [...client.commands.values()].map((command) => command.data.toJSON());
}
