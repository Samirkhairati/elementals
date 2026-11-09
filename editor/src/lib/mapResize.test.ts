import { describe, expect, it } from 'vitest'
import type { EntityData, Layer } from '@/types/editor'
import {
  applyResize,
  describeLoss,
  hasLoss,
  mapPixelSize,
  occupiedCells,
  resizeLoss,
  resizeProblem,
  resizedSize,
  tileEdges,
  type ResizableMap,
  type ResizeEdges,
} from './mapResize'

// Edges in tiles, as pixels (most of these tests think in tiles).
const edges = (e: Partial<ResizeEdges>): ResizeEdges => tileEdges({ left: 0, top: 0, right: 0, bottom: 0, ...e })
const px = (e: Partial<ResizeEdges>): ResizeEdges => ({ left: 0, top: 0, right: 0, bottom: 0, ...e })
const tile = (x = 0, y = 0) => ({ tilesetId: 'grass.png', x, y })

// 4 x 3 map. Tile layer: (0,0) (3,0) (1,1) (3,2). Entity on (2,1), picture anchored on (0,2).
function makeMap(): ResizableMap {
  const ground: Layer = {
    id: 'g', name: 'ground', type: 'tile', visible: true, locked: false,
    data: { 0: tile(1), 3: tile(2), 5: tile(3), 11: tile(4) },
  }
  const pics: Layer = {
    id: 'p', name: 'pics', type: 'image', visible: true, locked: false,
    images: [{ id: 'i1', graphicId: 'a.png', x: 16, y: 96 }],
  }
  const ent: EntityData = {
    id: 'e1', name: 'Sign', x: 2 * 32 + 16, y: 2 * 32,
    components: { Transform: { x: 2 * 32 + 16, y: 2 * 32, depth: 0 } },
  }
  return { width: 4, height: 3, layers: [ground, pics], entities: [ent] }
}

describe('resizedSize / resizeProblem', () => {
  it('adds the edges to the size in pixels', () => {
    expect(resizedSize(makeMap(), edges({ left: 2, right: -1, bottom: 3 }))).toEqual({ width: 160, height: 192 })
    expect(resizedSize(makeMap(), px({ right: 5 }))).toEqual({ width: 133, height: 96 })
  })

  it('refuses empty, huge, fractional and off-grid left / top edges', () => {
    const m = makeMap()
    expect(resizeProblem(m, edges({ left: -2, right: -2 }))).toMatch(/at least/)
    expect(resizeProblem(m, edges({ top: -3 }))).toMatch(/at least/)
    expect(resizeProblem(m, edges({ right: 600 }))).toMatch(/at most/)
    expect(resizeProblem(m, px({ right: 1.5 }))).toMatch(/whole/)
    expect(resizeProblem(m, px({ left: 5 }))).toMatch(/whole tiles/)
    expect(resizeProblem(m, px({ right: 5, bottom: -7 }))).toBeNull()
    expect(resizeProblem(m, edges({ left: 1, right: -1 }))).toBeNull()
  })
})

