/* eslint-disable @typescript-eslint/no-explicit-any -- loose entity fixtures */
import { describe, expect, it } from 'vitest'
import {
  createDefaultComponent,
  isOffGrid,
  isTileAnchor,
  migrateEntity,
  normalizeProps,
  snapAnchorToTile,
  withDerivedFree,
  validateEntity,
} from '../../../shared/engine/index'
import { convertEditorMapToTiled } from '../../../shared/mapExport'
import { validateEditorMap } from '../../../shared/mapSchema'

const entity = (over: Record<string, any> = {}, transform: Record<string, any> = {}, collider?: Record<string, any>): any => ({
  id: 'e',
  name: 'E',
  x: 48,
  y: 64,
  components: { Transform: { x: 48, y: 64, depth: 10, ...transform }, ...(collider ? { Collider: collider } : {}) },
  ...over,
})

describe('Transform.free', () => {
  it('the schema default is false and old Transforms normalise to it', () => {
    expect(createDefaultComponent('Transform').free).toBe(false)
    expect(normalizeProps('Transform', { x: 48, y: 64, depth: 10 })).toEqual({ x: 48, y: 64, depth: 10, free: false })
    expect(normalizeProps('Transform', { free: true }).free).toBe(true)
    expect(normalizeProps('Transform', { free: 'nope' }).free).toBe(false)
  })

  it('migration leaves an entity alone (the flag is not added to existing data)', () => {
    const e = entity()
    const r = migrateEntity(e)
    expect(r.changed).toBe(false)
    expect(r.value).toBe(e)
    expect(JSON.stringify(r.value)).not.toContain('free')
    const free = entity({}, { free: true })
    expect((migrateEntity(free).value.components.Transform as { free?: boolean }).free).toBe(true)
  })
})

describe('tile snapping', () => {
  it('anchors sit at the bottom-centre of a tile', () => {
    expect(snapAnchorToTile(0, 0)).toEqual({ x: 16, y: 0 })
    expect(snapAnchorToTile(40, 70)).toEqual({ x: 48, y: 64 })
    expect(snapAnchorToTile(47, 81)).toEqual({ x: 48, y: 96 })
    expect(isTileAnchor(48, 64)).toBe(true)
    expect(isTileAnchor(50, 64)).toBe(false)
    expect(isTileAnchor(48, 70)).toBe(false)
  })

  it('off the grid is any anchor that is not a tile anchor', () => {
    expect(isOffGrid(48, 64)).toBe(false)
    expect(isOffGrid(50, 61)).toBe(true)
    expect(isOffGrid(48, 70)).toBe(true)
  })
})

describe('withDerivedFree', () => {
  it('sets the flag from the position and never mutates', () => {
    const e = entity({ x: 50, y: 61 }, { x: 50, y: 61 }, { width: 10, height: 20, offsetX: 1, offsetY: 2, isSolid: true })
    const off = withDerivedFree(e)
    expect(off.components.Transform).toEqual({ x: 50, y: 61, depth: 10, free: true })
    expect(off.components.Collider).toBe(e.components.Collider)
    expect(e.components.Transform.free).toBeUndefined()
    const back = withDerivedFree({ ...off, x: 48, y: 64 })
    expect(back.components.Transform).toMatchObject({ free: false })
  })

  it('is the same object when nothing changes (a missing flag counts as false)', () => {
    const plain = entity()
    expect(withDerivedFree(plain)).toBe(plain)
    const flagged = entity({}, { free: false })
    expect(withDerivedFree(flagged)).toBe(flagged)
    const off = entity({ x: 50, y: 61 }, { x: 50, y: 61, free: true })
    expect(withDerivedFree(off)).toBe(off)
    const noTransform: any = { id: 'x', name: 'X', x: 20, y: 40, components: {} }
    expect(withDerivedFree(noTransform)).toBe(noTransform)
  })
})

describe('validation', () => {
  const codes = (e: any) => validateEntity(e).map((i) => `${i.severity}:${i.code}`)

  it('an entity off the tile grid is fine, with or without the flag', () => {
    expect(codes(entity({ x: 50, y: 61 }, { x: 50, y: 61 }))).toEqual([])
    expect(codes(entity({ x: 50, y: 61 }, { x: 50, y: 61, free: true }))).toEqual([])
    expect(codes(entity())).toEqual([])
  })

  it('accepts the free flag as a boolean and rejects other values', () => {
    expect(codes(entity({}, { free: 'yes' }))).toContain('error:bad-prop')
  })
})

describe('export and the map schema', () => {
  const map = (e: any): any => ({ name: 'm', width: 2, height: 2, layers: [], entities: [e], schemaVersion: 5 })

  it('a free entity survives the export untouched', () => {
    const free = entity({ x: 50, y: 61 }, { x: 50, y: 61, free: true }, { width: 10, height: 20, offsetX: 1, offsetY: 2, isSolid: true })
    const out = convertEditorMapToTiled(map(free), [])
    expect(out.entities[0]).toEqual(free)
  })

  it('a tile-based entity from before the flag exports without it', () => {
    const out = convertEditorMapToTiled(map(entity()), [])
    expect(JSON.stringify(out.entities)).not.toContain('free')
  })

  it('the editor map schema accepts a free entity', () => {
    const free = entity({ x: 50, y: 61 }, { x: 50, y: 61, free: true })
    const result = validateEditorMap(map(free))
    expect(result.ok).toBe(true)
    expect(result.warnings).toEqual([])
  })
})
