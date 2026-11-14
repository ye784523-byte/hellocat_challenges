import fs from 'node:fs/promises';
import path from 'node:path';

async function collectJsonFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectJsonFiles(full)));
    else if (entry.isFile() && entry.name.endsWith('.json')) files.push(full);
  }
  return files;
}

export async function loadChallengeDefinitions(directory) {
  const files = await collectJsonFiles(directory);
  const definitions = [];
  const errors = [];

  for (const file of files) {
    try {
      const raw = await fs.readFile(file, 'utf8');
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : parsed.challenges ? parsed.challenges : [parsed];
      if (!Array.isArray(list)) throw new Error('expected a challenge object or challenge array');
      for (const definition of list) {
        if (!definition || typeof definition !== 'object') {
          throw new Error('challenge entry must be an object');
        }
        definitions.push({ file, definition });
      }
    } catch (error) {
      errors.push({ file, error: error.message });
    }
  }

  return { definitions, errors, files };
}

export async function importChallenges(challengeService, directory, { publish = false, logger, only = null } = {}) {
  const { definitions, errors } = await loadChallengeDefinitions(directory);
  const seen = new Set();
  const results = { imported: [], updated: [], skipped: [], errors: [...errors] };

  const filter = only ? new Set(only.map((id) => String(id).trim().toUpperCase())) : null;

  for (const { file, definition } of definitions) {
    if (!definition.id || typeof definition.id !== 'string') {
      results.errors.push({ file, error: 'missing challenge id' });
      continue;
    }
    if (seen.has(definition.id)) {
      results.errors.push({ file, error: `duplicate challenge id ${definition.id}` });
      continue;
    }
    seen.add(definition.id);
    if (filter && !filter.has(definition.id.toUpperCase())) {
      results.skipped.push(definition.id);
      continue;
    }

    try {
      const existing = await challengeService.getRaw(definition.id);
      await challengeService.upsertImported(definition, { publish });
      if (existing) results.updated.push(definition.id);
      else results.imported.push(definition.id);
    } catch (error) {
      results.errors.push({ file, error: error.message });
      logger?.error('Challenge import failed', { file, challengeId: definition.id, error: error.message });
    }
  }

  // A prerequisite that does not exist would leave the challenge locked for
  // every operator, so the reference is checked against the live store.
  for (const id of [...results.imported, ...results.updated]) {
    const challenge = await challengeService.getRaw(id);
    for (const prerequisite of challenge?.prerequisites ?? []) {
      if (!(await challengeService.getRaw(prerequisite))) {
        results.errors.push({
          file: `challenge ${id}`,
          error: `unknown prerequisite ${prerequisite}`,
        });
      }
    }
  }

  return results;
}
