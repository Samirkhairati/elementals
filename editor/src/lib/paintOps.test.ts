import { describe, it, expect, vi, afterEach } from 'vitest'
import type { CopiedTile, TileSelection } from '@/types/editor'
import { anchoredTile, brushPaint, bucketFill, erase, rectangleFill, type TileMap } from './paintOps'

const size = { width: 5, height: 4 }
const idx = (x: number, y: number) => y * size.width + x
const t = (x: number, y = 0, tilesetId = 'ts'): CopiedTile => ({ tilesetId, x, y })
const single = (tile: CopiedTile | null): TileSelection => ({ width: 1, height: 1, tiles: [tile] })
// 2x2 stamp: A B / C D
const stamp: TileSelection = { width: 2, height: 2, tiles: [t(0, 0), t(1, 0), t(0, 1), t(1, 1)] }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('brushPaint', () => {
  it('paints a single tile', () => {
    const out = brushPaint(undefined, size, 2, 1, single(t(7, 3)), 'discontinuous', null)
    expect(out).toEqual({ [idx(2, 1)]: t(7, 3) })
  })

  it('does not mutate the input data', () => {
    const data: TileMap = { [idx(0, 0)]: t(1) }
    const copy = JSON.parse(JSON.stringify(data))
    brushPaint(data, size, 1, 1, single(t(2)), 'discontinuous', null)
    expect(data).toEqual(copy)
  })

  it('stamps a multi-tile selection relative to the stamp corner (discontinuous)', () => {
    const out = brushPaint({}, size, 1, 1, stamp, 'discontinuous', { x: 4, y: 4 })!
    expect(out[idx(1, 1)]).toEqual(t(0, 0))
    expect(out[idx(2, 1)]).toEqual(t(1, 0))
    expect(out[idx(1, 2)]).toEqual(t(0, 1))
    expect(out[idx(2, 2)]).toEqual(t(1, 1))
    expect(Object.keys(out)).toHaveLength(4)
  })

  it('clips a stamp that hangs over the map edge', () => {
    const out = brushPaint({}, size, 4, 3, stamp, 'discontinuous', null)!
    expect(Object.keys(out)).toEqual([String(idx(4, 3))])
    expect(out[idx(4, 3)]).toEqual(t(0, 0))
  })

  it('skips negative origin cells but paints the in-bounds part', () => {
    const out = brushPaint({}, size, -1, 0, stamp, 'discontinuous', null)!
    expect(out[idx(0, 0)]).toEqual(t(1, 0))
    expect(out[idx(0, 1)]).toEqual(t(1, 1))
    expect(Object.keys(out)).toHaveLength(2)
  })

  it('null cells in the stamp erase existing tiles', () => {
    const sel: TileSelection = { width: 2, height: 1, tiles: [null, t(3)] }
    const out = brushPaint({ [idx(1, 0)]: t(9), [idx(2, 0)]: t(9) }, size, 1, 0, sel, 'discontinuous', null)!
    expect(out[idx(1, 0)]).toBeUndefined()
    expect(out[idx(2, 0)]).toEqual(t(3))
  })

  it('returns null when nothing would change', () => {
    const data: TileMap = { [idx(1, 1)]: t(5) }
    expect(brushPaint(data, size, 1, 1, single(t(5)), 'discontinuous', null)).toBeNull()
    expect(brushPaint({}, size, 1, 1, single(null), 'discontinuous', null)).toBeNull()
  })

  it('continuous mode tiles the selection from the stroke anchor', () => {
    // Stroke started at (0,0); painting a 2x2 stamp at (1,1) must continue the pattern, not restart it.
    const out = brushPaint({}, size, 1, 1, stamp, 'continuous', { x: 0, y: 0 })!
    expect(out[idx(1, 1)]).toEqual(t(1, 1)) // offset (1,1)
    expect(out[idx(2, 1)]).toEqual(t(0, 1)) // offset (0,1)
    expect(out[idx(1, 2)]).toEqual(t(1, 0)) // offset (1,0)
    expect(out[idx(2, 2)]).toEqual(t(0, 0)) // offset (0,0)
  })

  it('continuous mode without an anchor behaves like discontinuous', () => {
    const a = brushPaint({}, size, 1, 1, stamp, 'continuous', null)
    const b = brushPaint({}, size, 1, 1, stamp, 'discontinuous', null)
    expect(a).toEqual(b)
  })

  it('continuous mode wraps negative offsets', () => {
    const out = brushPaint({}, size, 0, 0, single(t(9)), 'continuous', { x: 3, y: 3 })!
    expect(out[idx(0, 0)]).toEqual(t(9))
    const two: TileSelection = { width: 2, height: 1, tiles: [t(0), t(1)] }
    const out2 = brushPaint({}, size, 0, 0, two, 'continuous', { x: 1, y: 0 })!
    // x=0, anchor 1 -> offset -1 -> wraps to index 1
    expect(out2[idx(0, 0)]).toEqual(t(1))
    expect(out2[idx(1, 0)]).toEqual(t(0))
  })

  it('random mode picks tiles via Math.random', () => {
    const spy = vi.spyOn(Math, 'random')
    spy.mockReturnValueOnce(0).mockReturnValueOnce(0.99).mockReturnValueOnce(0.5).mockReturnValueOnce(0.26)
    const out = brushPaint({}, size, 0, 0, stamp, 'random', null)!
    // order: (0,0) (1,0) (0,1) (1,1) -> indexes 0, 3, 2, 1
    expect(out[idx(0, 0)]).toEqual(stamp.tiles[0])
    expect(out[idx(1, 0)]).toEqual(stamp.tiles[3])
    expect(out[idx(0, 1)]).toEqual(stamp.tiles[2])
    expect(out[idx(1, 1)]).toEqual(stamp.tiles[1])
    expect(spy).toHaveBeenCalledTimes(4)
  })

  it('collision layer: paints the virtual collision tile', () => {
    const collision = single({ tilesetId: '__collision__', x: 0, y: 0 })
    const out = brushPaint({}, size, 3, 2, collision, 'discontinuous', null)!
    expect(out[idx(3, 2)]).toEqual({ tilesetId: '__collision__', x: 0, y: 0 })
  })

  it('stores copies of the tile objects, not the selection tiles themselves', () => {
    const sel = single(t(1))
    const out = brushPaint({}, size, 0, 0, sel, 'discontinuous', null)!
    expect(out[0]).not.toBe(sel.tiles[0])
  })
})

