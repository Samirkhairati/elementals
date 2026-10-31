import fs from 'fs';
import { atomicWriteJsonSync } from './atomicWrite.js';
import { pathExists } from './folderOps.js';
import { resolveInside } from './pathSafety.js';

/**
 * Electron-free storage for `project/database.json` (global switches and variables).
 * Mirrors `GameDatabase` in shared/engine/types.ts (re-declared: the main process cannot import shared/).
 */

export interface SwitchDef {
  id: string;
  name: string;
}

export interface VariableDef {
  id: string;
  name: string;
  initial: number;
}

export interface GameDatabase {
  version: 1;
  switches: SwitchDef[];
  variables: VariableDef[];
}

export const DATABASE_FILE = 'database.json';

export function emptyDatabase(): GameDatabase {
  return { version: 1, switches: [], variables: [] };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function validateList(
  list: unknown,
  what: 'switches' | 'variables',
  errors: string[],
  extra?: (entry: Record<string, unknown>, label: string) => void
): void {
  if (!Array.isArray(list)) {
    errors.push(`${what} must be an array`);
    return;
  }
  const seen = new Set<string>();
  list.forEach((entry, index) => {
    const label = `${what}[${index}]`;
    if (!isObject(entry)) {
      errors.push(`${label} must be an object`);
      return;
    }
    const { id, name } = entry;
    if (typeof id !== 'string' || id.trim() === '' || id !== id.trim()) {
      errors.push(`${label}.id must be a non-empty string without surrounding whitespace`);
    } else if (seen.has(id)) {
      errors.push(`${label}.id "${id}" is not unique`);
    } else {
      seen.add(id);
    }
    if (typeof name !== 'string' || name.trim() === '') errors.push(`${label}.name must be a non-empty string`);
    extra?.(entry, label);
  });
}

/** All problems with a database value (empty list = valid). */
export function validateDatabase(db: unknown): string[] {
  if (!isObject(db)) return ['database must be a JSON object'];
  const errors: string[] = [];
  if (db.version !== 1) errors.push(`version must be 1 (got ${JSON.stringify(db.version)})`);
  validateList(db.switches, 'switches', errors);
  validateList(db.variables, 'variables', errors, (entry, label) => {
    if (typeof entry.initial !== 'number' || !Number.isFinite(entry.initial)) {
      errors.push(`${label}.initial must be a finite number`);
    }
  });
  return errors;
}

/** Validate and return a clean copy (only known keys, names trimmed). Throws one readable error. */
export function normalizeDatabase(db: unknown): GameDatabase {
  const errors = validateDatabase(db);
  if (errors.length > 0) throw new Error(`Invalid database: ${errors.join('; ')}`);
  const d = db as GameDatabase;
  return {
    version: 1,
    switches: d.switches.map((s) => ({ id: s.id, name: s.name.trim() })),
    variables: d.variables.map((v) => ({ id: v.id, name: v.name.trim(), initial: v.initial })),
  };
}

/** The stored database; a project without database.json has an empty one (nothing is written). */
export function getDatabase(projectDir: string): { database: GameDatabase } {
  const file = resolveInside(projectDir, [DATABASE_FILE]);
  if (!pathExists(file)) return { database: emptyDatabase() };
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { database: normalizeDatabase(parsed) };
}

export function saveDatabase(projectDir: string, db: unknown): { database: GameDatabase } {
  const database = normalizeDatabase(db);
  fs.mkdirSync(projectDir, { recursive: true });
  atomicWriteJsonSync(resolveInside(projectDir, [DATABASE_FILE]), database);
  return { database };
}
