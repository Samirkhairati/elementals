import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/editor'
import { editImageLayer, imageLayerState, withImagesAndGroups } from './imageLayerEdit'

const img = (id: string) => ({ id, x: 0, y: 0, assetId: 'a' })
const layers: Layer[] = [
  { id: 't', name: 'Tiles', type: 'tile', visible: true, locked: false, data: {} } as Layer,
  { id: 'i', name: 'Pics', type: 'image', visible: true, locked: false, images: [img('1')] } as Layer,
  { id: 'L', name: 'Locked', type: 'image', visible: true, locked: true, images: [] } as Layer,
]

describe('editImageLayer', () => {
  it('replaces only the edited image layer', () => {
    const next = editImageLayer(layers, 'i', (layer, images) => ({ ...layer, images: [...images, img('2')] }))
    expect(next).not.toBe(layers)
    expect(next[0]).toBe(layers[0])
    expect(next[1].images?.map((i) => i.id)).toEqual(['1', '2'])
  })

  it('gives the same array back when nothing changes', () => {
    expect(editImageLayer(layers, 'i', () => null)).toBe(layers)
    expect(editImageLayer(layers, 'i', (layer) => layer)).toBe(layers)
    expect(editImageLayer(layers, 't', (layer) => ({ ...layer }))).toBe(layers) // not an image layer
    expect(editImageLayer(layers, 'nope', (layer) => ({ ...layer }))).toBe(layers)
    expect(editImageLayer(layers, 'L', (layer) => ({ ...layer }), { skipLocked: true })).toBe(layers)
    expect(editImageLayer(layers, 'L', (layer) => ({ ...layer }))).not.toBe(layers)
  })
})

describe('withImagesAndGroups', () => {
  it('drops an empty group list and keeps a non-empty one', () => {
    const grouped = { ...layers[1], groups: [{ id: 'g', name: 'G' }] } as Layer
    expect('groups' in withImagesAndGroups(grouped, [], [])).toBe(false)
    expect(withImagesAndGroups(layers[1], [], [{ id: 'h', name: 'H' }]).groups).toEqual([{ id: 'h', name: 'H' }])
  })
})

describe('imageLayerState', () => {
  it('never returns undefined lists', () => {
    expect(imageLayerState({ ...layers[1], images: undefined } as Layer)).toEqual({ images: [], groups: [] })
  })
})
