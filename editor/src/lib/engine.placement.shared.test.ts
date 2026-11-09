/* eslint-disable @typescript-eslint/no-explicit-any -- loose entity fixtures */
import { describe, expect, it } from 'vitest'
import {
  createDefaultComponent,
  isFreeEntity,
  isTileAlignedBox,
  isTileAnchor,
  migrateEntity,
  normalizeProps,
  setEntityFree,
  snapAnchorToTile,
  snapColliderToTiles,
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

describe('which kind an entity is', () => {
  it('is tile-based unless Transform.free is true, so everything written before the flag stays tile-based', () => {
    expect(isFreeEntity(entity())).toBe(false)
    expect(isFreeEntity(entity({}, { free: false }))).toBe(false)
    expect(isFreeEntity(entity({}, { free: 'yes' }))).toBe(false)
    expect(isFreeEntity(entity({}, { free: true }))).toBe(true)
    expect(isFreeEntity({})).toBe(false)
    expect(isFreeEntity({ components: null })).toBe(false)
  })

  it('the schema default is tile-based and old Transforms normalise to it', () => {
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

  it('a collider snaps to whole tiles, placed so the edges lie on tile lines', () => {
    expect(snapColliderToTiles({ width: 32, height: 32, offsetX: 0, offsetY: 0 })).toEqual({ width: 32, height: 32, offsetX: 0, offsetY: 0 })
    expect(snapColliderToTiles({ width: 16, height: 8, offsetX: 3, offsetY: 5 })).toEqual({ width: 32, height: 32, offsetX: 0, offsetY: 0 })
    // two tiles wide, centred on the anchor, would end half a tile off the grid: offset X 16 puts it right
    expect(snapColliderToTiles({ width: 64, height: 32, offsetX: 0, offsetY: 0 })).toEqual({ width: 64, height: 32, offsetX: 16, offsetY: 0 })
    expect(snapColliderToTiles({ width: 96, height: 64, offsetX: 5, offsetY: -30 })).toEqual({ width: 96, height: 64, offsetX: 0, offsetY: -32 })
  })

  it('a snapped box really has its edges on tile lines for a tile anchor', () => {
    for (const box of [{ width: 50, height: 10, offsetX: 7, offsetY: 3 }, { width: 100, height: 70, offsetX: -20, offsetY: 40 }, { width: 5, height: 200, offsetX: 1, offsetY: 1 }]) {
      const s = snapColliderToTiles(box)
      const left = 48 + s.offsetX - s.width / 2
      const right = left + s.width
      const top = 64 + s.offsetY - s.height
      const bottom = 64 + s.offsetY
      for (const edge of [left, right, top, bottom]) expect(Math.abs(edge % 32)).toBe(0)
      expect(isTileAlignedBox(s)).toBe(true)
    }
    expect(isTileAlignedBox({ width: 40, height: 32, offsetX: 0, offsetY: 0 })).toBe(false)
  })
})

describe('setEntityFree', () => {
  it('making an entity free only sets the flag: nothing moves or resizes', () => {
    const e = entity({ x: 50, y: 61 }, { x: 50, y: 61 }, { width: 10, height: 20, offsetX: 1, offsetY: 2, isSolid: true })
    const free = setEntityFree(e, true)
    expect(free.components.Transform).toEqual({ x: 50, y: 61, depth: 10, free: true })
    expect(free.components.Collider).toEqual(e.components.Collider)
    expect([free.x, free.y]).toEqual([50, 61])
    expect(e.components.Transform.free).toBeUndefined() // input untouched
  })

  it('making it tile-based moves it onto its tile and rounds the collider to whole tiles', () => {
    const e = entity({ x: 50, y: 61 }, { x: 50, y: 61, free: true }, { width: 10, height: 20, offsetX: 1, offsetY: 2, isSolid: false })
    const tile = setEntityFree(e, false)
    expect([tile.x, tile.y]).toEqual([48, 64])
    expect(tile.components.Transform).toEqual({ x: 48, y: 64, depth: 10, free: false })
    expect(tile.components.Collider).toEqual({ width: 32, height: 32, offsetX: 0, offsetY: 0, isSolid: false })
  })

  it('is the same object when there is nothing to change, and snaps a misaligned tile entity', () => {
    const aligned = entity({}, { free: false }, { width: 32, height: 32, offsetX: 0, offsetY: 0, isSolid: true })
    expect(setEntityFree(aligned, false)).toBe(aligned)
    const free = entity({}, { free: true })
    expect(setEntityFree(free, true)).toBe(free)
    const off = entity({ x: 50, y: 60 }, { x: 50, y: 60 })
    expect([setEntityFree(off, false).x, setEntityFree(off, false).y]).toEqual([48, 64])
  })

  it('works for an entity without a collider or a Transform', () => {
    const noTransform: any = { id: 'x', name: 'X', x: 20, y: 40, components: {} }
    const r = setEntityFree(noTransform, false)
    expect(r.components.Transform).toMatchObject({ x: 16, y: 32, free: false })
    expect(r.components.Collider).toBeUndefined()
  })
})

describe('validation', () => {
  const codes = (e: any) => validateEntity(e).map((i) => `${i.severity}:${i.code}`)

  it('warns about a tile-based entity that is off the grid, never about a free one', () => {
    expect(codes(entity({ x: 50, y: 61 }, { x: 50, y: 61 }))).toEqual(['warning:off-grid'])
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