describe('applyResize', () => {
  it('returns the same object when nothing changes', () => {
    const m = makeMap()
    expect(applyResize(m, edges({}))).toBe(m)
  })

  it('growing right/bottom keeps tiles in place and re-indexes them for the wider map', () => {
    const out = applyResize(makeMap(), edges({ right: 2, bottom: 1 }))
    expect(out.width).toBe(6)
    expect(out.height).toBe(4)
    // old (0,0) (3,0) (1,1) (3,2) -> index = y * 6 + x
    expect(Object.keys(out.layers[0].data!).map(Number).sort((a, b) => a - b)).toEqual([0, 3, 7, 15])
    expect(out.layers[0].data![15]).toEqual(tile(4))
    expect(out.entities![0].x).toBe(80)
    expect(out.pixelWidth).toBeUndefined()
    expect(hasLoss(resizeLoss(makeMap(), edges({ right: 2, bottom: 1 })))).toBe(false)
  })

  it('growing left/top shifts tiles, entities and pictures by whole tiles', () => {
    const out = applyResize(makeMap(), edges({ left: 2, top: 1 }))
    expect(out.width).toBe(6)
    expect(out.height).toBe(4)
    // (0,0) -> (2,1) = 1*6+2 = 8
    expect(out.layers[0].data![8]).toEqual(tile(1))
    expect(out.entities![0]).toMatchObject({ x: 80 + 64, y: 64 + 32 })
    expect(out.entities![0].components.Transform).toMatchObject({ x: 80 + 64, y: 64 + 32 })
    expect(out.layers[1].images![0]).toMatchObject({ x: 16 + 64, y: 96 + 32 })
  })

  it('cropping drops only the tiles that fall off; pictures and entities stay (outside the map if need be)', () => {
    const out = applyResize(makeMap(), edges({ left: -1, bottom: -1 }))
    expect(out.width).toBe(3)
    expect(out.height).toBe(2)
    // survivors: (3,0)->(2,0)=2, (1,1)->(0,1)=3. Lost: (0,0) and (3,2).
    expect(Object.keys(out.layers[0].data!).map(Number).sort((a, b) => a - b)).toEqual([2, 3])
    expect(out.layers[1].images).toEqual([{ id: 'i1', graphicId: 'a.png', x: 16 - 32, y: 96 }])
    expect(out.entities![0].x).toBe(32 + 16)
  })

  it('keeps an entity that is cropped off and does not mutate its input', () => {
    const m = makeMap()
    const before = JSON.stringify(m)
    const out = applyResize(m, edges({ right: -2 }))
    expect(out.entities).toHaveLength(1)
    expect(JSON.stringify(m)).toBe(before)
  })

  it('a size that is not whole tiles keeps its pixels and a grid that covers it', () => {
    const out = applyResize(makeMap(), px({ right: 5, bottom: -10 }))
    expect(out).toMatchObject({ width: 5, height: 3, pixelWidth: 133, pixelHeight: 86 })
    expect(mapPixelSize(out)).toEqual({ width: 133, height: 86 })
    // back to whole tiles: the pixel size goes away again
    const back = applyResize(out, px({ right: -5, bottom: 10 }))
    expect(back.pixelWidth).toBeUndefined()
    expect(back.width).toBe(4)
  })

  it('throws for an impossible resize', () => {
    expect(() => applyResize(makeMap(), edges({ left: -4 }))).toThrow(/at least/)
  })

  it('round-trips: growing then cropping the same strip restores the map', () => {
    const m = makeMap()
    const grown = applyResize(m, edges({ left: 3, top: 2, right: 1, bottom: 4 }))
    const back = applyResize(grown, edges({ left: -3, top: -2, right: -1, bottom: -4 }))
    expect(back).toEqual(m)
  })
})

describe('resizeLoss', () => {
  it('counts the painted tiles per layer that would be cut, and nothing else', () => {
    const loss = resizeLoss(makeMap(), edges({ left: -1, bottom: -1 }))
    expect(loss.tiles).toBe(2)
    expect(loss.layers).toEqual([{ layerId: 'g', name: 'ground', type: 'tile', tiles: 2 }])
    expect(describeLoss(loss)).toBe('2 painted tiles')
  })

  it('a cropped strip without tiles loses nothing', () => {
    const m = makeMap()
    m.layers[0].data = { 0: tile() }
    expect(hasLoss(resizeLoss(m, edges({ right: -1, bottom: -1 })))).toBe(false)
  })
})

describe('occupiedCells', () => {
  it('flags the cells with painted tiles', () => {
    const cells = occupiedCells(makeMap())
    expect(cells.length).toBe(12)
    expect([...cells].flatMap((v, i) => (v ? [i] : []))).toEqual([0, 3, 5, 11])
  })
})
