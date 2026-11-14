import { describe, expect, it } from 'vitest'
import { collisionShapeNodes, layerNodes, type CollisionLayerNode, type EntityNode, type ImageLayerNode, type PictureNode, type SceneNode, type TileLayerNode } from '../../../shared/sceneTree'
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
  const ground: TileLayerNode = { id: 'g', name: 'ground', type: 'tile', data: { 0: tile(1), 3: tile(2), 5: tile(3), 11: tile(4) } }
  const pics: ImageLayerNode = { id: 'p', name: 'pics', type: 'image', children: [{ id: 'i1', type: 'picture', name: 'i1', graphicId: 'a.png', x: 16, y: 96 }] }
  const ent: EntityNode = {
    id: 'e1', type: 'entity', name: 'Sign', x: 2 * 32 + 16, y: 2 * 32,
    components: { Transform: { x: 2 * 32 + 16, y: 2 * 32, depth: 0 } },
  }
  return { width: 4, height: 3, nodes: [ground, pics, ent] }
}

const layerOf = (m: ResizableMap, id: string): SceneNode => layerNodes(m.nodes).find((l) => l.id === id)!
const ground = (m: ResizableMap) => layerOf(m, 'g') as TileLayerNode
const entityOf = (m: ResizableMap) => m.nodes.find((n) => n.type === 'entity') as EntityNode
const pictureOf = (m: ResizableMap) => (layerOf(m, 'p') as ImageLayerNode).children[0] as PictureNode

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
    expect(resizeProblem(m, px({ left: 5 }))).toBeNull()
    expect(resizeProblem(m, px({ left: 1.5 }))).toMatch(/whole pixels/)
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
    expect(Object.keys(ground(out).data!).map(Number).sort((a, b) => a - b)).toEqual([0, 3, 7, 15])
    expect(ground(out).data![15]).toEqual(tile(4))
    expect(entityOf(out).x).toBe(80)
    expect(out.pixelWidth).toBeUndefined()
    expect(hasLoss(resizeLoss(makeMap(), edges({ right: 2, bottom: 1 })))).toBe(false)
  })

  it('growing left/top shifts tiles, entities and pictures by whole tiles', () => {
    const out = applyResize(makeMap(), edges({ left: 2, top: 1 }))
    expect(out.width).toBe(6)
    expect(out.height).toBe(4)
    // (0,0) -> (2,1) = 1*6+2 = 8
    expect(ground(out).data![8]).toEqual(tile(1))
    expect(entityOf(out)).toMatchObject({ x: 80 + 64, y: 64 + 32 })
    expect(entityOf(out).components.Transform).toMatchObject({ x: 80 + 64, y: 64 + 32 })
    expect(pictureOf(out)).toMatchObject({ x: 16 + 64, y: 96 + 32 })
  })

  it('moves collision shapes by the exact pixels, and off-grid shifts put tiles on the nearest tile', () => {
    const m = makeMap()
    const walls: CollisionLayerNode = { id: 'w', name: 'Walls', type: 'collision', children: [{ id: 's', type: 'collisionShape', name: '', closed: false, points: [{ x: 10, y: 20 }, { x: 50, y: 20 }] }] }
    m.nodes.push(walls)
    const out = applyResize(m, px({ left: 40, top: 10 }))
    expect(collisionShapeNodes(layerOf(out, 'w') as CollisionLayerNode)[0].points).toEqual([{ x: 50, y: 30 }, { x: 90, y: 30 }])
    expect(entityOf(out)).toMatchObject({ x: 80 + 40, y: 64 + 10 })
    // 40 px = 1.25 tiles -> 1 tile; 10 px -> 0 tiles: (0,0) stays at row 0, column 1 -> width 4 + ceil(40/32)
    expect(ground(out).data![1]).toEqual(tile(1))
  })

  it('cropping drops only the tiles that fall off; pictures and entities stay (outside the map if need be)', () => {
    const out = applyResize(makeMap(), edges({ left: -1, bottom: -1 }))
    expect(out.width).toBe(3)
    expect(out.height).toBe(2)
    // survivors: (3,0)->(2,0)=2, (1,1)->(0,1)=3. Lost: (0,0) and (3,2).
    expect(Object.keys(ground(out).data!).map(Number).sort((a, b) => a - b)).toEqual([2, 3])
    expect(pictureOf(out)).toMatchObject({ id: 'i1', graphicId: 'a.png', x: 16 - 32, y: 96 })
    expect(entityOf(out).x).toBe(32 + 16)
  })

  it('keeps an entity that is cropped off and does not mutate its input', () => {
    const m = makeMap()
    const before = JSON.stringify(m)
    const out = applyResize(m, edges({ right: -2 }))
    expect(out.nodes.filter((n) => n.type === 'entity')).toHaveLength(1)
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
    ground(m).data = { 0: tile() }
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
