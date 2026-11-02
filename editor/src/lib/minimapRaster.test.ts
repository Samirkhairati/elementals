import { describe, expect, it } from 'vitest'
import type { EntityData, Layer } from '@/types/editor'
import { MINIMAP_ENTITY, MINIMAP_GROUND, rasterizeMap, type TileColorLookup } from './minimapRaster'

const layer = (id: string, data: Layer['data'], extra: Partial<Layer> = {}): Layer => ({
  id, name: id, type: 'tile', visible: true, locked: false, data, ...extra,
})
const t = (tilesetId: string, x = 0, y = 0) => ({ tilesetId, x, y })
const colors: Record<string, readonly [number, number, number, number] | null> = {
  'g.png': [0, 200, 0, 255],
  'h.png': [200, 0, 0, 255],
  'half.png': [200, 200, 200, 128],
  'none.png': null,
}
const lookup: TileColorLookup = (id) => colors[id] ?? null
const pixel = (px: Uint8ClampedArray, i: number) => [...px.slice(i * 4, i * 4 + 4)]

describe('rasterizeMap', () => {
  it('starts as dark ground, one pixel per tile', () => {
    const px = rasterizeMap({ width: 3, height: 2, layers: [] }, [], lookup)
    expect(px.length).toBe(3 * 2 * 4)
    expect(pixel(px, 5)).toEqual([...MINIMAP_GROUND, 255])
  })

  it('draws the bottom layer first, so the layer listed first ends up on top', () => {
    const top = layer('top', { 1: t('h.png') })
    const bottom = layer('bottom', { 0: t('g.png'), 1: t('g.png') })
    const px = rasterizeMap({ width: 2, height: 1, layers: [top, bottom] }, [], lookup)
    expect(pixel(px, 0)).toEqual([0, 200, 0, 255])
    expect(pixel(px, 1)).toEqual([200, 0, 0, 255])
  })

  it('blends translucent tiles over what is below, and skips hidden layers, other layer types and empty tiles', () => {
    const px = rasterizeMap(
      {
        width: 4,
        height: 1,
        layers: [
          layer('hidden', { 0: t('h.png') }, { visible: false }),
          layer('collision', { 1: t('h.png') }, { type: 'collision' }),
          layer('none', { 2: t('none.png') }),
          layer('half', { 3: t('half.png') }),
        ],
      },
      [],
      lookup
    )
    expect(pixel(px, 0)).toEqual([...MINIMAP_GROUND, 255])
    expect(pixel(px, 1)).toEqual([...MINIMAP_GROUND, 255])
    expect(pixel(px, 2)).toEqual([...MINIMAP_GROUND, 255])
    const half = pixel(px, 3)
    expect(half[0]).toBeGreaterThan(MINIMAP_GROUND[0])
    expect(half[0]).toBeLessThan(200)
  })

  it('marks entities by their anchor tile and ignores ones outside the map', () => {
    const at = (x: number, y: number): EntityData => ({ id: `${x},${y}`, name: 'e', x, y, components: {} })
    const px = rasterizeMap({ width: 3, height: 3, layers: [] }, [at(1 * 32 + 16, 2 * 32), at(-16, 32), at(500, 500)], lookup)
    expect(pixel(px, 1 * 3 + 1).slice(0, 3)).toEqual([...MINIMAP_ENTITY]) // col 1, row 1
    expect(px.filter((_, i) => i % 4 === 0 && px[i] === MINIMAP_ENTITY[0]).length).toBe(1)
  })
})
