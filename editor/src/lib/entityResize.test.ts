import { describe, expect, it } from 'vitest'
import { colliderWorldRect } from './entityVisuals'
import { DEFAULT_GRID } from './grid'
import { areaToColliderProps, handlePoint, resizeArea } from './entityResize'

const box = { x: 32, y: 32, w: 32, h: 32 } // the tile at col 1, row 1

describe('handlePoint', () => {
  it('corners and edge midpoints', () => {
    expect(handlePoint(box, 'nw')).toEqual({ x: 32, y: 32 })
    expect(handlePoint(box, 'se')).toEqual({ x: 64, y: 64 })
    expect(handlePoint(box, 'n')).toEqual({ x: 48, y: 32 })
    expect(handlePoint(box, 'e')).toEqual({ x: 64, y: 48 })
  })
})

describe('resizeArea', () => {
  it('east handle moves only the right edge, snapped to a line', () => {
    expect(resizeArea(box, 'e', { x: 120, y: 999 }, true, DEFAULT_GRID)).toEqual({ x: 32, y: 32, w: 96, h: 32 })
  })

  it('a corner keeps the opposite corner fixed', () => {
    expect(resizeArea(box, 'nw', { x: 0, y: -30 }, true, DEFAULT_GRID)).toEqual({ x: 0, y: -32, w: 64, h: 96 })
  })

  it('never goes below one grid cell while snapping, and never flips', () => {
    expect(resizeArea(box, 'w', { x: 200, y: 0 }, true, DEFAULT_GRID)).toEqual({ x: 32, y: 32, w: 32, h: 32 })
    expect(resizeArea(box, 's', { x: 0, y: 0 }, true, DEFAULT_GRID)).toEqual({ x: 32, y: 32, w: 32, h: 32 })
  })

  it('without the magnet: whole pixels, at least 1 px', () => {
    expect(resizeArea(box, 'se', { x: 70.4, y: 51.6 }, false, DEFAULT_GRID)).toEqual({ x: 32, y: 32, w: 38, h: 20 })
    expect(resizeArea(box, 'e', { x: 0, y: 0 }, false, DEFAULT_GRID)).toEqual({ x: 32, y: 32, w: 1, h: 32 })
  })

  it('snaps to a custom grid with an offset', () => {
    const r = resizeArea(box, 'e', { x: 100, y: 0 }, true, { sizeX: 10, sizeY: 10, offsetX: 3, offsetY: 0 })
    expect(r.x + r.w).toBe(103)
  })
})

describe('areaToColliderProps', () => {
  it('writes a box relative to the anchor (bottom-centred) that reproduces the rect', () => {
    const anchor = { x: 48, y: 64 }
    const rect = { x: 32, y: 0, w: 96, h: 64 }
    const props = areaToColliderProps(rect, anchor)
    expect(props).toEqual({ width: 96, height: 64, offsetX: 32, offsetY: 0 })
    expect(colliderWorldRect(anchor.x, anchor.y, props)).toEqual(rect)
  })
})
