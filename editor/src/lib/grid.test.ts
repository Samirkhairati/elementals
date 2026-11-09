import { describe, expect, it } from 'vitest'
import { DEFAULT_GRID, isDefaultGrid, nearestLine, normalizeGrid } from './grid'

describe('normalizeGrid', () => {
  it('fills in the defaults and keeps valid values', () => {
    expect(normalizeGrid(undefined)).toEqual(DEFAULT_GRID)
    expect(normalizeGrid({ sizeX: 16, sizeY: 48, offsetX: 4, offsetY: 8 })).toEqual({ sizeX: 16, sizeY: 48, offsetX: 4, offsetY: 8 })
  })

  it('rounds to whole pixels, clamps sizes to at least 1, and ignores junk', () => {
    expect(normalizeGrid({ sizeX: 0, sizeY: 10.6 })).toMatchObject({ sizeX: 1, sizeY: 11 })
    expect(normalizeGrid({ sizeX: Number.NaN, sizeY: '8' as unknown as number })).toMatchObject({ sizeX: 32, sizeY: 32 })
    expect(normalizeGrid({ sizeX: 5000 }).sizeX).toBe(1024)
  })

  it('wraps offsets into one cell, negative ones too', () => {
    expect(normalizeGrid({ sizeX: 32, offsetX: 40 }).offsetX).toBe(8)
    expect(normalizeGrid({ sizeX: 32, offsetX: -8 }).offsetX).toBe(24)
    expect(normalizeGrid({ sizeY: 10, offsetY: 10 }).offsetY).toBe(0)
  })
})

describe('nearestLine / isDefaultGrid', () => {
  it('finds the nearest grid line, with an offset too', () => {
    expect(nearestLine(50, 32, 0)).toBe(64)
    expect(nearestLine(47, 32, 0)).toBe(32)
    expect(nearestLine(20, 32, 8)).toBe(8)
    expect(nearestLine(30, 32, 8)).toBe(40)
    expect(nearestLine(-20, 32, 0)).toBe(-32)
  })

  it('knows the default grid', () => {
    expect(isDefaultGrid(DEFAULT_GRID)).toBe(true)
    expect(isDefaultGrid({ ...DEFAULT_GRID, offsetX: 1 })).toBe(false)
  })
})
