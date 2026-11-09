import { describe, it, expect } from 'vitest'
import {
  cleanPoints,
  pointInPolygon,
  pointInShape,
  pointsBounds,
  segmentHitsRect,
  segmentsIntersect,
  shapeBlocksMove,
  shapeCrossesPath,
  shapeEdges,
  shapeOverlapsRect,
} from '../../../shared/collisionShapes'
import { validateEditorMap, validateTiledMap } from '../../../shared/mapSchema'
import { convertEditorMapToTiled } from '../../../shared/mapExport'
import { normalizeProps } from '../../../shared/engine/components'
import type { EditorMap } from '../../../shared/mapTypes'

const square = { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], closed: true }
// A vertical wall line at x = 50 from y = 0 to y = 100.
const wall = { points: [{ x: 50, y: 0 }, { x: 50, y: 100 }], closed: false }

describe('collision shape geometry', () => {
  it('edges close the polygon only when closed', () => {
    expect(shapeEdges(square)).toHaveLength(4)
    expect(shapeEdges({ ...square, closed: false })).toHaveLength(3)
    expect(shapeEdges(wall)).toHaveLength(1)
  })

  it('point in polygon', () => {
    expect(pointInPolygon(50, 50, square.points)).toBe(true)
    expect(pointInPolygon(150, 50, square.points)).toBe(false)
    expect(pointInShape(square, 50, 50)).toBe(true)
    expect(pointInShape({ ...square, closed: false }, 50, 50)).toBe(false)
  })

  it('segments that cross, touch at an end, or miss', () => {
    expect(segmentsIntersect(0, 0, 10, 10, 0, 10, 10, 0)).toBe(true)
    expect(segmentsIntersect(0, 0, 10, 0, 10, 0, 10, 10)).toBe(true)
    expect(segmentsIntersect(0, 0, 10, 0, 0, 1, 10, 1)).toBe(false)
  })

  it('a segment hits the inside of a rectangle, not just its border', () => {
    const r = { left: 0, top: 0, right: 10, bottom: 10 }
    expect(segmentHitsRect(-5, 5, 15, 5, r)).toBe(true)
    expect(segmentHitsRect(5, 5, 6, 6, r)).toBe(true)
    expect(segmentHitsRect(-5, 0, 15, 0, r)).toBe(false) // along the top edge
    expect(segmentHitsRect(-5, 5, -1, 5, r)).toBe(false)
    expect(segmentHitsRect(-5, 5, 5, -5, r)).toBe(false) // grazes the corner
  })

  it('a closed shape overlaps a rectangle inside it; an open one does not', () => {
    const r = { left: 40, top: 40, right: 60, bottom: 60 }
    expect(shapeOverlapsRect(square, r)).toBe(true)
    expect(shapeOverlapsRect({ ...square, closed: false }, { left: 40, top: 40, right: 45, bottom: 45 })).toBe(false)
  })

  it('a path crosses a shape edge', () => {
    expect(shapeCrossesPath(wall, 40, 50, 60, 50)).toBe(true)
    expect(shapeCrossesPath(wall, 40, 50, 45, 50)).toBe(false)
  })

  it('a wall line stops a mover walking into it, not one walking along it, and lets one standing on it step off', () => {
    // Feet 16 wide (halfW 8), 4 tall.
    expect(shapeBlocksMove(wall, 30, 50, 44, 50, 8, 4)).toBe(true) // feet would overlap the line
    expect(shapeBlocksMove(wall, 30, 50, 70, 50, 8, 4)).toBe(true) // jumps over it in one step
    expect(shapeBlocksMove(wall, 30, 50, 30, 80, 8, 4)).toBe(false) // parallel
    expect(shapeBlocksMove(wall, 50, 50, 70, 50, 8, 4)).toBe(false) // starts on it
    expect(shapeBlocksMove(wall, 30, 150, 70, 150, 8, 4)).toBe(false) // below its end
  })

  it('a closed shape stops a mover entering it', () => {
    expect(shapeBlocksMove(square, -20, 50, -5, 50, 8, 4)).toBe(true)
    expect(shapeBlocksMove(square, -40, 50, -20, 50, 8, 4)).toBe(false)
  })

  it('bounds and cleaning', () => {
    expect(pointsBounds(square.points)).toEqual({ left: 0, top: 0, right: 100, bottom: 100 })
    expect(cleanPoints([{ x: 1, y: 2 }, { x: Number.NaN, y: 1 }, 'x', null, { x: 3 }])).toEqual([{ x: 1, y: 2 }])
  })
})

const map = (layers: EditorMap['layers']): EditorMap => ({ name: 'm', width: 4, height: 4, layers })
const polygons: EditorMap['layers'][number] = {
  id: 'p1',
  name: 'Walls',
  type: 'polygons',
  visible: false,
  shapes: [
    { id: 'a', points: [{ x: 10, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 60 }], closed: true },
    { id: 'b', points: [{ x: 0, y: 0 }, { x: 64, y: 0 }], closed: false },
    { id: 'c', points: [{ x: 0, y: 0 }], closed: false },
  ],
}

describe('polygon collision layers: export and validation', () => {
  it('export as an objectgroup of kind collision, polygon / polyline relative to the first point; too-short shapes are dropped', () => {
    const tiled = convertEditorMapToTiled(map([polygons]), [])
    const layer = tiled.layers[0]
    expect(layer.type).toBe('objectgroup')
    expect(layer.properties).toEqual([{ name: 'kind', type: 'string', value: 'collision' }])
    expect(layer.objects).toHaveLength(2)
    expect(layer.objects![0]).toMatchObject({ x: 10, y: 20, polygon: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }] })
    expect(layer.objects![0].polyline).toBeUndefined()
    expect(layer.objects![1]).toMatchObject({ x: 0, y: 0, polyline: [{ x: 0, y: 0 }, { x: 64, y: 0 }] })
    expect(new Set(layer.objects!.map((o) => o.id)).size).toBe(2)
    expect(validateTiledMap(tiled).errors).toEqual([])
  })

  it('validates the shapes', () => {
    const ok = validateEditorMap(map([polygons]))
    expect(ok.errors).toEqual([])
    expect(ok.warnings.join('\n')).toMatch(/shape 2: too few points/)
    const bad = validateEditorMap(map([{ ...polygons, shapes: [{ id: 'a', points: [{ x: Number.NaN, y: 0 }], closed: 'yes' }, { id: 'a', points: 3 }] as never }]))
    expect(bad.errors.join('\n')).toMatch(/closed must be a boolean/)
    expect(bad.errors.join('\n')).toMatch(/x and y must be finite/)
    expect(bad.errors.join('\n')).toMatch(/duplicate id/)
    expect(bad.errors.join('\n')).toMatch(/points must be an array/)
  })
})

describe('Collider polygon props', () => {
  it('keeps a polygon with enough points, rounds them, and drops everything else', () => {
    const pts = [{ x: -16, y: 0 }, { x: 16.004, y: 0 }, { x: 0, y: -20 }]
    expect(normalizeProps('Collider', { shape: 'polygon', points: pts })).toMatchObject({ shape: 'polygon', closed: true, points: [{ x: -16, y: 0 }, { x: 16, y: 0 }, { x: 0, y: -20 }] })
    expect(normalizeProps('Collider', { shape: 'polygon', points: pts.slice(0, 2), closed: false })).toMatchObject({ shape: 'polygon', closed: false })
    expect(normalizeProps('Collider', { shape: 'polygon', points: pts.slice(0, 2) })).not.toHaveProperty('shape')
    expect(normalizeProps('Collider', { width: 32 })).not.toHaveProperty('points')
  })
})
