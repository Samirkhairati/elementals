import { describe, it, expect } from 'vitest'
import type { CopiedTile, TileSelection } from '@/types/editor'
import { makeLayer } from '@/test/helpers'
import { fitSelectionToLayer, sampleSelection, sampledLayers, targetLayerIndex } from './layerSelection'

const t = (x: number, y = 0, tilesetId = 'ts'): CopiedTile => ({ tilesetId, x, y })
const COL: CopiedTile = { tilesetId: '__collision__', x: 0, y: 0 }
const MAP_W = 4

describe('sampledLayers', () => {
  const layers = [makeLayer('col', { type: 'collision' }), makeLayer('img', { type: 'image' }), makeLayer('a'), makeLayer('b')]

  it('is the active layer plus the multi-selection, topmost first, without image layers', () => {
    expect(sampledLayers(layers, 'a', ['col', 'img']).map((l) => l.id)).toEqual(['col', 'a'])
  })

  it('ignores ids that no longer exist', () => {
    expect(sampledLayers(layers, 'b', ['gone']).map((l) => l.id)).toEqual(['b'])
  })

  it('is empty when the active layer is an image layer and nothing else is picked', () => {
    expect(sampledLayers(layers, 'img', [])).toEqual([])
  })
})

describe('sampleSelection', () => {
  const ground = makeLayer('ground', { data: { 5: t(1), 6: t(2) } })
  const col = makeLayer('col', { type: 'collision', data: { 5: COL, 9: COL } })
  const box = { minX: 1, minY: 1, width: 2, height: 2 } // cells 5,6,9,10

  it('a single layer gives the plain selection without parts', () => {
    const s = sampleSelection([ground], MAP_W, box)
    expect(s.layers).toBeUndefined()
    expect(s.tiles).toEqual([t(1), t(2), null, null])
  })

  it('several layers keep one part each and a composite', () => {
    const s = sampleSelection([col, ground], MAP_W, box)
    expect(s.layers?.map((p) => p.layerId)).toEqual(['col', 'ground'])
    expect(s.layers?.[0].tiles).toEqual([COL, null, COL, null])
    expect(s.layers?.[1].tiles).toEqual([t(1), t(2), null, null])
    // a real tile wins over the collision marker; the marker shows where nothing else is
    expect(s.tiles).toEqual([t(1), t(2), COL, null])
  })

  it('an empty layer list gives an empty selection of the right size', () => {
    expect(sampleSelection([], MAP_W, box).tiles).toEqual([null, null, null, null])
  })
})

describe('targetLayerIndex', () => {
  const layers = [makeLayer('x', { type: 'collision' }), makeLayer('y')]
  it('prefers the layer it came from, then the first of the same type', () => {
    expect(targetLayerIndex(layers, { layerId: 'y', layerType: 'tile', name: 'y', tiles: [] })).toBe(1)
    expect(targetLayerIndex(layers, { layerId: 'deleted', layerType: 'tile', name: 'z', tiles: [] })).toBe(1)
    expect(targetLayerIndex(layers, { layerId: 'deleted', layerType: 'terrain', name: 'z', tiles: [] })).toBe(-1)
  })
})

describe('fitSelectionToLayer', () => {
  const plain: TileSelection = { width: 1, height: 1, tiles: [t(3)] }
  const marker: TileSelection = { width: 1, height: 1, tiles: [COL] }

  it('leaves a fitting selection untouched (same object)', () => {
    expect(fitSelectionToLayer('tile', plain)).toBe(plain)
    expect(fitSelectionToLayer('collision', marker)).toBe(marker)
  })

  it('paints the collision marker on a collision layer when the selection has none', () => {
    expect(fitSelectionToLayer('collision', plain)?.tiles).toEqual([COL])
  })

  it('keeps an empty sampled area on a collision layer, so painting it erases instead of drawing a block', () => {
    const empty: TileSelection = { width: 2, height: 2, tiles: [null, null, null, null] }
    expect(fitSelectionToLayer('collision', empty)).toBe(empty)
    expect(fitSelectionToLayer('tile', empty)).toBe(empty)
  })

  it('never lets the collision marker onto a tile layer', () => {
    expect(fitSelectionToLayer('tile', marker)).toBeNull()
    const mixed: TileSelection = { width: 2, height: 1, tiles: [t(1), COL] }
    expect(fitSelectionToLayer('tile', mixed)?.tiles).toEqual([t(1), null])
  })
})
