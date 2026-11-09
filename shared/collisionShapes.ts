// Polygon collision: closed polygons (a solid area) and open polylines (a wall line), in pixels.
// Pure geometry shared by the editor (drawing, guides) and the game (movement blocking).

export interface ShapePoint {
  x: number
  y: number
}

/** One collision shape of a `polygons` layer, in map pixels. */
export interface CollisionShape {
  id: string
  points: ShapePoint[]
  /** Closed: the last point joins the first and the inside is solid. Open: a line that cannot be crossed. */
  closed: boolean
}

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/** Fewest points a usable shape has: 3 for a closed polygon, 2 for an open line. */
export const minPoints = (closed: boolean): number => (closed ? 3 : 2)

export const isUsableShape = (s: { points: readonly ShapePoint[]; closed: boolean }): boolean => s.points.length >= minPoints(s.closed)

/** The shape's edges as segments [a, b] (the closing edge too when closed). */
export function shapeEdges(s: { points: readonly ShapePoint[]; closed: boolean }): [ShapePoint, ShapePoint][] {
  const out: [ShapePoint, ShapePoint][] = []
  const p = s.points
  for (let i = 0; i + 1 < p.length; i++) out.push([p[i], p[i + 1]])
  if (s.closed && p.length >= 3) out.push([p[p.length - 1], p[0]])
  return out
}

/** Even-odd test; points exactly on an edge may land either way. */
export function pointInPolygon(x: number, y: number, points: readonly ShapePoint[]): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]
    const b = points[j]
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

const cross = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)

const onSegment = (ax: number, ay: number, bx: number, by: number, px: number, py: number) =>
  Math.min(ax, bx) <= px && px <= Math.max(ax, bx) && Math.min(ay, by) <= py && py <= Math.max(ay, by)

/** Do segments p1-p2 and p3-p4 touch or cross? */
export function segmentsIntersect(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): boolean {
  const d1 = cross(x3, y3, x4, y4, x1, y1)
  const d2 = cross(x3, y3, x4, y4, x2, y2)
  const d3 = cross(x1, y1, x2, y2, x3, y3)
  const d4 = cross(x1, y1, x2, y2, x4, y4)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  if (d1 === 0 && onSegment(x3, y3, x4, y4, x1, y1)) return true
  if (d2 === 0 && onSegment(x3, y3, x4, y4, x2, y2)) return true
  if (d3 === 0 && onSegment(x1, y1, x2, y2, x3, y3)) return true
  if (d4 === 0 && onSegment(x1, y1, x2, y2, x4, y4)) return true
  return false
}

const inRect = (r: Rect, x: number, y: number) => x > r.left && x < r.right && y > r.top && y < r.bottom

/** Does segment a-b pass through the inside of `r` (touching its border only does not count)? */
export function segmentHitsRect(ax: number, ay: number, bx: number, by: number, r: Rect): boolean {
  if (inRect(r, ax, ay) || inRect(r, bx, by)) return true
  // Liang-Barsky clip against the open rectangle.
  const dx = bx - ax
  const dy = by - ay
  let t0 = 0
  let t1 = 1
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q > 0
    const t = q / p
    if (p < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
    return true
  }
  if (!clip(-dx, ax - r.left) || !clip(dx, r.right - ax) || !clip(-dy, ay - r.top) || !clip(dy, r.bottom - ay)) return false
  if (t0 >= t1) return false
  // The clipped piece must have some length inside, not just graze a corner or run along an edge.
  const mx = ax + dx * ((t0 + t1) / 2)
  const my = ay + dy * ((t0 + t1) / 2)
  return inRect(r, mx, my)
}

/** Does `shape` overlap the inside of `r`: an edge passes through it, or (closed) the rectangle sits inside it? */
export function shapeOverlapsRect(shape: { points: readonly ShapePoint[]; closed: boolean }, r: Rect): boolean {
  if (!isUsableShape(shape)) return false
  for (const [a, b] of shapeEdges(shape)) if (segmentHitsRect(a.x, a.y, b.x, b.y, r)) return true
  return shape.closed && pointInPolygon((r.left + r.right) / 2, (r.top + r.bottom) / 2, shape.points)
}

/** Does the path a-b cross one of the shape's edges? */
export function shapeCrossesPath(shape: { points: readonly ShapePoint[]; closed: boolean }, ax: number, ay: number, bx: number, by: number): boolean {
  if (!isUsableShape(shape) || (ax === bx && ay === by)) return false
  for (const [p, q] of shapeEdges(shape)) if (segmentsIntersect(ax, ay, bx, by, p.x, p.y, q.x, q.y)) return true
  return false
}

/** Is the point inside a closed shape (open lines have no inside)? */
export const pointInShape = (shape: { points: readonly ShapePoint[]; closed: boolean }, x: number, y: number): boolean =>
  shape.closed && isUsableShape(shape) && pointInPolygon(x, y, shape.points)

/** A mover's feet: `halfW` either side of the anchor, `feetH` tall, standing on the anchor's y. */
export const feetRect = (x: number, y: number, halfW: number, feetH: number): Rect => ({ left: x - halfW, top: y - feetH, right: x + halfW, bottom: y })

/**
 * Does `shape` stop a mover whose feet box goes from (fromX, fromY) to (toX, toY)? Blocked when the feet would
 * overlap the shape at the target, or the feet's middle would cross one of its edges on the way. A shape the feet
 * already overlap at the start never blocks, so a mover placed on a line can always step off it.
 */
export function shapeBlocksMove(
  shape: { points: readonly ShapePoint[]; closed: boolean },
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  halfW: number,
  feetH: number
): boolean {
  if (!isUsableShape(shape)) return false
  if (shapeOverlapsRect(shape, feetRect(fromX, fromY, halfW, feetH))) return false
  if (shapeOverlapsRect(shape, feetRect(toX, toY, halfW, feetH))) return true
  const mid = feetH / 2
  return shapeCrossesPath(shape, fromX, fromY - mid, toX, toY - mid)
}

/** The bounding box of some points ({0,0,0,0} for none). */
export function pointsBounds(points: readonly ShapePoint[]): Rect {
  if (points.length === 0) return { left: 0, top: 0, right: 0, bottom: 0 }
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const p of points) {
    left = Math.min(left, p.x)
    top = Math.min(top, p.y)
    right = Math.max(right, p.x)
    bottom = Math.max(bottom, p.y)
  }
  return { left, top, right, bottom }
}

/** Points moved by (dx, dy). */
export const translatePoints = (points: readonly ShapePoint[], dx: number, dy: number): ShapePoint[] => points.map((p) => ({ x: p.x + dx, y: p.y + dy }))

/** Clean points from untrusted input: finite numbers only, others dropped. */
export function cleanPoints(raw: unknown): ShapePoint[] {
  if (!Array.isArray(raw)) return []
  const out: ShapePoint[] = []
  for (const p of raw) {
    if (p && typeof p === 'object') {
      const { x, y } = p as Record<string, unknown>
      if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y })
    }
  }
  return out
}
