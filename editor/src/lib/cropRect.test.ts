import { describe, expect, it } from 'vitest'
import { clampCrop, cropFromPoints, dragCrop, effectiveCrop, isWholeCrop, storedCrop, wholeCrop } from './cropRect'

const size = { width: 100, height: 60 }

describe('cropRect', () => {
  it('knows the whole picture, and stores nothing for it', () => {
    expect(wholeCrop(size)).toEqual({ x: 0, y: 0, w: 100, h: 60 })
    expect(isWholeCrop(wholeCrop(size), size)).toBe(true)
    expect(storedCrop({ x: 0, y: 0, w: 100, h: 60 }, size)).toBeUndefined()
    expect(storedCrop({ x: 10, y: 0, w: 50, h: 60 }, size)).toEqual({ x: 10, y: 0, w: 50, h: 60 })
  })

  it('makes any rectangle valid: whole pixels, inside the picture, at least 1×1', () => {
    expect(clampCrop({ x: -5, y: 70, w: 500, h: 0 }, size)).toEqual({ x: 0, y: 59, w: 100, h: 1 })
    expect(clampCrop({ x: 10.4, y: 2.6, w: 20.5, h: 9.2 }, size)).toEqual({ x: 10, y: 3, w: 21, h: 9 })
    expect(effectiveCrop(undefined, size)).toEqual(wholeCrop(size))
    expect(effectiveCrop({ x: 90, y: 0, w: 50, h: 10 }, size)).toEqual({ x: 90, y: 0, w: 10, h: 10 })
  })

  it('moves a rectangle but keeps it inside', () => {
    const r = { x: 10, y: 10, w: 20, h: 20 }
    expect(dragCrop(r, 'move', 5, -3, size)).toEqual({ x: 15, y: 7, w: 20, h: 20 })
    expect(dragCrop(r, 'move', 500, 500, size)).toEqual({ x: 80, y: 40, w: 20, h: 20 })
    expect(dragCrop(r, 'move', -500, -500, size)).toEqual({ x: 0, y: 0, w: 20, h: 20 })
  })

  it('resizes from an edge or a corner, never past the other side or the picture', () => {
    const r = { x: 10, y: 10, w: 20, h: 20 }
    expect(dragCrop(r, 'e', 10, 99, size)).toEqual({ x: 10, y: 10, w: 30, h: 20 })
    expect(dragCrop(r, 'w', -4, 0, size)).toEqual({ x: 6, y: 10, w: 24, h: 20 })
    expect(dragCrop(r, 'nw', -50, -50, size)).toEqual({ x: 0, y: 0, w: 30, h: 30 })
    expect(dragCrop(r, 'se', 500, 500, size)).toEqual({ x: 10, y: 10, w: 90, h: 50 })
    // dragging an edge across the opposite one stops at one pixel
    expect(dragCrop(r, 'e', -50, 0, size)).toEqual({ x: 10, y: 10, w: 1, h: 20 })
    expect(dragCrop(r, 'n', 0, 50, size)).toEqual({ x: 10, y: 29, w: 20, h: 1 })
  })

  it('draws a new rectangle from two points in any direction', () => {
    expect(cropFromPoints({ x: 20.2, y: 10.7 }, { x: 5.5, y: 40 }, size)).toEqual({ x: 5, y: 10, w: 16, h: 30 })
    expect(cropFromPoints({ x: 30, y: 30 }, { x: 30, y: 30 }, size)).toEqual({ x: 30, y: 30, w: 1, h: 1 })
    expect(cropFromPoints({ x: -10, y: -10 }, { x: 500, y: 500 }, size)).toEqual(wholeCrop(size))
  })
})
