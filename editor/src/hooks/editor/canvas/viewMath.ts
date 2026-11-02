import { TILE_SIZE } from '../../../../../shared/engine/constants'

/** Pure maths of the main canvas view (the Konva stage's scale and position), shared by the hook, the zoom bar and the minimap. */

export const MIN_CANVAS_ZOOM = 0.1
export const MAX_CANVAS_ZOOM = 8

export interface CanvasView {
  /** Screen pixels per world pixel (1 = 100%). */
  scale: number
  /** Screen position of world (0, 0). */
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export const clampCanvasZoom = (z: number): number => Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, z))

export function sameView(a: CanvasView, b: CanvasView, eps = 1e-6): boolean {
  return Math.abs(a.scale - b.scale) < eps && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5
}

/** The "reset" view: the whole map centred, at 80% of the available room and never bigger than 100%. */
export function fitView(box: Size, mapTilesW: number, mapTilesH: number): CanvasView {
  const mapW = mapTilesW * TILE_SIZE
  const mapH = mapTilesH * TILE_SIZE
  const scale = Math.min(1, Math.max(MIN_CANVAS_ZOOM, Math.min((box.width * 0.8) / mapW, (box.height * 0.8) / mapH)))
  return {
    scale,
    x: Math.round((box.width - mapW * scale) / 2),
    y: Math.round((box.height - mapH * scale) / 2),
  }
}

/** `view` zoomed to `scale` while the screen point (px, py) keeps showing the same world point. */
export function zoomAbout(view: CanvasView, scale: number, px: number, py: number): CanvasView {
  const next = clampCanvasZoom(scale)
  const wx = (px - view.x) / view.scale
  const wy = (py - view.y) / view.scale
  return { scale: next, x: px - wx * next, y: py - wy * next }
}

/** `view` moved so that world point (wx, wy) sits in the middle of the box. */
export function centerOnWorld(view: CanvasView, box: Size, wx: number, wy: number): CanvasView {
  return { scale: view.scale, x: box.width / 2 - wx * view.scale, y: box.height / 2 - wy * view.scale }
}

/** The part of the world the box shows, in world pixels. */
export function visibleWorldRect(view: CanvasView, box: Size): { x: number; y: number; width: number; height: number } {
  return { x: -view.x / view.scale, y: -view.y / view.scale, width: box.width / view.scale, height: box.height / view.scale }
}

/** Pixels per tile and size of the minimap picture for a map that has to fit inside `maxW` x `maxH`. */
export function minimapLayout(mapTilesW: number, mapTilesH: number, maxW: number, maxH: number): { scale: number; width: number; height: number } {
  if (mapTilesW <= 0 || mapTilesH <= 0) return { scale: 1, width: 1, height: 1 }
  const scale = Math.min(maxW / mapTilesW, maxH / mapTilesH)
  return { scale, width: Math.max(1, Math.round(mapTilesW * scale)), height: Math.max(1, Math.round(mapTilesH * scale)) }
}
