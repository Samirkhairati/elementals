import fs from 'fs';
import { atomicWriteJsonSync } from './atomicWrite.js';
import { pathExists } from './folderOps.js';
import { resolveInside } from './pathSafety.js';

/**
 * Electron-free storage for prefabs: `project/prefabs.json`, `{ prefabs: [{ id, name, node, ... }] }`, each prefab a
 * saved node tree (shared/prefabs.ts gives it its meaning; the main process cannot import shared/). This only keeps the
 * file well-formed and inside the project.
 */

export const PREFABS_FILE = 'prefabs.json';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Problems with a prefabs file (empty list = storable). */
export function validatePrefabs(file: unknown): string[] {
  if (!isObject(file)) return ['prefabs must be a JSON object'];
  if (!Array.isArray(file.prefabs)) return ['prefabs must be a list'];
  const errors: string[] = [];
  const ids = new Set<string>();
  file.prefabs.forEach((p, i) => {
    if (!isObject(p)) return errors.push(`prefab ${i} must be an object`);
    if (typeof p.id !== 'string' || !p.id) errors.push(`prefab ${i} needs an id`);
    else if (ids.has(p.id)) errors.push(`prefab id "${p.id}" is used twice`);
    else ids.add(p.id);
    if (typeof p.name !== 'string') errors.push(`prefab ${i} needs a name`);
    if (!isObject(p.node) || typeof p.node.type !== 'string') errors.push(`prefab ${i} needs a node`);
  });
  return errors;
}

/** The stored prefabs, or null when the project has none yet (the editor's built-in ones apply; nothing is written). */
export function getPrefabs(projectDir: string): { prefabs: unknown | null } {
  const file = resolveInside(projectDir, [PREFABS_FILE]);
  if (!pathExists(file)) return { prefabs: null };
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { prefabs: isObject(parsed) ? parsed : null };
}

export function savePrefabs(projectDir: string, prefabs: unknown): { prefabs: unknown } {
  const errors = validatePrefabs(prefabs);
  if (errors.length > 0) throw new Error(`Invalid prefabs: ${errors.join('; ')}`);
  fs.mkdirSync(projectDir, { recursive: true });
  atomicWriteJsonSync(resolveInside(projectDir, [PREFABS_FILE]), prefabs);
  return { prefabs };
}
