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
 * The edges after dragging `handle` to the world position (wx, wy). The left and top edges snap to whole tiles; the
 * right and bottom ones to `step` (1 = whole tiles, 1/32 = whole pixels). The rectangle keeps between `step` and
 * MAX_MAP_SIZE tiles on each axis.
 */
export function edgesFromDrag(
  handle: Handle,
  wx: number,
  wy: number,
  map: { width: number; height: number },
  edges: ResizeEdges,
  step = 1
): ResizeEdges {
  const r = newRect(map, edges)
  const snap = (v: number, by: number) => Math.round(v / by) * by
  const clamp = (v: number, fixed: number, movingIsMin: boolean, min: number) =>
    movingIsMin
      ? Math.max(fixed - MAX_MAP_SIZE, Math.min(fixed - min, v))
      : Math.min(fixed + MAX_MAP_SIZE, Math.max(fixed + min, v))
  // An edge that moves in whole tiles keeps at least one tile; the free ones at least one step.
  if (handle.includes('w')) r.x0 = Math.floor(clamp(snap(wx, 1), r.x1, true, 1))
  if (handle.includes('e')) r.x1 = clamp(snap(wx, step), r.x0, false, step)
  if (handle.includes('n')) r.y0 = Math.floor(clamp(snap(wy, 1), r.y1, true, 1))
  if (handle.includes('s')) r.y1 = clamp(snap(wy, step), r.y0, false, step)
  const fix = (v: number) => Math.round(v * 1e6) / 1e6
  return { left: fix(0 - r.x0), top: fix(0 - r.y0), right: fix(r.x1 - map.width), bottom: fix(r.y1 - map.height) }
}

/** `view` zoomed by `factor` around the screen point (px, py), which keeps showing the same spot. */
export function zoomViewAt(view: ResizeView, factor: number, px: number, py: number): ResizeView {
  const scale = Math.min(256, Math.max(0.05, view.scale * factor))
  const f = scale / view.scale
  return { scale, originX: px - (px - view.originX) * f, originY: py - (py - view.originY) * f }
}
