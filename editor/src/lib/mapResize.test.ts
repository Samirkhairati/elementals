import { describe, expect, it } from 'vitest'
import type { EntityData, Layer } from '@/types/editor'
import {
  applyResize,
  describeLoss,
  hasLoss,
  occupiedCells,
  resizeLoss,
  resizeProblem,
  resizedSize,
  type ResizableMap,
  type ResizeEdges,
} from './mapResize'

const edges = (e: Partial<ResizeEdges>): ResizeEdges => ({ left: 0, top: 0, right: 0, bottom: 0, ...e })
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
  it('adds the edges to the size', () => {
    expect(resizedSize(makeMap(), edges({ left: 2, right: -1, bottom: 3 }))).toEqual({ width: 5, height: 6 })
  })

  it('refuses empty, huge and fractional results', () => {
    const m = makeMap()
    expect(resizeProblem(m, edges({ left: -2, right: -2 }))).toMatch(/at least/)
    expect(resizeProblem(m, edges({ top: -3 }))).toMatch(/at least/)
    expect(resizeProblem(m, edges({ right: 600 }))).toMatch(/at most/)
    expect(resizeProblem(m, edges({ right: 1.5 }))).toMatch(/whole/)
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

  it('cropping drops what falls outside and shifts the rest', () => {
    // remove the left column and the bottom row
    const e = edges({ left: -1, bottom: -1 })
    const out = applyResize(makeMap(), e)
    expect(out.width).toBe(3)
    expect(out.height).toBe(2)
    // survivors: (3,0)->(2,0)=2, (1,1)->(0,1)=3. Lost: (0,0) and (3,2).
    expect(Object.keys(out.layers[0].data!).map(Number).sort((a, b) => a - b)).toEqual([2, 3])
    expect(out.layers[0].data![2]).toEqual(tile(2))
    expect(out.layers[0].data![3]).toEqual(tile(3))
    // the picture was on the cropped bottom row (0,2), the entity on (2,1) moves to (1,1)
    expect(out.layers[1].images).toEqual([])
    expect(out.entities![0].x).toBe(32 + 16)
  })

  it('drops entities cropped away and does not mutate its input', () => {
    const m = makeMap()
    const before = JSON.stringify(m)
    const out = applyResize(m, edges({ right: -2 }))
    expect(out.entities).toEqual([])
    expect(JSON.stringify(m)).toBe(before)
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
  it('counts tiles per layer, pictures and entities that would be cut', () => {
    const loss = resizeLoss(makeMap(), edges({ left: -1, bottom: -1 }))
    expect(loss.tiles).toBe(2)
    expect(loss.images).toBe(1)
    expect(loss.entities).toEqual([])
    expect(loss.layers).toEqual([
      { layerId: 'g', name: 'ground', type: 'tile', tiles: 2, images: 0 },
      { layerId: 'p', name: 'pics', type: 'image', tiles: 0, images: 1 },
    ])
    expect(describeLoss(loss)).toBe('2 painted tiles, 1 placed picture')
  })

  it('names the cut entities and ignores empty strips', () => {
    expect(resizeLoss(makeMap(), edges({ right: -2 })).entities).toEqual([{ id: 'e1', name: 'Sign' }])
    const m = makeMap()
    m.layers[0].data = { 0: tile() }
    m.layers[1].images = []
    m.entities = []
    expect(hasLoss(resizeLoss(m, edges({ right: -1, bottom: -1 })))).toBe(false)
  })
})

describe('occupiedCells', () => {
  it('flags cells with tiles, pictures or entities', () => {
    const cells = occupiedCells(makeMap())
    expect(cells.length).toBe(12)
    // tiles 0,3,5,11 + picture (0,2)=8 + entity (2,1)=6
    expect([...cells].flatMap((v, i) => (v ? [i] : []))).toEqual([0, 3, 5, 6, 8, 11])
  })

  it('a picture that already runs past the map\'s edge is kept (and moved along), not counted as lost', () => {
    const m = makeMap()
    m.layers[1].images = [{ id: 'far', graphicId: 'a.png', x: -64, y: 500 }]
    expect(resizeLoss(m, edges({ left: 1 })).images).toBe(0)
    expect(hasLoss(resizeLoss({ ...m, layers: [m.layers[1]], entities: [] }, edges({ right: -1 })))).toBe(false)
    const out = applyResize(m, edges({ left: 2, top: 1 }))
    expect(out.layers[1].images![0]).toMatchObject({ x: -64 + 64, y: 500 + 32 })
  })
})
