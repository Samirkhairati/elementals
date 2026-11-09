// Zoom maths for pixel-art previews: a ladder of friendly steps for the +/- buttons, a log scale for the slider
// and the "fit" scale. Pure, so the viewer and its tests share them.

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 32

/** Steps the +/- buttons walk through: whole numbers where pixels stay crisp, a few fractions below 1. */
export const ZOOM_LADDER = [0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32] as const

export const clampZoom = (z: number, min = MIN_ZOOM, max = MAX_ZOOM): number => Math.min(max, Math.max(min, z))

/** The next ladder step above (dir = 1) or below (dir = -1) `zoom`; stays put at the ends. */
export function stepZoom(zoom: number, dir: 1 | -1): number {
  const eps = 1e-6
  if (dir === 1) return ZOOM_LADDER.find((z) => z > zoom + eps) ?? ZOOM_LADDER[ZOOM_LADDER.length - 1]
  return [...ZOOM_LADDER].reverse().find((z) => z < zoom - eps) ?? ZOOM_LADDER[0]
}

/** The scale that shows the whole picture in a box, never above `maxFit` (a tiny picture is not blown up beyond that). */
export function fitScale(boxW: number, boxH: number, width: number, height: number, maxFit = 8): number {
  if (boxW <= 0 || boxH <= 0 || width <= 0 || height <= 0) return 1
  return clampZoom(Math.min(boxW / width, boxH / height, maxFit))
}

/** Slider position (log2 of the zoom) and back. */
export const zoomToSlider = (zoom: number, min = MIN_ZOOM, max = MAX_ZOOM): number => Math.log2(clampZoom(zoom, min, max))
export const sliderToZoom = (v: number, min = MIN_ZOOM, max = MAX_ZOOM): number => clampZoom(2 ** v, min, max)

/** Percent label: 100% , 250% , 12.5% */
export const zoomLabel = (zoom: number): string => `${Math.round(zoom * 1000) / 10}%`

export interface FocusRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * The view that centres a rectangle of the picture (picture pixels) in a viewport of `boxW` x `boxH` screen px: the zoom
 * that fits the whole rectangle (never above `maxFit`) and where the scrollbars go to put its middle in the middle of the box.
 */
export function focusView(boxW: number, boxH: number, rect: FocusRect, maxFit = 8): { zoom: number; scrollLeft: number; scrollTop: number } {
  const zoom = fitScale(boxW, boxH, rect.w, rect.h, maxFit)
  return {
    zoom,
    scrollLeft: Math.max(0, (rect.x + rect.w / 2) * zoom - boxW / 2),
    scrollTop: Math.max(0, (rect.y + rect.h / 2) * zoom - boxH / 2),
  }
}
