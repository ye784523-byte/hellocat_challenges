import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadEvents(client, eventsDir, context, { logger } = {}) {
  const entries = await fs.readdir(eventsDir, { withFileTypes: true });
  let loaded = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const file = path.join(eventsDir, entry.name);
    const module = await import(pathToFileURL(file).href);
    const event = module.default ?? module.event;
    if (!event?.name || typeof event.execute !== 'function') {
      logger?.warn('Skipped invalid event module', { file });
      continue;
    }
    const handler = (...args) => {
      Promise.resolve(event.execute(...args, context)).catch((error) => {
        logger?.error('Event handler failed', {
          event: event.name,
          error: error.message,
        });
      });
    };
    if (event.once) client.once(event.name, handler);
    else client.on(event.name, handler);
    loaded += 1;
    logger?.debug('Event loaded', { name: event.name });
  }
  logger?.info('Event registry loaded', { count: loaded });
  return loaded;
}