describe('erase', () => {
  it('removes a painted cell', () => {
    const data: TileMap = { [idx(1, 1)]: t(1), [idx(2, 2)]: t(2) }
    const out = erase(data, size, 1, 1)!
    expect(out).toEqual({ [idx(2, 2)]: t(2) })
    expect(data[idx(1, 1)]).toBeDefined()
  })

  it('returns null for an empty cell, empty data or out of bounds', () => {
    expect(erase({ [idx(0, 0)]: t(1) }, size, 3, 3)).toBeNull()
    expect(erase(undefined, size, 0, 0)).toBeNull()
    expect(erase({ 0: t(1) }, size, -1, 0)).toBeNull()
    expect(erase({ 0: t(1) }, size, 0, 4)).toBeNull()
  })
})

describe('bucketFill', () => {
  it('fills an entire empty map', () => {
    const out = bucketFill({}, size, 2, 2, single(t(4)), 'discontinuous', null)!
    expect(Object.keys(out)).toHaveLength(size.width * size.height)
    expect(out[idx(0, 0)]).toEqual(t(4))
  })

  it('stops at tiles that differ (enclosed region)', () => {
    // wall column at x=2 splits the map
    const data: TileMap = {}
    for (let y = 0; y < size.height; y++) data[idx(2, y)] = t(9)
    const out = bucketFill(data, size, 0, 0, single(t(1)), 'discontinuous', null)!
    for (let y = 0; y < size.height; y++) {
      expect(out[idx(0, y)]).toEqual(t(1))
      expect(out[idx(1, y)]).toEqual(t(1))
      expect(out[idx(2, y)]).toEqual(t(9))
      expect(out[idx(3, y)]).toBeUndefined()
      expect(out[idx(4, y)]).toBeUndefined()
    }
  })

  it('fills only the 4-connected region (diagonals do not leak)', () => {
    // checker around (0,0): (1,0) and (0,1) walls, (1,1) empty but only diagonal
    const data: TileMap = { [idx(1, 0)]: t(9), [idx(0, 1)]: t(9) }
    const out = bucketFill(data, size, 0, 0, single(t(1)), 'discontinuous', null)!
    expect(out[idx(0, 0)]).toEqual(t(1))
    expect(out[idx(1, 1)]).toBeUndefined()
  })

  it('replaces a region of identical painted tiles', () => {
    const data: TileMap = { [idx(0, 0)]: t(2), [idx(1, 0)]: t(2), [idx(2, 0)]: t(3) }
    const out = bucketFill(data, size, 0, 0, single(t(7)), 'discontinuous', null)!
    expect(out[idx(0, 0)]).toEqual(t(7))
    expect(out[idx(1, 0)]).toEqual(t(7))
    expect(out[idx(2, 0)]).toEqual(t(3))
  })

  it('returns null when the fill would not change anything', () => {
    const data: TileMap = {}
    for (let i = 0; i < size.width * size.height; i++) data[i] = t(4)
    expect(bucketFill(data, size, 1, 1, single(t(4)), 'discontinuous', null)).toBeNull()
  })

  it('returns null for an out-of-bounds start', () => {
    expect(bucketFill({}, size, -1, 0, single(t(1)), 'discontinuous', null)).toBeNull()
    expect(bucketFill({}, size, 5, 0, single(t(1)), 'discontinuous', null)).toBeNull()
  })

  it('tiles a multi-tile selection anchored at the click position', () => {
    const out = bucketFill({}, size, 2, 1, stamp, 'discontinuous', null)!
    expect(out[idx(2, 1)]).toEqual(t(0, 0))
    expect(out[idx(3, 1)]).toEqual(t(1, 0))
    expect(out[idx(4, 1)]).toEqual(t(0, 0))
    expect(out[idx(2, 2)]).toEqual(t(0, 1))
    expect(out[idx(1, 1)]).toEqual(t(1, 0)) // offset -1 wraps
  })

  it('prefers the stroke anchor over the click position when one exists', () => {
    const out = bucketFill({}, size, 2, 1, stamp, 'continuous', { x: 0, y: 0 })!
    expect(out[idx(0, 0)]).toEqual(t(0, 0))
    expect(out[idx(1, 0)]).toEqual(t(1, 0))
    expect(out[idx(2, 1)]).toEqual(t(0, 1))
  })

  it('random mode draws per cell from Math.random', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const sel: TileSelection = { width: 2, height: 1, tiles: [t(0), t(1)] }
    const out = bucketFill({}, size, 0, 0, sel, 'random', null)!
    expect(Object.values(out).every(tile => tile.x === 1)).toBe(true)
  })

  it('handles a large empty region without blowing up', () => {
    const big = { width: 200, height: 200 }
    const out = bucketFill({}, big, 0, 0, single(t(1)), 'discontinuous', null)!
    expect(Object.keys(out)).toHaveLength(40000)
  })
})

