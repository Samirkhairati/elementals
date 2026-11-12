import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { SpriteAssetInfo } from '../../../shared/engine/types'
import type { LayerType } from '@/types/editor'

const drawn: { x: number; y: number }[] = []
const order: string[] = []
vi.mock('./imageItems', () => ({
  // a picture is "loaded" when its asset is in the map; the sprite is a stand-in
  resolveImageItem: (item: { graphicId?: string }, assets: Record<string, unknown>) => (item.graphicId && assets[`graphic:${item.graphicId}`] ? { stand: 'in' } : null),
}))
vi.mock('./spriteImages', () => ({
  drawResolvedSprite: (_ctx: unknown, _r: unknown, o: { anchorX: number; anchorY: number }) => {
    order.push('picture')
    drawn.push({ x: o.anchorX, y: o.anchorY })
  },
}))

import { LAYER_SCENERY, drawMapScenery, usedTilesetIds } from './mapScenery'

const loaded = { complete: true, naturalWidth: 32 } as HTMLImageElement
const fakeCtx = () => {
  const calls: string[] = []
  const ctx = {
    drawImage: (...a: unknown[]) => {
      order.push('tile')
      calls.push(`tile@${a[5]},${a[6]}`)
    },
  } as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

describe('LAYER_SCENERY', () => {
  it('says what every layer type contributes: tiles and pictures are drawn, gameplay data and structure are not', () => {
    const all: LayerType[] = ['tile', 'collision', 'terrain', 'objects', 'encounters', 'image', 'folder', 'polygons']
    expect(Object.keys(LAYER_SCENERY).sort()).toEqual([...all].sort())
    expect(all.filter((t) => LAYER_SCENERY[t] !== 'none').sort()).toEqual(['image', 'tile'])
  })
})

describe('drawMapScenery', () => {
  const asset = {} as SpriteAssetInfo
  const base = { width: 4, layers: [] as never[] }

  it('paints pictures of image layers: a map made only of pictures is not blank (the warp and resize previews once missed them)', () => {
    drawn.length = 0
    const { ctx } = fakeCtx()
    const unresolved = drawMapScenery(ctx, { ...base, layers: [{ type: 'image', visible: true, images: [{ id: 'a', graphicId: 'p.png', x: 100, y: 200 }] }] }, { tileImages: { get: () => undefined }, assets: { 'graphic:p.png': asset } })
    expect(drawn).toEqual([{ x: 100, y: 200 }])
    expect(unresolved).toEqual([])
  })

  it('paints the layer list from the bottom up, tiles and pictures as listed, and skips hidden layers', () => {
    order.length = 0
    const { ctx } = fakeCtx()
    // the list is top first: pictures on top, tiles under them, and a hidden tile layer at the very bottom
    const layers = [
      { type: 'image', visible: true, images: [{ id: 'a', graphicId: 'p.png', x: 1, y: 2 }] },
      { type: 'tile', visible: true, data: { 0: { tilesetId: 'ts', x: 0, y: 0 } } },
      { type: 'tile', visible: false, data: { 1: { tilesetId: 'ts', x: 0, y: 0 } } },
    ] as never
    drawMapScenery(ctx, { width: 4, layers }, { tileImages: { get: () => loaded }, assets: { 'graphic:p.png': asset } })
    expect(order).toEqual(['tile', 'picture'])
    order.length = 0
    drawMapScenery(ctx, { width: 4, layers: [...(layers as never[])].reverse() as never }, { tileImages: { get: () => loaded }, assets: { 'graphic:p.png': asset } })
    expect(order).toEqual(['picture', 'tile'])
  })

  it('places a tile by its index and skips collision markers, missing and unfinished images', () => {
    const { ctx, calls } = fakeCtx()
    const layers = [{ type: 'tile', visible: true, data: { 5: { tilesetId: 'ts', x: 1, y: 1 }, 6: { tilesetId: '__collision__', x: 0, y: 0 }, 7: { tilesetId: 'later', x: 0, y: 0 } } }] as never
    drawMapScenery(ctx, { width: 4, layers }, { tileImages: { get: (id) => (id === 'ts' ? loaded : id === 'later' ? ({ complete: false, naturalWidth: 0 } as HTMLImageElement) : undefined) } })
    expect(calls).toEqual(['tile@32,32']) // index 5 on a 4-wide map = column 1, row 1
  })

  it('reports pictures it could not draw (no asset yet) so the caller can mark them', () => {
    const { ctx } = fakeCtx()
    const layers = [{ type: 'image', visible: true, images: [{ id: 'a', graphicId: 'missing.png', x: 7, y: 9 }] }] as never
    expect(drawMapScenery(ctx, { width: 4, layers }, { tileImages: { get: () => undefined }, assets: {} })).toEqual([{ id: 'a', graphicId: 'missing.png', x: 7, y: 9 }])
    expect(drawMapScenery(ctx, { width: 4, layers }, { tileImages: { get: () => undefined } })).toHaveLength(1)
  })
})

describe('usedTilesetIds', () => {
  it('lists the tilesets painted on the layers, never the collision marker', () => {
    expect([...usedTilesetIds([{ data: { 0: { tilesetId: 'a', x: 0, y: 0 }, 1: { tilesetId: '__collision__', x: 0, y: 0 } } }, { data: { 0: { tilesetId: 'b', x: 0, y: 0 } } }, {}])].sort()).toEqual(['a', 'b'])
  })
})

describe('previews of a map draw through the shared scenery', () => {
  it.each(['components/editor/dialogs/ResizePreview.tsx', 'components/editor/events/WarpTilePicker.tsx'])('%s does not paint tiles or pictures by itself', (file) => {
    const src = readFileSync(resolve(process.cwd(), 'src', file), 'utf8')
    expect(src).toContain('drawMapScenery(')
    expect(src).not.toMatch(/layer\.type === '(tile|image)'/)
  })
})
