/* eslint-disable @typescript-eslint/no-explicit-any -- loose fixtures on purpose */
import { describe, it, expect } from 'vitest'
import {
  buildDatabaseManifest,
  createEmptyDatabase,
  databaseSummaryContext,
  databaseValidationContext,
  normalizeDatabase,
  validateDatabase,
  cloneJson,
  deepEqual,
  stageValueIndex,
} from '../../../shared/engine/index'

describe('database', () => {
  const db = {
    version: 2,
    switches: [{ id: 's1', name: 'Door open' }, { id: 's2', name: 'Met mom' }],
    variables: [{ id: 'v1', name: 'Steps', initial: 5 }],
    stages: [
      {
        id: 'cat',
        name: 'Lost cat',
        folder: 'Quests',
        values: [{ id: 'none', name: 'Not started' }, { id: 'found', name: 'Found' }],
        initial: 'found',
      },
    ],
  }

  it('validates a good database and reports problems', () => {
    expect(validateDatabase(db)).toEqual({ ok: true, errors: [], warnings: [] })
    const bad = validateDatabase({ version: 3, switches: [{ id: 'a', name: '' }, { id: 'a', name: 'x' }, 3, { name: 'x' }], variables: [{ id: 'v', name: 'v', initial: 'x' }] })
    expect(bad.ok).toBe(false)
    expect(bad.errors.join('\n')).toMatch(/version[\s\S]*duplicate id "a"[\s\S]*not an object[\s\S]*id must be[\s\S]*initial must be a number/)
    expect(bad.warnings.join()).toMatch(/name is empty/)
    expect(validateDatabase(null).ok).toBe(false)
    expect(validateDatabase({ version: 1 }).errors).toHaveLength(2)
  })

  it('accepts version 1 files without stages and checks stages when present', () => {
    expect(validateDatabase({ version: 1, switches: [], variables: [] }).ok).toBe(true)
    expect(validateDatabase({ version: 2, switches: [], variables: [] }).errors).toEqual(['stages must be an array'])
    const bad = validateDatabase({
      version: 2,
      switches: [],
      variables: [],
      stages: [
        { id: 'a', name: 'A', values: [], initial: '' },
        { id: 'b', name: 'B', values: [{ id: 'x', name: 'X' }, { id: 'x', name: 'Y' }, { name: 'Z' }], initial: 'x' },
        { id: 'c', name: 'C', values: [{ id: 'x', name: 'X' }], initial: 'zzz' },
      ],
    })
    expect(bad.errors.join('\n')).toMatch(/stages\[0\]: needs at least one value[\s\S]*duplicate id "x"[\s\S]*id must be a non-empty string/)
    expect(bad.warnings.join()).toMatch(/stages\[2\]: initial is not one of its values/)
  })

  it('normalizeDatabase repairs and never throws', () => {
    expect(normalizeDatabase(db)).toEqual(db)
    expect(normalizeDatabase(null)).toEqual(createEmptyDatabase())
    expect(
      normalizeDatabase({ switches: [{ id: 'a' }, { id: 'a', name: 'dup' }, { id: '' }, null], variables: [{ id: 'v', initial: NaN }] }),
    ).toEqual({ version: 2, switches: [{ id: 'a', name: 'a' }], variables: [{ id: 'v', name: 'v', initial: 0 }], stages: [] })
    const manifest = buildDatabaseManifest(db)
    expect(manifest).toEqual(db)
    expect(manifest).not.toBe(db)
  })

  it('upgrades version 1 data to version 2 and normalizes stages and folders', () => {
    expect(normalizeDatabase({ version: 1, switches: [{ id: 'a', name: 'A' }], variables: [] })).toEqual({ version: 2, switches: [{ id: 'a', name: 'A' }], variables: [], stages: [] })
    const out = normalizeDatabase({
      version: 2,
      switches: [{ id: 'g', name: 'Gate', folder: ' Town / Gate/ ' }, { id: 'h', name: 'H', folder: '  ' }, { id: 'i', name: 'I', folder: 5 }],
      variables: [],
      stages: [
        { id: 'q', name: 'Q', values: [{ id: 'a' }, { id: 'a', name: 'dup' }, { id: '' }, null, { id: 'b', name: 'B' }], initial: 'zzz' },
        { id: 'empty', name: 'No values', values: [] },
        { id: 'q', name: 'Duplicate id', values: [{ id: 'x', name: 'X' }], initial: 'x' },
        { id: 'ok', values: [{ id: 'x', name: 'X' }], initial: 'x' },
      ],
    })
    expect(out.switches).toEqual([{ id: 'g', name: 'Gate', folder: 'Town/Gate' }, { id: 'h', name: 'H' }, { id: 'i', name: 'I' }])
    expect(out.stages).toEqual([
      { id: 'q', name: 'Q', values: [{ id: 'a', name: 'a' }, { id: 'b', name: 'B' }], initial: 'a' },
      { id: 'ok', name: 'ok', values: [{ id: 'x', name: 'X' }], initial: 'x' },
    ])
  })

  it('keeps a stage initial value that exists', () => {
    expect(normalizeDatabase(db).stages[0].initial).toBe('found')
  })

  it('provides validation and summary contexts', () => {
    expect(databaseValidationContext(db as any)).toEqual({ switchIds: ['s1', 's2'], variableIds: ['v1'], stageIds: ['cat'], stageValues: { cat: ['none', 'found'] } })
    expect(databaseValidationContext({ switches: [], variables: [] })).toEqual({ switchIds: [], variableIds: [], stageIds: [], stageValues: {} })
    const ctx = databaseSummaryContext(db as any)
    expect(ctx.switchName!('s2')).toBe('Met mom')
    expect(ctx.variableName!('v1')).toBe('Steps')
    expect(ctx.switchName!('zz')).toBeUndefined()
    expect(ctx.stageName!('cat')).toBe('Lost cat')
    expect(ctx.stageValueName!('cat', 'found')).toBe('Found')
    expect(ctx.stageValueName!('cat', 'zz')).toBeUndefined()
    expect(ctx.stageValueName!('zz', 'found')).toBeUndefined()
  })

  it('stageValueIndex gives the position of a value', () => {
    expect(stageValueIndex(db.stages[0], 'found')).toBe(1)
    expect(stageValueIndex(db.stages[0], 'zz')).toBe(-1)
    expect(stageValueIndex(undefined, 'found')).toBe(-1)
  })
})

describe('util', () => {
  it('cloneJson deep copies and drops undefined', () => {
    const src = { a: [1, { b: 2 }], c: undefined, d: null }
    const copy = cloneJson(src)
    expect(copy).toEqual({ a: [1, { b: 2 }], d: null })
    expect('c' in copy).toBe(false)
    expect(copy.a[1]).not.toBe(src.a[1])
  })
  it('deepEqual ignores key order and undefined properties', () => {
    expect(deepEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true)
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true)
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(deepEqual([1], [1, 2])).toBe(false)
    expect(deepEqual({}, [])).toBe(false)
    expect(deepEqual(NaN, NaN)).toBe(true)
    expect(deepEqual(null, {})).toBe(false)
  })
})
