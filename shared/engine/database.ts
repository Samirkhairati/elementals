// project/database.json helpers: normalisation, validation and the manifest the game loads.

import type { GameDatabase, SummaryContext, SwitchDef, ValidationContext, VariableDef } from './types.ts';
import { isRecord } from './util.ts';

export function createEmptyDatabase(): GameDatabase {
  return { version: 1, switches: [], variables: [] };
}

/**
 * Cleans untrusted database JSON: drops entries without a usable id, keeps the first of duplicate ids,
 * defaults names to the id and variable initial values to 0. Never throws.
 */
export function normalizeDatabase(raw: unknown): GameDatabase {
  const db = createEmptyDatabase();
  if (!isRecord(raw)) return db;

  const seenSwitches = new Set<string>();
  for (const s of Array.isArray(raw.switches) ? raw.switches : []) {
    if (!isRecord(s) || typeof s.id !== 'string' || s.id === '' || seenSwitches.has(s.id)) continue;
    seenSwitches.add(s.id);
    db.switches.push({ id: s.id, name: typeof s.name === 'string' ? s.name : s.id });
  }

  const seenVariables = new Set<string>();
  for (const v of Array.isArray(raw.variables) ? raw.variables : []) {
    if (!isRecord(v) || typeof v.id !== 'string' || v.id === '' || seenVariables.has(v.id)) continue;
    seenVariables.add(v.id);
    db.variables.push({
      id: v.id,
      name: typeof v.name === 'string' ? v.name : v.id,
      initial: typeof v.initial === 'number' && Number.isFinite(v.initial) ? v.initial : 0,
    });
  }
  return db;
}

export interface DatabaseCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Reports what `normalizeDatabase` would silently drop or repair. */
export function validateDatabase(raw: unknown): DatabaseCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(raw)) return { ok: false, errors: ['database must be an object'], warnings };
  if (raw.version !== 1) errors.push(`version must be 1 (got ${JSON.stringify(raw.version)})`);

  const check = (list: unknown, label: string, numeric: boolean) => {
    if (!Array.isArray(list)) {
      errors.push(`${label} must be an array`);
      return;
    }
    const seen = new Set<string>();
    list.forEach((item, i) => {
      if (!isRecord(item)) {
        errors.push(`${label}[${i}] is not an object`);
        return;
      }
      if (typeof item.id !== 'string' || item.id === '') errors.push(`${label}[${i}]: id must be a non-empty string`);
      else if (seen.has(item.id)) errors.push(`${label}[${i}]: duplicate id "${item.id}"`);
      else seen.add(item.id);
      if (typeof item.name !== 'string' || item.name.trim() === '') warnings.push(`${label}[${i}]: name is empty`);
      if (numeric && (typeof item.initial !== 'number' || !Number.isFinite(item.initial))) errors.push(`${label}[${i}]: initial must be a number`);
    });
  };
  check(raw.switches, 'switches', false);
  check(raw.variables, 'variables', true);
  return { ok: errors.length === 0, errors, warnings };
}

/** What the game loads as `data/database.json`: the normalised database. */
export function buildDatabaseManifest(db: unknown): GameDatabase {
  return normalizeDatabase(db);
}

/** Id lists for `validateCommands` / `validateEntity`. */
export function databaseValidationContext(db: Pick<GameDatabase, 'switches' | 'variables'>): Pick<ValidationContext, 'switchIds' | 'variableIds'> {
  return { switchIds: db.switches.map((s: SwitchDef) => s.id), variableIds: db.variables.map((v: VariableDef) => v.id) };
}

/** Name lookups for command summaries. */
export function databaseSummaryContext(db: Pick<GameDatabase, 'switches' | 'variables'>): Pick<SummaryContext, 'switchName' | 'variableName'> {
  return {
    switchName: (id) => db.switches.find((s) => s.id === id)?.name,
    variableName: (id) => db.variables.find((v) => v.id === id)?.name,
  };
}
