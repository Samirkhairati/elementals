import { describe, expect, it } from 'vitest'
import { MAX_SCALE, MIN_SCALE, parseScale, scaledSize, wholePixelDest } from './imageScale'

describe('imageScale', () => {
  it('reads what was typed, clamped and with at most 3 decimals', () => {
    expect(parseScale('2')).toBe(2)
    expect(parseScale(' 1,5 ')).toBe(1.5)
    expect(parseScale('x3')).toBe(3)
    expect(parseScale('2x')).toBe(2)
    expect(parseScale('0.12345')).toBe(0.123)
    expect(parseScale('0')).toBe(MIN_SCALE)
    expect(parseScale('99')).toBe(MAX_SCALE)
    expect(parseScale('')).toBeNull()
    expect(parseScale('abc')).toBeNull()
  })

  it('sizes are whole pixels, never below 1', () => {
    expect(scaledSize({ w: 16, h: 24 }, 2)).toEqual({ w: 32, h: 48 })
    expect(scaledSize({ w: 15, h: 15 }, 1.5)).toEqual({ w: 23, h: 23 })
    expect(scaledSize({ w: 3, h: 3 }, 0.1)).toEqual({ w: 1, h: 1 })
  })

  it('rounds a destination rectangle to whole pixels keeping its pivot ratio; scale 1 is left alone', () => {
    const odd = { x: -15.5, y: -31, w: 31, h: 31 }
    expect(wholePixelDest(odd, 1)).toBe(odd)
    expect(wholePixelDest({ x: -11.5, y: -23, w: 23.25, h: 23 }, 1.5)).toEqual({ x: (-11.5 * 23) / 23.25, y: -23, w: 23, h: 23 })
  })
})
