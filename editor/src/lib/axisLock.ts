// Holding Shift while placing or dragging a picture locks it to one axis. The lock remembers where Shift went down, picks
// the axis from the first real movement (the larger of the two distances), and keeps the other coordinate where it was.

export type Axis = 'x' | 'y'

export interface AxisLock {
  originX: number
  originY: number
  /** Null until the pointer has moved far enough from the origin to tell which way it is going. */
  axis: Axis | null
}

/** World pixels the pointer must travel before the axis is chosen (a click that wobbles does not lock anything). */
export const AXIS_LOCK_THRESHOLD = 6

/**
 * One pointer move. `lock` is the state from the previous move (null while Shift is up); returns the position to use and
 * the state to pass next time. Without Shift the position is untouched and the lock is dropped.
 */
export function applyAxisLock(lock: AxisLock | null, shift: boolean, x: number, y: number): { x: number; y: number; lock: AxisLock | null } {
  if (!shift) return { x, y, lock: null }
  const state = lock ?? { originX: x, originY: y, axis: null }
  let axis = state.axis
  if (!axis) {
    const dx = Math.abs(x - state.originX)
    const dy = Math.abs(y - state.originY)
    if (Math.max(dx, dy) >= AXIS_LOCK_THRESHOLD) axis = dx >= dy ? 'x' : 'y'
  }
  const next = axis === state.axis ? state : { ...state, axis }
  if (!axis) return { x: next.originX, y: next.originY, lock: next }
  return axis === 'x' ? { x, y: next.originY, lock: next } : { x: next.originX, y, lock: next }
}

/** The two parallel guide lines of a locked picture: along its top and bottom edges when it moves sideways, along its left and right edges when it moves up and down. */
export function guideLines(axis: Axis, bounds: { x: number; y: number; w: number; h: number }, anchor: { x: number; y: number }, extent: number): { x1: number; y1: number; x2: number; y2: number }[] {
  if (axis === 'x') {
    const top = anchor.y + bounds.y
    const bottom = top + bounds.h
    return [top, bottom].map((y) => ({ x1: -extent, y1: y, x2: extent, y2: y }))
  }
  const left = anchor.x + bounds.x
  const right = left + bounds.w
  return [left, right].map((x) => ({ x1: x, y1: -extent, x2: x, y2: extent }))
}
