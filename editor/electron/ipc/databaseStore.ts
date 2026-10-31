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
  folder?: string;
}

export interface VariableDef {
  id: string;
  name: string;
  initial: number;
  folder?: string;
}

export interface StageValueDef {
  id: string;
  name: string;
}

export interface StageDef {
  id: string;
  name: string;
  folder?: string;
  values: StageValueDef[];
  initial: string;
}

export interface GameDatabase {
  /** 2 adds stages and folders; version 1 files are read and upgraded on the next save. */
  version: 1 | 2;
  switches: SwitchDef[];
  variables: VariableDef[];
  stages: StageDef[];
}

export const DATABASE_FILE = 'database.json';

export function emptyDatabase(): GameDatabase {
  return { version: 2, switches: [], variables: [], stages: [] };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function validateList(
  list: unknown,
  what: 'switches' | 'variables' | 'stages',
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
  if (db.version !== 1 && db.version !== 2) errors.push(`version must be 1 or 2 (got ${JSON.stringify(db.version)})`);
  validateList(db.switches, 'switches', errors);
  validateList(db.variables, 'variables', errors, (entry, label) => {
    if (typeof entry.initial !== 'number' || !Number.isFinite(entry.initial)) {
      errors.push(`${label}.initial must be a finite number`);
    }
  });
  // Version 1 files have no stages; they are upgraded to an empty list.
  if (db.stages !== undefined || db.version === 2) {
    validateList(db.stages, 'stages', errors, (entry, label) => {
      const values = entry.values;
      if (!Array.isArray(values) || values.length === 0) {
        errors.push(`${label}.values must be a non-empty array`);
        return;
      }
      const seen = new Set<string>();
      values.forEach((value, index) => {
        const vl = `${label}.values[${index}]`;
        if (!isObject(value)) {
          errors.push(`${vl} must be an object`);
          return;
        }
        if (typeof value.id !== 'string' || value.id.trim() === '' || value.id !== value.id.trim()) {
          errors.push(`${vl}.id must be a non-empty string without surrounding whitespace`);
        } else if (seen.has(value.id)) {
          errors.push(`${vl}.id "${value.id}" is not unique`);
        } else {
          seen.add(value.id);
        }
        if (typeof value.name !== 'string' || value.name.trim() === '') errors.push(`${vl}.name must be a non-empty string`);
      });
      if (typeof entry.initial !== 'string' || !seen.has(entry.initial)) errors.push(`${label}.initial must be one of its values`);
    });
  }
  return errors;
}

/** "a / b/" -> "a/b"; nothing usable -> no folder key at all. */
function cleanFolder(folder: unknown): { folder?: string } {
  if (typeof folder !== 'string') return {};
  const path = folder
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
  return path ? { folder: path } : {};
}

/** Validate and return a clean copy (only known keys, names trimmed). Throws one readable error. */
export function normalizeDatabase(db: unknown): GameDatabase {
  const errors = validateDatabase(db);
  if (errors.length > 0) throw new Error(`Invalid database: ${errors.join('; ')}`);
  const d = db as GameDatabase;
  return {
    version: 2,
    switches: d.switches.map((s) => ({ id: s.id, name: s.name.trim(), ...cleanFolder(s.folder) })),
    variables: d.variables.map((v) => ({ id: v.id, name: v.name.trim(), initial: v.initial, ...cleanFolder(v.folder) })),
    stages: (d.stages ?? []).map((st) => ({
      id: st.id,
      name: st.name.trim(),
      values: st.values.map((value) => ({ id: value.id, name: value.name.trim() })),
      initial: st.initial,
      ...cleanFolder(st.folder),
    })),
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
