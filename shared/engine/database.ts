// project/database.json helpers: normalisation, validation and the manifest the game loads.

import type { GameDatabase, StageDef, SummaryContext, SwitchDef, ValidationContext, VariableDef } from './types.ts';
import { isRecord } from './util.ts';

/** The parts of the database most callers need; `stages` is optional so version 1 data still fits. */
export type DatabaseLike = Pick<GameDatabase, 'switches' | 'variables'> & Partial<Pick<GameDatabase, 'stages'>>;

export function createEmptyDatabase(): GameDatabase {
  return { version: 2, switches: [], variables: [], stages: [] };
}

function folderOf(raw: Record<string, unknown>): { folder?: string } {
  if (typeof raw.folder !== 'string') return {};
  const folder = raw.folder
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
  return folder ? { folder } : {};
}

/**
 * Cleans untrusted database JSON (version 1 or 2; the result is always version 2): drops entries
 * without a usable id, keeps the first of duplicate ids, defaults names to the id and variable initial
 * values to 0, tidies folders ("a / b/" -> "a/b"). Stages need at least one valid value; their initial
 * value falls back to the first one. Never throws.
 */
export function normalizeDatabase(raw: unknown): GameDatabase {
  const db = createEmptyDatabase();
  if (!isRecord(raw)) return db;

  const seenSwitches = new Set<string>();
  for (const s of Array.isArray(raw.switches) ? raw.switches : []) {
    if (!isRecord(s) || typeof s.id !== 'string' || s.id === '' || seenSwitches.has(s.id)) continue;
    seenSwitches.add(s.id);
    db.switches.push({ id: s.id, name: typeof s.name === 'string' ? s.name : s.id, ...folderOf(s) });
  }

  const seenVariables = new Set<string>();
  for (const v of Array.isArray(raw.variables) ? raw.variables : []) {
    if (!isRecord(v) || typeof v.id !== 'string' || v.id === '' || seenVariables.has(v.id)) continue;
    seenVariables.add(v.id);
    db.variables.push({
      id: v.id,
      name: typeof v.name === 'string' ? v.name : v.id,
      initial: typeof v.initial === 'number' && Number.isFinite(v.initial) ? v.initial : 0,
      ...folderOf(v),
    });
  }

  const seenStages = new Set<string>();
  for (const st of Array.isArray(raw.stages) ? raw.stages : []) {
    if (!isRecord(st) || typeof st.id !== 'string' || st.id === '' || seenStages.has(st.id)) continue;
    const seenValues = new Set<string>();
    const values: StageDef['values'] = [];
    for (const val of Array.isArray(st.values) ? st.values : []) {
      if (!isRecord(val) || typeof val.id !== 'string' || val.id === '' || seenValues.has(val.id)) continue;
      seenValues.add(val.id);
      values.push({ id: val.id, name: typeof val.name === 'string' ? val.name : val.id });
    }
    if (values.length === 0) continue;
    seenStages.add(st.id);
    db.stages.push({
      id: st.id,
      name: typeof st.name === 'string' ? st.name : st.id,
      values,
      initial: typeof st.initial === 'string' && seenValues.has(st.initial) ? st.initial : values[0].id,
      ...folderOf(st),
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
  if (raw.version !== 1 && raw.version !== 2) errors.push(`version must be 1 or 2 (got ${JSON.stringify(raw.version)})`);

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

  if (raw.stages !== undefined) {
    check(raw.stages, 'stages', false);
    if (Array.isArray(raw.stages)) {
      raw.stages.forEach((st: unknown, i: number) => {
        if (!isRecord(st)) return;
        const values = Array.isArray(st.values) ? st.values : [];
        if (values.length === 0) {
          errors.push(`stages[${i}]: needs at least one value`);
          return;
        }
        const ids = new Set<string>();
        values.forEach((v: unknown, j: number) => {
          if (!isRecord(v) || typeof v.id !== 'string' || v.id === '') errors.push(`stages[${i}].values[${j}]: id must be a non-empty string`);
          else if (ids.has(v.id)) errors.push(`stages[${i}].values[${j}]: duplicate id "${v.id}"`);
          else ids.add(v.id);
        });
        if (st.initial !== undefined && !(typeof st.initial === 'string' && ids.has(st.initial))) {
          warnings.push(`stages[${i}]: initial is not one of its values (the first value is used)`);
        }
      });
    }
  } else if (raw.version === 2) {
    errors.push('stages must be an array');
  }
  return { ok: errors.length === 0, errors, warnings };
}

/** What the game loads as `data/database.json`: the normalised database. */
export function buildDatabaseManifest(db: unknown): GameDatabase {
  return normalizeDatabase(db);
}

/** Id lists for `validateCommands` / `validateEntity`. */
export function databaseValidationContext(db: DatabaseLike): Pick<ValidationContext, 'switchIds' | 'variableIds' | 'stageIds' | 'stageValues'> {
  const stages = db.stages ?? [];
  return {
    switchIds: db.switches.map((s: SwitchDef) => s.id),
    variableIds: db.variables.map((v: VariableDef) => v.id),
    stageIds: stages.map((s) => s.id),
    stageValues: Object.fromEntries(stages.map((s) => [s.id, s.values.map((v) => v.id)])),
  };
}

/** Name lookups for command summaries. */
export function databaseSummaryContext(db: DatabaseLike): Pick<SummaryContext, 'switchName' | 'variableName' | 'stageName' | 'stageValueName'> {
  const stages = db.stages ?? [];
  return {
    switchName: (id) => db.switches.find((s) => s.id === id)?.name,
    variableName: (id) => db.variables.find((v) => v.id === id)?.name,
    stageName: (id) => stages.find((s) => s.id === id)?.name,
    stageValueName: (stageId, valueId) => stages.find((s) => s.id === stageId)?.values.find((v) => v.id === valueId)?.name,
  };
}

/** Position of a value inside its stage, or -1. Conditions on stages compare these positions. */
export function stageValueIndex(stage: Pick<StageDef, 'values'> | undefined, valueId: string): number {
  return stage ? stage.values.findIndex((v) => v.id === valueId) : -1;
}
