// Resizing an entity's area (its collider box) on the map by dragging a handle. The opposite edge(s) stay where they were;
// with the magnet on, the moving edge(s) land on grid lines and the box is at least one grid cell, otherwise at least 1 px.
// The entity's anchor never moves: the new box is written back as Collider width / height / offsetX / offsetY.

import { HANDLES, rectToColliderProps, type ColliderPatch, type Handle, type Point, type Rect } from './entityVisuals'
import { nearestLine, type GridSpec } from './grid'

export { HANDLES }
export type { Handle }

const movesWest = (h: Handle): boolean => h.includes('w')
const movesEast = (h: Handle): boolean => h.includes('e')
const movesNorth = (h: Handle): boolean => h.includes('n')
const movesSouth = (h: Handle): boolean => h.includes('s')

/** Where `handle` sits on `rect` (map space): corners and edge midpoints. */
export function handlePoint(rect: Rect, handle: Handle): Point {
  return {
    x: movesWest(handle) ? rect.x : movesEast(handle) ? rect.x + rect.w : rect.x + rect.w / 2,
    y: movesNorth(handle) ? rect.y : movesSouth(handle) ? rect.y + rect.h : rect.y + rect.h / 2,
  }
}

const floorLine = (v: number, size: number, offset: number): number => Math.floor((v - offset) / size) * size + offset
const ceilLine = (v: number, size: number, offset: number): number => Math.ceil((v - offset) / size) * size + offset

/** One axis: the moving low edge (left / top) dragged to `p`, the high edge fixed at `high`. */
function lowEdge(p: number, high: number, snap: boolean, size: number, offset: number): number {
  if (!snap) return Math.min(Math.round(p), high - 1)
  return Math.min(nearestLine(p, size, offset), floorLine(high - 1, size, offset))
}

/** One axis: the moving high edge (right / bottom) dragged to `p`, the low edge fixed at `low`. */
function highEdge(p: number, low: number, snap: boolean, size: number, offset: number): number {
  if (!snap) return Math.max(Math.round(p), low + 1)
  return Math.max(nearestLine(p, size, offset), ceilLine(low + 1, size, offset))
}

/** `start` (a box in map space) with `handle` dragged to the pointer. */
export function resizeArea(start: Rect, handle: Handle, pointer: Point, snap: boolean, grid: GridSpec): Rect {
  let left = start.x
  let right = start.x + start.w
  let top = start.y
  let bottom = start.y + start.h
  if (movesWest(handle)) left = lowEdge(pointer.x, right, snap, grid.sizeX, grid.offsetX)
  if (movesEast(handle)) right = highEdge(pointer.x, left, snap, grid.sizeX, grid.offsetX)
  if (movesNorth(handle)) top = lowEdge(pointer.y, bottom, snap, grid.sizeY, grid.offsetY)
  if (movesSouth(handle)) bottom = highEdge(pointer.y, top, snap, grid.sizeY, grid.offsetY)
  return { x: left, y: top, w: right - left, h: bottom - top }
}

/** The collider props that give the map-space box `rect` to an entity whose anchor is at `anchor`. */
export const areaToColliderProps = (rect: Rect, anchor: Point): ColliderPatch => rectToColliderProps(rect, anchor)
