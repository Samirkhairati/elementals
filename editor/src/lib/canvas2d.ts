// Shared set-up for the small 2D canvases the editor draws by hand (thumbnails, sprite previews, map previews): sized
// for the screen's pixel density so nothing looks soft on a retina screen, and the "fit a frame in a box" maths every
// thumbnail uses.

import type { Rect } from './entityVisuals'

/**
 * Sizes `canvas`'s backing store to `width`×`height` CSS pixels at the screen's pixel density, and returns its context
 * transformed so one unit is one CSS pixel, cleared. Null when the canvas has no 2D context (tests).
 */
export function prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  canvas.width = Math.max(1, Math.round(width * dpr))
  canvas.height = Math.max(1, Math.round(height * dpr))
  const ctx = canvas.getContext?.('2d') ?? null
  if (!ctx) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  return ctx
}

/**
 * The zoom that fits a `w`×`h` picture in a box with `pad` pixels to spare: whole numbers when it is enlarged (pixel art
 * stays crisp), any smaller factor when it has to shrink.
 */
export function fitZoom(w: number, h: number, boxW: number, boxH = boxW, pad = 4): number {
  if (w <= 0 || h <= 0) return 1
  const fit = Math.min((boxW - pad) / w, (boxH - pad) / h)
  return fit >= 1 ? Math.floor(fit) : fit
}

/** A `w`×`h` picture drawn at `zoom`, centred in a `boxW`×`boxH` box. */
export function centredRect(w: number, h: number, zoom: number, boxW: number, boxH = boxW): Rect {
  return { x: (boxW - w * zoom) / 2, y: (boxH - h * zoom) / 2, w: w * zoom, h: h * zoom }
}
