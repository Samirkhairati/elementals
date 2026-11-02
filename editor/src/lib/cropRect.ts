// Rectangle maths of the crop dialog: whole pixels, always inside the picture, never smaller than one pixel.

import type { ImageCrop } from '@/types/editor'

export interface PictureSize {
  width: number
  height: number
}

export type CropHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export const wholeCrop = (size: PictureSize): ImageCrop => ({ x: 0, y: 0, w: size.width, h: size.height })

export const isWholeCrop = (crop: ImageCrop, size: PictureSize): boolean =>
  crop.x === 0 && crop.y === 0 && crop.w === size.width && crop.h === size.height

export const sameCrop = (a: ImageCrop | undefined, b: ImageCrop | undefined): boolean =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h)

/** A crop made valid for this picture: rounded, inside it, at least 1×1. */
export function clampCrop(crop: ImageCrop, size: PictureSize): ImageCrop {
  const x = clamp(Math.round(crop.x), 0, Math.max(0, size.width - 1))
  const y = clamp(Math.round(crop.y), 0, Math.max(0, size.height - 1))
  return {
    x,
    y,
    w: clamp(Math.round(crop.w), 1, Math.max(1, size.width - x)),
    h: clamp(Math.round(crop.h), 1, Math.max(1, size.height - y)),
  }
}

/** What an item shows: its crop (made valid), or the whole picture. */
export const effectiveCrop = (crop: ImageCrop | undefined, size: PictureSize): ImageCrop => (crop ? clampCrop(crop, size) : wholeCrop(size))

/** `undefined` for "the whole picture", so an item that is not cropped stores nothing. */
export const storedCrop = (crop: ImageCrop, size: PictureSize): ImageCrop | undefined => {
  const c = clampCrop(crop, size)
  return isWholeCrop(c, size) ? undefined : c
}

/** The rectangle after dragging `handle` by (dx, dy) picture pixels from the `start` rectangle. */
export function dragCrop(start: ImageCrop, handle: CropHandle, dx: number, dy: number, size: PictureSize): ImageCrop {
  const mx = Math.round(dx)
  const my = Math.round(dy)
  if (handle === 'move') {
    return { ...start, x: clamp(start.x + mx, 0, size.width - start.w), y: clamp(start.y + my, 0, size.height - start.h) }
  }
  let left = start.x
  let top = start.y
  let right = start.x + start.w
  let bottom = start.y + start.h
  if (handle.includes('w')) left = clamp(left + mx, 0, right - 1)
  if (handle.includes('e')) right = clamp(right + mx, left + 1, size.width)
  if (handle.includes('n')) top = clamp(top + my, 0, bottom - 1)
  if (handle.includes('s')) bottom = clamp(bottom + my, top + 1, size.height)
  return { x: left, y: top, w: right - left, h: bottom - top }
}

/** A new rectangle between two points of the picture (drag on empty ground). */
export function cropFromPoints(a: { x: number; y: number }, b: { x: number; y: number }, size: PictureSize): ImageCrop {
  const x1 = clamp(Math.floor(Math.min(a.x, b.x)), 0, size.width - 1)
  const y1 = clamp(Math.floor(Math.min(a.y, b.y)), 0, size.height - 1)
  const x2 = clamp(Math.ceil(Math.max(a.x, b.x)), x1 + 1, size.width)
  const y2 = clamp(Math.ceil(Math.max(a.y, b.y)), y1 + 1, size.height)
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}
