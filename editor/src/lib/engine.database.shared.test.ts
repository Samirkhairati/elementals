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
} from '../../../shared/engine/index'

describe('database', () => {
  const db = {
    version: 1,
    switches: [{ id: 's1', name: 'Door open' }, { id: 's2', name: 'Met mom' }],
    variables: [{ id: 'v1', name: 'Steps', initial: 5 }],
  }

  it('validates a good database and reports problems', () => {
    expect(validateDatabase(db)).toEqual({ ok: true, errors: [], warnings: [] })
    const bad = validateDatabase({ version: 2, switches: [{ id: 'a', name: '' }, { id: 'a', name: 'x' }, 3, { name: 'x' }], variables: [{ id: 'v', name: 'v', initial: 'x' }] })
    expect(bad.ok).toBe(false)
    expect(bad.errors.join('\n')).toMatch(/version[\s\S]*duplicate id "a"[\s\S]*not an object[\s\S]*id must be[\s\S]*initial must be a number/)
    expect(bad.warnings.join()).toMatch(/name is empty/)
    expect(validateDatabase(null).ok).toBe(false)
    expect(validateDatabase({ version: 1 }).errors).toHaveLength(2)
  })

  it('normalizeDatabase repairs and never throws', () => {
    expect(normalizeDatabase(db)).toEqual(db)
    expect(normalizeDatabase(null)).toEqual(createEmptyDatabase())
    expect(
      normalizeDatabase({ switches: [{ id: 'a' }, { id: 'a', name: 'dup' }, { id: '' }, null], variables: [{ id: 'v', initial: NaN }] }),
    ).toEqual({ version: 1, switches: [{ id: 'a', name: 'a' }], variables: [{ id: 'v', name: 'v', initial: 0 }] })
    const manifest = buildDatabaseManifest(db)
    expect(manifest).toEqual(db)
    expect(manifest).not.toBe(db)
  })

  it('provides validation and summary contexts', () => {
    expect(databaseValidationContext(db as any)).toEqual({ switchIds: ['s1', 's2'], variableIds: ['v1'] })
    const ctx = databaseSummaryContext(db as any)
    expect(ctx.switchName!('s2')).toBe('Met mom')
    expect(ctx.variableName!('v1')).toBe('Steps')
    expect(ctx.switchName!('zz')).toBeUndefined()
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
