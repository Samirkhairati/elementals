// Scaling an image item. The canvas draws with smoothing off (nearest neighbour: picture pixels are never blended).
// The editor uses the exact size (w * scale); only the game rounds to whole pixels when it draws.

export const MIN_SCALE = 0.1
export const MAX_SCALE = 16

/** The scale a typed value stands for (clamped, at most 3 decimals), or null when it is not a number. */
export function parseScale(text: string): number | null {
  if (text.trim() === '') return null
  const n = Number(text.trim().replace(',', '.').replace(/^x|x$/i, ''))
  if (!Number.isFinite(n)) return null
  return Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, n)) * 1000) / 1000
}

/** Size of a `w` x `h` picture drawn at `scale`, exact (to 2 decimals): the editor does not snap it to whole pixels. */
export function scaledSize(size: { w: number; h: number }, scale: number): { w: number; h: number } {
  const exact = (n: number) => Math.round(n * scale * 100) / 100
  return { w: exact(size.w), h: exact(size.h) }
}

/** The scale that gives a picture `source` px a width (or height) of `target` px, as close as the scale's precision allows. */
export function scaleForSize(source: number, target: number): number | null {
  if (!(source > 0) || !Number.isFinite(target) || target <= 0) return null
  return parseScale(String(target / source))
}

/** Scales the Resize dialog offers as quick picks. */
export const SCALE_PRESETS = [0.25, 0.5, 1, 2, 3, 4, 8] as const
