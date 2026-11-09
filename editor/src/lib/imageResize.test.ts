import { describe, expect, it } from 'vitest'
import { cornerAt, oppositeCorner, resizeFromCorner, scaleBounds } from './imageResize'
import { MAX_SCALE, MIN_SCALE } from './imageScale'

// A 32x16 picture anchored at its bottom-centre.
const unit = { x: -16, y: -16, w: 32, h: 16 }

describe('resizeFromCorner', () => {
  it('dragging the bottom-right corner doubles the picture and keeps the top-left corner where it was', () => {
    const anchor = { x: 100, y: 200 }
    const topLeft = cornerAt(unit, anchor, 'nw')
    const r = resizeFromCorner(unit, anchor, 1, 'se', { x: topLeft.x + 64, y: topLeft.y + 32 })
    expect(r.scale).toBe(2)
    expect(cornerAt(scaleBounds(unit, r.scale), r, 'nw')).toEqual(topLeft)
  })

  it('dragging the top-left corner inwards shrinks it around the bottom-right corner', () => {
    const anchor = { x: 100, y: 200 }
    const bottomRight = cornerAt(scaleBounds(unit, 2), anchor, 'se')
    const r = resizeFromCorner(unit, anchor, 2, 'nw', { x: bottomRight.x - 32, y: bottomRight.y - 16 })
    expect(r.scale).toBe(1)
    expect(cornerAt(scaleBounds(unit, r.scale), r, 'se')).toEqual(bottomRight)
  })

  it('keeps the shape: the axis the pointer went further along decides the scale', () => {
    const anchor = { x: 0, y: 0 }
    const nw = cornerAt(unit, anchor, 'nw')
    expect(resizeFromCorner(unit, anchor, 1, 'se', { x: nw.x + 96, y: nw.y + 4 }).scale).toBe(3)
    expect(resizeFromCorner(unit, anchor, 1, 'se', { x: nw.x + 4, y: nw.y + 48 }).scale).toBe(3)
  })

  it('stays within the scale limits, even when the pointer crosses the opposite corner', () => {
    const anchor = { x: 0, y: 0 }
    expect(resizeFromCorner(unit, anchor, 1, 'se', { x: -500, y: -500 }).scale).toBe(MIN_SCALE)
    expect(resizeFromCorner(unit, anchor, 1, 'se', { x: 99999, y: 0 }).scale).toBe(MAX_SCALE)
  })

  it('names the opposite corner', () => {
    expect([oppositeCorner('nw'), oppositeCorner('ne'), oppositeCorner('sw'), oppositeCorner('se')]).toEqual(['se', 'sw', 'ne', 'nw'])
  })
})
