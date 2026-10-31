import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDirTracker } from '../__testutils__/helpers';
import { getDatabase, normalizeDatabase, saveDatabase, validateDatabase } from './databaseStore';

const tmp = makeTempDirTracker();
let dir: string;
beforeEach(() => {
  dir = tmp.create();
});
afterEach(() => tmp.cleanup());

const valid = () => ({
  version: 1,
  switches: [{ id: 'intro_done', name: 'Intro done' }],
  variables: [{ id: 'badges', name: 'Badges', initial: 0 }],
});

describe('validateDatabase', () => {
  it('accepts a valid database', () => {
    expect(validateDatabase(valid())).toEqual([]);
    expect(validateDatabase({ version: 1, switches: [], variables: [] })).toEqual([]);
  });

  it.each([
    ['non-object', null, /JSON object/],
    ['wrong version', { ...valid(), version: 2 }, /version/],
    ['switches not array', { ...valid(), switches: {} }, /switches must be an array/],
    ['duplicate switch ids', { ...valid(), switches: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }] }, /not unique/],
    ['duplicate variable ids', { ...valid(), variables: [{ id: 'a', name: 'A', initial: 0 }, { id: 'a', name: 'B', initial: 1 }] }, /not unique/],
    ['empty switch name', { ...valid(), switches: [{ id: 'a', name: '  ' }] }, /name must be a non-empty/],
    ['empty id', { ...valid(), switches: [{ id: '', name: 'A' }] }, /id must be a non-empty/],
    ['id with whitespace', { ...valid(), switches: [{ id: ' a', name: 'A' }] }, /id must be a non-empty/],
    ['NaN initial', { ...valid(), variables: [{ id: 'a', name: 'A', initial: NaN }] }, /initial/],
    ['string initial', { ...valid(), variables: [{ id: 'a', name: 'A', initial: '1' }] }, /initial/],
  ])('rejects: %s', (_l, db, pattern) => {
    expect(validateDatabase(db).join(' | ')).toMatch(pattern);
  });

  it('allows the same id in switches and variables (separate namespaces)', () => {
    expect(validateDatabase({ version: 1, switches: [{ id: 'x', name: 'X' }], variables: [{ id: 'x', name: 'X', initial: 0 }] })).toEqual([]);
  });
});

describe('database store', () => {
  it('returns an empty database (and writes nothing) when the file is missing', () => {
    expect(getDatabase(dir).database).toEqual({ version: 1, switches: [], variables: [] });
    expect(fs.existsSync(path.join(dir, 'database.json'))).toBe(false);
  });

  it('round-trips, normalising names and dropping unknown keys', () => {
    const saved = saveDatabase(dir, { ...valid(), junk: 1, switches: [{ id: 'a', name: ' Alpha ', extra: true }] }).database;
    expect(saved.switches).toEqual([{ id: 'a', name: 'Alpha' }]);
    expect(getDatabase(dir).database).toEqual(saved);
    expect(fs.readdirSync(dir)).toEqual(['database.json']); // no temp files left behind
  });

  it('refuses invalid data and keeps the previous file', () => {
    saveDatabase(dir, valid());
    const before = fs.readFileSync(path.join(dir, 'database.json'), 'utf8');
    expect(() => saveDatabase(dir, { ...valid(), switches: [{ id: 'a', name: '' }] })).toThrow(/Invalid database/);
    expect(fs.readFileSync(path.join(dir, 'database.json'), 'utf8')).toBe(before);
  });

  it('creates the project directory on first save', () => {
    const nested = path.join(dir, 'new', 'project');
    saveDatabase(nested, valid());
    expect(fs.existsSync(path.join(nested, 'database.json'))).toBe(true);
  });

  it('reports a corrupt or invalid file on read', () => {
    fs.writeFileSync(path.join(dir, 'database.json'), '{nope');
    expect(() => getDatabase(dir)).toThrow();
    fs.writeFileSync(path.join(dir, 'database.json'), JSON.stringify({ version: 1, switches: [{ id: 'a' }], variables: [] }));
    expect(() => getDatabase(dir)).toThrow(/Invalid database/);
  });

  it('normalizeDatabase is idempotent', () => {
    const once = normalizeDatabase(valid());
    expect(normalizeDatabase(once)).toEqual(once);
  });
});
