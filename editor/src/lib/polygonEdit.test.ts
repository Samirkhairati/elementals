import { describe, it, expect } from 'vitest'
import {
  alignmentGuides,
  closesAt,
  dedupePoints,
  hitEdge,
  hitShape,
  hitVertex,
  insertPoint,
  lockAxis,
  polygonColliderBox,
  removePoint,
} from './polygonEdit'
import type { CollisionShape } from '../../../shared/collisionShapes'

const tri: CollisionShape = { id: 't', closed: true, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }] }
const line: CollisionShape = { id: 'l', closed: false, points: [{ x: 200, y: 0 }, { x: 200, y: 100 }] }

describe('polygonEdit', () => {
  it('Shift keeps the point on the nearer axis through the previous point', () => {
    expect(lockAxis({ x: 10, y: 10 }, { x: 50, y: 14 })).toEqual({ x: 50, y: 10 })
    expect(lockAxis({ x: 10, y: 10 }, { x: 12, y: 60 })).toEqual({ x: 10, y: 60 })
  })

  it('hits vertices, edges and the inside of closed shapes', () => {
    expect(hitVertex([tri, line], { x: 99, y: 2 }, 4)).toEqual({ shapeId: 't', index: 1 })
    expect(hitVertex([tri, line], { x: 50, y: 50 }, 4)).toBeNull()
    expect(hitEdge([tri, line], { x: 202, y: 50 }, 4)).toEqual({ shapeId: 'l', index: 0, t: 0.5 })
    // The closing edge of the triangle (point 2 back to point 0).
    expect(hitEdge([tri], { x: 1, y: 50 }, 4)).toMatchObject({ shapeId: 't', index: 2 })
    expect(hitShape([tri, line], { x: 20, y: 20 }, 4)).toBe('t')
    expect(hitShape([tri, line], { x: 150, y: 50 }, 4)).toBeNull()
  })

  it('inserts and removes points; too few points removes the shape', () => {
    expect(insertPoint(tri, 0, { x: 50, y: 0 }).points).toEqual([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }])
    expect(removePoint(tri, 1)).toBeNull()
    expect(removePoint(insertPoint(tri, 0, { x: 50, y: 0 }), 1)?.points).toHaveLength(3)
    expect(removePoint(line, 0)).toBeNull()
  })

  it('closing needs three points and a click near the first', () => {
    expect(closesAt(tri.points, { x: 2, y: 2 }, 4)).toBe(true)
    expect(closesAt(tri.points.slice(0, 2), { x: 0, y: 0 }, 4)).toBe(false)
    expect(dedupePoints([{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }])).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }])
  })

  it('guides show alignment with other collider points without moving the point', () => {
    const anchors = [{ x: 100, y: 0 }, { x: 40, y: 300 }]
    const guides = alignmentGuides(anchors, { x: 102, y: 299 }, 4)
    expect(guides).toEqual([
      { axis: 'x', value: 100, from: { x: 100, y: 0 }, exact: false },
      { axis: 'y', value: 300, from: { x: 40, y: 300 }, exact: false },
    ])
    expect(alignmentGuides(anchors, { x: 100, y: 50 }, 4)).toEqual([{ axis: 'x', value: 100, from: { x: 100, y: 0 }, exact: true }])
    expect(alignmentGuides(anchors, { x: 100, y: 0 }, 4)).toEqual([])
  })

  it('a polygon collider box is the bounding box, bottom-centred', () => {
    expect(polygonColliderBox([{ x: -16, y: 0 }, { x: 16, y: 0 }, { x: 0, y: -20 }])).toEqual({ width: 32, height: 20, offsetX: 0, offsetY: 0 })
    expect(polygonColliderBox([{ x: 0, y: -4 }, { x: 0, y: -4 }])).toEqual({ width: 1, height: 1, offsetX: 0, offsetY: -4 })
  })
})
