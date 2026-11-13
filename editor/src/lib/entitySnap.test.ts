import { describe, expect, it } from 'vitest'
import { TILE_RECT_LOCAL } from './entityVisuals'
import { DEFAULT_GRID } from './grid'
import { snapEntityAnchor } from './entitySnap'
import { isTileAnchor } from '../../../shared/engine/placement'

describe('snapEntityAnchor', () => {
  it('a one-tile area lands on the tile anchor (col*32+16, (row+1)*32)', () => {
    for (const [x, y] of [[0, 0], [5, 7], [40, 70], [47, 81], [100.4, 99.6], [-10, 20]]) {
      const p = snapEntityAnchor(TILE_RECT_LOCAL, x, y, true, DEFAULT_GRID)
      expect(isTileAnchor(p.x, p.y)).toBe(true)
    }
    expect(snapEntityAnchor(TILE_RECT_LOCAL, 40, 70, true, DEFAULT_GRID)).toEqual({ x: 48, y: 64 })
  })

  it('puts the edges of a bigger area on grid lines', () => {
    const area = { x: -32, y: -64, w: 64, h: 64 }
    const p = snapEntityAnchor(area, 101, 70, true, DEFAULT_GRID)
    expect((p.x - 32) % 32).toBe(0)
    expect(p.y % 32).toBe(0)
  })

  it('off: whole pixels, no grid', () => {
    expect(snapEntityAnchor(TILE_RECT_LOCAL, 40.4, 70.6, false, DEFAULT_GRID)).toEqual({ x: 40, y: 71 })
  })

  it('follows the grid in force', () => {
    const p = snapEntityAnchor(TILE_RECT_LOCAL, 40, 50, true, { sizeX: 16, sizeY: 16, offsetX: 0, offsetY: 0 })
    expect((p.x - 16) % 16).toBe(0)
    expect(p.y % 16).toBe(0)
  })
})
