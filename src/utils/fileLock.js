import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Minimal cross-process advisory lock based on exclusive lock files.
 *
 * The Discord bot and the web terminal can run side by side against the same
 * JSON store; this keeps their read-modify-write cycles from interleaving.
 */

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_STALE_MS = 30_000;

export async function withFileLock(targetPath, task, { timeoutMs = DEFAULT_TIMEOUT_MS, staleMs = DEFAULT_STALE_MS } = {}) {
  const lockPath = `${targetPath}.lock`;
  const deadline = Date.now() + timeoutMs;
  let handle = null;

  while (!handle) {
    try {
      handle = await fs.open(lockPath, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      // Reclaim a lock left behind by a crashed process.
      try {
        const stats = await fs.stat(lockPath);
        if (Date.now() - stats.mtimeMs > staleMs) {
          await fs.unlink(lockPath).catch(() => {});
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for lock on ${path.basename(targetPath)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  try {
    await handle.writeFile(String(process.pid), 'utf8');
    return await task();
  } finally {
    await handle.close().catch(() => {});
    await fs.unlink(lockPath).catch(() => {});
  }
}
