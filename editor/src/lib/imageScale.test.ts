import { describe, expect, it } from 'vitest'
import { MAX_SCALE, MIN_SCALE, parseScale, scaleForSize, scaledSize } from './imageScale'

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

  it('sizes are exact, not snapped to whole pixels', () => {
    expect(scaledSize({ w: 16, h: 24 }, 2)).toEqual({ w: 32, h: 48 })
    expect(scaledSize({ w: 15, h: 15 }, 1.5)).toEqual({ w: 22.5, h: 22.5 })
    expect(scaledSize({ w: 3, h: 3 }, 0.1)).toEqual({ w: 0.3, h: 0.3 })
  })
})

describe('scaleForSize', () => {
  it('is the scale that gives the wanted width or height', () => {
    expect(scaleForSize(32, 64)).toBe(2)
    expect(scaleForSize(301, 100)).toBe(0.332)
    expect(scaleForSize(10, 1)).toBe(0.1)
  })

  it('is clamped to the allowed scales, and null for nonsense', () => {
    expect(scaleForSize(10, 100000)).toBe(16)
    expect(scaleForSize(10, 0.01)).toBe(0.1)
    expect(scaleForSize(0, 10)).toBeNull()
    expect(scaleForSize(10, Number.NaN)).toBeNull()
    expect(scaleForSize(10, -5)).toBeNull()
  })
})
