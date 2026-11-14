import fs from 'node:fs/promises';
import path from 'node:path';

export async function createBackup({ storage, backupDir, logger, retention = 10, now = new Date() }) {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const target = path.join(backupDir, `backup-${stamp}`);
  await fs.mkdir(target, { recursive: true });

  const files = [];
  for (const store of Object.values(storage.stores)) {
    await store.flush();
    const copied = await store.backupTo(target);
    if (copied) files.push(copied);
  }

  const manifest = {
    createdAt: now.toISOString(),
    files: files.map((file) => path.basename(file)),
    count: files.length,
  };
  await fs.writeFile(path.join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  });

  try {
    const entries = (await fs.readdir(backupDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('backup-'))
      .map((entry) => entry.name)
      .sort()
      .reverse();
    for (const old of entries.slice(retention)) {
      await fs.rm(path.join(backupDir, old), { recursive: true, force: true });
      logger?.info('Pruned old backup', { directory: old });
    }
  } catch (error) {
    logger?.warn('Backup pruning failed', { error: error.message });
  }

  logger?.info('Backup created', { target, files: files.length });
  return { directory: target, files, manifest };
}

export async function restoreBackup({ backupDirectory, storage, logger }) {
  const entries = await fs.readdir(backupDirectory, { withFileTypes: true });
  const restored = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === 'manifest.json') continue;
    const source = path.join(backupDirectory, entry.name);
    const raw = await fs.readFile(source, 'utf8');
    JSON.parse(raw);
    const store = Object.values(storage.stores).find((candidate) => candidate.name === entry.name);
    if (!store) continue;
    await store.update(() => JSON.parse(raw));
    restored.push(entry.name);
  }
  logger?.warn('Backup restore completed', { backupDirectory, restored });
  return restored;
}