describe('rectangleFill', () => {
  it('fills the inclusive rectangle between two corners', () => {
    const out = rectangleFill({}, size, { x: 1, y: 1 }, { x: 3, y: 2 }, single(t(6)), 'discontinuous')!
    expect(Object.keys(out)).toHaveLength(6)
    expect(out[idx(1, 1)]).toEqual(t(6))
    expect(out[idx(3, 2)]).toEqual(t(6))
    expect(out[idx(0, 0)]).toBeUndefined()
  })

  it('accepts reversed corners and anchors the pattern at the start corner', () => {
    // drag from (3,2) to (1,1): pattern anchored at (3,2)
    const out = rectangleFill({}, size, { x: 3, y: 2 }, { x: 1, y: 1 }, stamp, 'discontinuous')!
    expect(Object.keys(out)).toHaveLength(6)
    expect(out[idx(3, 2)]).toEqual(t(0, 0))
    expect(out[idx(2, 2)]).toEqual(t(1, 0)) // offset -1 wraps
    expect(out[idx(3, 1)]).toEqual(t(0, 1))
  })

  it('continuous and discontinuous are identical', () => {
    const a = rectangleFill({}, size, { x: 0, y: 0 }, { x: 4, y: 3 }, stamp, 'continuous')
    const b = rectangleFill({}, size, { x: 0, y: 0 }, { x: 4, y: 3 }, stamp, 'discontinuous')
    expect(a).toEqual(b)
  })

  it('clamps to the map bounds', () => {
    const out = rectangleFill({}, size, { x: -3, y: -3 }, { x: 99, y: 99 }, single(t(1)), 'discontinuous')!
    expect(Object.keys(out)).toHaveLength(size.width * size.height)
  })

  it('a rectangle fully outside the map changes nothing', () => {
    expect(rectangleFill({}, size, { x: 10, y: 10 }, { x: 12, y: 12 }, single(t(1)), 'discontinuous')).toBeNull()
  })

  it('overwrites existing tiles and leaves others untouched', () => {
    const data: TileMap = { [idx(1, 1)]: t(9), [idx(4, 3)]: t(8) }
    const out = rectangleFill(data, size, { x: 0, y: 0 }, { x: 1, y: 1 }, single(t(2)), 'discontinuous')!
    expect(out[idx(1, 1)]).toEqual(t(2))
    expect(out[idx(4, 3)]).toEqual(t(8))
  })

  it('returns null if every cell already matches', () => {
    const data: TileMap = { [idx(0, 0)]: t(2), [idx(1, 0)]: t(2) }
    expect(rectangleFill(data, size, { x: 0, y: 0 }, { x: 1, y: 0 }, single(t(2)), 'discontinuous')).toBeNull()
  })

  it('random mode uses Math.random for each cell', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0)
    const sel: TileSelection = { width: 2, height: 1, tiles: [t(0), t(1)] }
    const out = rectangleFill({}, size, { x: 0, y: 0 }, { x: 1, y: 1 }, sel, 'random')!
    expect(spy).toHaveBeenCalledTimes(4)
    expect(Object.values(out).every(tile => tile.x === 0)).toBe(true)
  })

  it('collision layer fill', () => {
    const collision = single({ tilesetId: '__collision__', x: 0, y: 0 })
    const out = rectangleFill({}, size, { x: 0, y: 0 }, { x: 1, y: 0 }, collision, 'discontinuous')!
    expect(out[0].tilesetId).toBe('__collision__')
    expect(out[1].tilesetId).toBe('__collision__')
  })
})

describe('anchoredTile', () => {
  it('wraps positive and negative offsets', () => {
    expect(anchoredTile(stamp, 2, 0, { x: 0, y: 0 })).toEqual(t(0, 0))
    expect(anchoredTile(stamp, -1, 0, { x: 0, y: 0 })).toEqual(t(1, 0))
    expect(anchoredTile(stamp, 0, -1, { x: 0, y: 0 })).toEqual(t(0, 1))
  })
})
