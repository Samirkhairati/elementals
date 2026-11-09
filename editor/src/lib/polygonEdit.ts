import type { CollisionShape, ShapePoint } from '../../../shared/collisionShapes'
import { pointInShape, shapeEdges } from '../../../shared/collisionShapes'

/**
 * Pure maths of drawing and editing collision shapes on the canvas: hit tests, the Shift axis lock and the alignment
 * guides (lines shown while a point lines up with another collider's points; nothing snaps). All in map pixels.
 */

/** Points are whole map pixels. */
export const roundPoint = (p: ShapePoint): ShapePoint => ({ x: Math.round(p.x), y: Math.round(p.y) })

/** With Shift: `p` kept on the horizontal or the vertical through `from`, whichever is nearer the pointer. */
export function lockAxis(from: ShapePoint, p: ShapePoint): ShapePoint {
  return Math.abs(p.x - from.x) >= Math.abs(p.y - from.y) ? { x: p.x, y: from.y } : { x: from.x, y: p.y }
}

/** Distance from p to segment a-b, and where along it (0..1) the nearest point is. */
export function distToSegment(p: ShapePoint, a: ShapePoint, b: ShapePoint): { d: number; t: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return { d: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)), t }
}

/** The vertex under `p` (within `tol`), topmost shape first. */
export function hitVertex(shapes: readonly CollisionShape[], p: ShapePoint, tol: number): { shapeId: string; index: number } | null {
  for (let s = shapes.length - 1; s >= 0; s--) {
    let index = -1
    let bestD = Infinity
    shapes[s].points.forEach((v, i) => {
      const d = Math.hypot(v.x - p.x, v.y - p.y)
      if (d <= tol && d < bestD) {
        bestD = d
        index = i
      }
    })
    if (index >= 0) return { shapeId: shapes[s].id, index }
  }
  return null
}

/** The edge under `p` (within `tol`): the shape, the edge's first point index and where along it. */
export function hitEdge(shapes: readonly CollisionShape[], p: ShapePoint, tol: number): { shapeId: string; index: number; t: number } | null {
  for (let s = shapes.length - 1; s >= 0; s--) {
    let hit: { index: number; t: number } | null = null
    let bestD = Infinity
    shapeEdges(shapes[s]).forEach(([a, b], index) => {
      const { d, t } = distToSegment(p, a, b)
      if (d <= tol && d < bestD) {
        bestD = d
        hit = { index, t }
      }
    })
    if (hit) return { shapeId: shapes[s].id, ...(hit as { index: number; t: number }) }
  }
  return null
}

/** The shape under `p`: near one of its edges, or inside it when closed. Topmost first. */
export function hitShape(shapes: readonly CollisionShape[], p: ShapePoint, tol: number): string | null {
  const edge = hitEdge(shapes, p, tol)
  if (edge) return edge.shapeId
  for (let s = shapes.length - 1; s >= 0; s--) if (pointInShape(shapes[s], p.x, p.y)) return shapes[s].id
  return null
}

/** `shape` with a new point on edge `index` (between point index and the next one). */
export function insertPoint(shape: CollisionShape, index: number, p: ShapePoint): CollisionShape {
  const points = [...shape.points]
  points.splice(index + 1, 0, p)
  return { ...shape, points }
}

/** `shape` without point `index`, or null when too few points would be left (the shape goes). */
export function removePoint(shape: CollisionShape, index: number): CollisionShape | null {
  const points = shape.points.filter((_, i) => i !== index)
  return points.length >= (shape.closed ? 3 : 2) ? { ...shape, points } : null
}

/** Drops points that repeat the one before (a double-click adds the same point twice). */
export function dedupePoints(points: readonly ShapePoint[]): ShapePoint[] {
  return points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y)
}

/** Can a shape being drawn be closed by clicking near its first point? */
export function closesAt(points: readonly ShapePoint[], p: ShapePoint, tol: number): boolean {
  return points.length >= 3 && Math.hypot(points[0].x - p.x, points[0].y - p.y) <= tol
}

export interface Guide {
  /** `x`: a vertical line at `value`; `y`: a horizontal one. */
  axis: 'x' | 'y'
  value: number
  /** The collider point it lines up with. */
  from: ShapePoint
  /** Exactly the same pixel (otherwise only within the tolerance). */
  exact: boolean
}

/**
 * Guides for a point at `p`: the nearest collider point whose x (a vertical guide) or y (a horizontal guide) is
 * within `tol` of p's. Exact matches win over near ones. Nothing moves: the guide only shows the alignment.
 */
export function alignmentGuides(anchors: readonly ShapePoint[], p: ShapePoint, tol: number): Guide[] {
  const pick = (axis: 'x' | 'y'): Guide | null => {
    let best: { a: ShapePoint; d: number; far: number } | null = null
    for (const a of anchors) {
      const d = Math.abs(a[axis] - p[axis])
      if (d > tol) continue
      const other = axis === 'x' ? 'y' : 'x'
      const far = Math.abs(a[other] - p[other])
      // Skip the point itself (both coordinates the same).
      if (d === 0 && far === 0) continue
      if (!best || d < best.d || (d === best.d && far < best.far)) best = { a, d, far }
    }
    return best ? { axis, value: best.a[axis], from: best.a, exact: Math.round(best.a[axis]) === Math.round(p[axis]) } : null
  }
  return [pick('x'), pick('y')].filter((g): g is Guide => g !== null)
}

/** Box corners of a collider rect (left, top, w, h) for the guides. */
export const rectCorners = (r: { x: number; y: number; w: number; h: number }): ShapePoint[] => [
  { x: r.x, y: r.y },
  { x: r.x + r.w, y: r.y },
  { x: r.x + r.w, y: r.y + r.h },
  { x: r.x, y: r.y + r.h },
]

/** A polygon collider's box fields: its bounding box (bottom-centred on the anchor, then shifted), whole pixels, at least 1. */
export function polygonColliderBox(points: readonly ShapePoint[]): { width: number; height: number; offsetX: number; offsetY: number } {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const left = Math.min(...xs)
  const right = Math.max(...xs)
  const top = Math.min(...ys)
  const bottom = Math.max(...ys)
  return { width: Math.max(1, Math.round(right - left)), height: Math.max(1, Math.round(bottom - top)), offsetX: Math.round((left + right) / 2), offsetY: Math.round(bottom) }
}

export const newShapeId = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`)
