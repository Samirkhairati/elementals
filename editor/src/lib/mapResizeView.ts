import { MAX_MAP_SIZE, type ResizeEdges } from './mapResize'

/**
 * Geometry of the resize preview. World units are tiles of the OLD map (its top-left tile is 0,0); the new map is
 * the rectangle from (-left, -top) to (width + right, height + bottom).
 */

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface ResizeView {
  /** Pixels per tile. */
  scale: number
  /** Screen position of world (0, 0). */
  originX: number
  originY: number
}

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export function newRect(map: { width: number; height: number }, e: ResizeEdges): Rect {
  return { x0: 0 - e.left, y0: 0 - e.top, x1: map.width + e.right, y1: map.height + e.bottom }
}

/** Fits the old and the new map (plus some breathing room so edges can be pulled out) into the stage. */
export function fitView(
  map: { width: number; height: number },
  e: ResizeEdges,
  stageW: number,
  stageH: number
): ResizeView {
  const r = newRect(map, e)
  const pad = Math.max(3, Math.round(Math.max(map.width, map.height) * 0.2))
  const x0 = Math.min(0, r.x0) - pad
  const y0 = Math.min(0, r.y0) - pad
  const x1 = Math.max(map.width, r.x1) + pad
  const y1 = Math.max(map.height, r.y1) + pad
  const scale = Math.max(0.5, Math.min(stageW / (x1 - x0), stageH / (y1 - y0)))
  return {
    scale,
    originX: (stageW - (x1 - x0) * scale) / 2 - x0 * scale,
    originY: (stageH - (y1 - y0) * scale) / 2 - y0 * scale,
  }
}

export const toScreenX = (v: ResizeView, x: number) => v.originX + x * v.scale
export const toScreenY = (v: ResizeView, y: number) => v.originY + y * v.scale
export const toWorldX = (v: ResizeView, px: number) => (px - v.originX) / v.scale
export const toWorldY = (v: ResizeView, py: number) => (py - v.originY) / v.scale

/**
 * The edges after dragging `handle` to the world position (wx, wy). Positions snap to whole tiles and the
 * rectangle keeps between 1 and MAX_MAP_SIZE tiles on each axis.
 */
export function edgesFromDrag(
  handle: Handle,
  wx: number,
  wy: number,
  map: { width: number; height: number },
  edges: ResizeEdges
): ResizeEdges {
  const r = newRect(map, edges)
  const clampX = (v: number, fixed: number, movingIsMin: boolean) =>
    movingIsMin
      ? Math.max(fixed - MAX_MAP_SIZE, Math.min(fixed - 1, v))
      : Math.min(fixed + MAX_MAP_SIZE, Math.max(fixed + 1, v))
  const tx = Math.round(wx)
  const ty = Math.round(wy)
  if (handle.includes('w')) r.x0 = clampX(tx, r.x1, true)
  if (handle.includes('e')) r.x1 = clampX(tx, r.x0, false)
  if (handle.includes('n')) r.y0 = clampX(ty, r.y1, true)
  if (handle.includes('s')) r.y1 = clampX(ty, r.y0, false)
  return { left: 0 - r.x0, top: 0 - r.y0, right: r.x1 - map.width, bottom: r.y1 - map.height }
}
