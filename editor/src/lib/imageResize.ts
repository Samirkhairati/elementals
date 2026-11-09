// Resizing a picture on the canvas by dragging a corner handle. Pictures scale by one factor (the shape is kept, see
// lib/imageScale), so a corner drag picks the scale from whichever axis the pointer went further along, and the opposite
// corner stays where it was: the anchor moves to make that so.

import { MAX_SCALE, MIN_SCALE } from './imageScale'

export type Corner = 'nw' | 'ne' | 'sw' | 'se'
export const CORNERS: readonly Corner[] = ['nw', 'ne', 'sw', 'se']

interface Rect {
  x: number
  y: number
  w: number
  h: number
}
interface Point {
  x: number
  y: number
}

const isEast = (c: Corner) => c[1] === 'e'
const isSouth = (c: Corner) => c[0] === 's'
export const oppositeCorner = (c: Corner): Corner => `${isSouth(c) ? 'n' : 's'}${isEast(c) ? 'w' : 'e'}` as Corner

/** `bounds` (relative to the anchor, at scale 1) at `scale`. */
export const scaleBounds = (bounds: Rect, scale: number): Rect => ({ x: bounds.x * scale, y: bounds.y * scale, w: bounds.w * scale, h: bounds.h * scale })

/** Where `corner` of `bounds` (relative to `anchor`) is on the map. */
export function cornerAt(bounds: Rect, anchor: Point, corner: Corner): Point {
  return { x: anchor.x + bounds.x + (isEast(corner) ? bounds.w : 0), y: anchor.y + bounds.y + (isSouth(corner) ? bounds.h : 0) }
}

/**
 * `corner` of a picture dragged to `pointer`: the new scale (2 decimals, within MIN_SCALE..MAX_SCALE) and the anchor that keeps the
 * opposite corner in place (whole pixels). `unit` is the picture's (flipped) bounds at scale 1 relative to its anchor.
 */
export function resizeFromCorner(unit: Rect, anchor: Point, scale: number, corner: Corner, pointer: Point): { scale: number; x: number; y: number } {
  const opposite = oppositeCorner(corner)
  const fixed = cornerAt(scaleBounds(unit, scale), anchor, opposite)
  if (!(unit.w > 0) || !(unit.h > 0)) return { scale, x: anchor.x, y: anchor.y }
  const dx = (pointer.x - fixed.x) * (isEast(corner) ? 1 : -1)
  const dy = (pointer.y - fixed.y) * (isSouth(corner) ? 1 : -1)
  const raw = Math.max(dx / unit.w, dy / unit.h)
  const next = Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw)) * 100) / 100
  const from = cornerAt(scaleBounds(unit, next), { x: 0, y: 0 }, opposite)
  return { scale: next, x: Math.round(fixed.x - from.x), y: Math.round(fixed.y - from.y) }
}
