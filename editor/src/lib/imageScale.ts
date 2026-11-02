// Scaling an image item. The canvas draws with smoothing off (nearest neighbour: every picture pixel becomes a block
// of whole screen pixels, never blended), and the size an item ends up with is a whole number of pixels, so the
// "after" size the panel announces is exactly what appears on the map.

import type { Rect } from './entityVisuals'

export const MIN_SCALE = 0.1
export const MAX_SCALE = 16

/** The scale a typed value stands for (clamped, at most 3 decimals), or null when it is not a number. */
export function parseScale(text: string): number | null {
  if (text.trim() === '') return null
  const n = Number(text.trim().replace(',', '.').replace(/^x|x$/i, ''))
  if (!Number.isFinite(n)) return null
  return Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, n)) * 1000) / 1000
}

/** Size in whole pixels of a `w` x `h` picture drawn at `scale` (never smaller than 1 px). */
export function scaledSize(size: { w: number; h: number }, scale: number): { w: number; h: number } {
  return { w: Math.max(1, Math.round(size.w * scale)), h: Math.max(1, Math.round(size.h * scale)) }
}

/** `dest` (already multiplied by `scale`) with its width and height rounded to whole pixels, same pivot ratio. */
export function wholePixelDest(dest: Rect, scale: number): Rect {
  if (scale === 1 || dest.w <= 0 || dest.h <= 0) return dest
  const w = Math.max(1, Math.round(dest.w))
  const h = Math.max(1, Math.round(dest.h))
  return { x: (dest.x * w) / dest.w, y: (dest.y * h) / dest.h, w, h }
}
