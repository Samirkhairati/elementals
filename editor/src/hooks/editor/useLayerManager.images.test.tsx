import { StrictMode, useState, type ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Layer, MapData } from '@/types/editor'
import { makeLayer, makeMap } from '@/test/helpers'
import { useLayerManager } from './useLayerManager'

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>

function setup(initialLayers: Layer[] = [makeLayer('L1', { name: 'Layer 1' })]) {
  const onCommitHistory = vi.fn()
  const hook = renderHook(
    () => {
      const [activeMap, setActiveMap] = useState<MapData | null>(makeMap({ layers: initialLayers }))
      const manager = useLayerManager({ setActiveMap, onCommitHistory })
      return { activeMap, manager }
    },
    { wrapper }
  )
  act(() => {
    hook.result.current.manager.setLayers(initialLayers)
    hook.result.current.manager.setActiveLayerId(initialLayers[0]?.id ?? null)
  })
  return { ...hook, onCommitHistory }
}

const withImageLayer = () => setup([makeLayer('I1', { type: 'image', name: 'Images', images: [] }), makeLayer('L1')])

describe('useLayerManager: image layers', () => {
  it('creates an image layer named Images, below the special layers, then Images 2', () => {
    const { result } = setup([makeLayer('C', { type: 'collision' }), makeLayer('L1')])
    act(() => result.current.manager.handleCreateLayerOfType('image'))
    let layers = result.current.manager.layers
    expect(layers.map((l) => l.type)).toEqual(['collision', 'image', 'tile'])
    expect(layers[1]).toMatchObject({ name: 'Images', images: [] })
    expect(result.current.manager.activeLayerId).toBe(layers[1].id)

    act(() => result.current.manager.handleCreateLayerOfType('image'))
    layers = result.current.manager.layers
    expect(layers.some((l) => l.name === 'Images 2')).toBe(true)
  })

  it('adds an image, selects it and commits history once', () => {
    const { result, onCommitHistory } = withImageLayer()
    let id: string | null = null
    act(() => {
      id = result.current.manager.addImage('I1', { assetId: 'tree', x: 48, y: 64 })
    })
    expect(id).toBeTruthy()
    const layer = result.current.manager.layers.find((l) => l.id === 'I1')!
    expect(layer.images).toEqual([{ id, assetId: 'tree', x: 48, y: 64 }])
    expect(result.current.manager.selectedImageId).toBe(id)
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
    expect(result.current.activeMap?.layers).toBe(result.current.manager.layers)
  })

  it('refuses to add an image to a layer that is not an image layer', () => {
    const { result, onCommitHistory } = withImageLayer()
    act(() => {
      expect(result.current.manager.addImage('L1', { assetId: 'tree', x: 0, y: 0 })).toBeNull()
    })
    expect(onCommitHistory).not.toHaveBeenCalled()
  })

  it('updates an image, and does nothing (no history step) when nothing changes', () => {
    const { result, onCommitHistory } = withImageLayer()
    let id = ''
    act(() => {
      id = result.current.manager.addImage('I1', { assetId: 'tree', x: 10, y: 20 })!
    })
    onCommitHistory.mockClear()
    act(() => result.current.manager.updateImage('I1', id, { x: 10, y: 20 }))
    expect(onCommitHistory).not.toHaveBeenCalled()
    act(() => result.current.manager.updateImage('I1', id, { x: 11, z: 4, flipX: true }))
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
    expect(result.current.manager.layers[0].images![0]).toMatchObject({ x: 11, y: 20, z: 4, flipX: true })
  })

  it('deletes an image and clears its selection', () => {
    const { result } = withImageLayer()
    let id = ''
    act(() => {
      id = result.current.manager.addImage('I1', { assetId: 'tree', x: 0, y: 0 })!
    })
    act(() => result.current.manager.deleteImage('I1', id))
    expect(result.current.manager.layers[0].images).toEqual([])
    expect(result.current.manager.selectedImageId).toBeNull()
  })

  it('duplicating an image layer gives the copies new ids', () => {
    const { result } = withImageLayer()
    act(() => {
      result.current.manager.addImage('I1', { assetId: 'tree', x: 0, y: 0 })
    })
    act(() => result.current.manager.handleDuplicateLayer('I1'))
    const [original, copy] = result.current.manager.layers
    expect(copy.images).toHaveLength(1)
    expect(copy.images![0].id).not.toBe(original.images![0].id)
    expect(copy.images![0]).toMatchObject({ assetId: 'tree' })
  })

  it('placement mode starts, stops and ends on Escape', () => {
    const { result } = withImageLayer()
    act(() => result.current.manager.startImagePlacement({ assetId: 'tree' }))
    expect(result.current.manager.pendingImage).toEqual({ assetId: 'tree' })
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(result.current.manager.pendingImage).toBeNull()
  })
})

describe('useLayerManager: multi-layer selection and pin', () => {
  const three = () => setup([makeLayer('A'), makeLayer('B'), makeLayer('C')])

  it('Ctrl/Cmd+click adds layers to the selection, again removes, a plain click resets', () => {
    const { result } = three()
    expect(result.current.manager.activeLayerId).toBe('A')
    act(() => result.current.manager.selectLayer('B', true))
    expect(new Set(result.current.manager.selectedLayerIds)).toEqual(new Set(['A', 'B']))
    expect(result.current.manager.activeLayerId).toBe('B')
    act(() => result.current.manager.selectLayer('C', true))
    expect(new Set(result.current.manager.selectedLayerIds)).toEqual(new Set(['A', 'B', 'C']))
    act(() => result.current.manager.selectLayer('A', true))
    expect(new Set(result.current.manager.selectedLayerIds)).toEqual(new Set(['B', 'C']))
    act(() => result.current.manager.selectLayer('C'))
    expect(result.current.manager.selectedLayerIds).toEqual([])
    expect(result.current.manager.activeLayerId).toBe('C')
  })

  it('deleting a layer drops it from the selection', () => {
    const { result } = three()
    act(() => result.current.manager.selectLayer('B', true))
    act(() => result.current.manager.handleDeleteLayer('A'))
    expect(result.current.manager.selectedLayerIds).toEqual(['B'])
  })

  it('a pinned selection is not swapped for the collision marker when a collision layer is activated', () => {
    const { result } = setup([makeLayer('C', { type: 'collision' }), makeLayer('L1')])
    const multi = { width: 1, height: 1, tiles: [{ tilesetId: 'ts', x: 1, y: 0 }] }
    act(() => result.current.manager.setPinSelection(true))
    act(() => result.current.manager.setTileSelection(multi))
    act(() => result.current.manager.setActiveLayerId('C'))
    expect(result.current.manager.tileSelection).toBe(multi)
  })

  it('unpinned, a collision layer still gets the collision marker', () => {
    const { result } = setup([makeLayer('C', { type: 'collision' }), makeLayer('L1')])
    act(() => result.current.manager.setActiveLayerId('C'))
    expect(result.current.manager.tileSelection?.tiles[0]?.tilesetId).toBe('__collision__')
  })
})

describe('useLayerManager: Entities row position', () => {
  const withMap = (entitiesIndex?: number) => {
    const initial = [makeLayer('A'), makeLayer('B'), makeLayer('C')]
    const hook = renderHook(
      () => {
        const [activeMap, setActiveMap] = useState<MapData | null>(makeMap({ layers: initial, entitiesIndex }))
        const manager = useLayerManager({ setActiveMap })
        return { activeMap, manager }
      },
      { wrapper }
    )
    act(() => {
      hook.result.current.manager.setLayers(initial)
      hook.result.current.manager.setActiveLayerId('A')
    })
    return hook
  }

  it('is saved on the map, and clamped to the number of layers', () => {
    const { result } = withMap()
    expect(result.current.activeMap?.entitiesIndex).toBeUndefined() // untouched maps stay untouched
    act(() => result.current.manager.setEntitiesIndex(2))
    expect(result.current.activeMap?.entitiesIndex).toBe(2)
    act(() => result.current.manager.setEntitiesIndex(99))
    expect(result.current.activeMap?.entitiesIndex).toBe(3)
  })

  it('stays under the same layers when one is added above it, and on top by default', () => {
    const { result } = withMap(1) // under A
    act(() => result.current.manager.handleCreateLayerOfType('tile')) // new layer at the top
    expect(result.current.activeMap?.entitiesIndex).toBe(2) // still under A (now the 2nd layer)

    const fresh = withMap() // row on top
    act(() => fresh.result.current.manager.handleCreateLayerOfType('tile'))
    expect(fresh.result.current.activeMap?.entitiesIndex).toBeUndefined() // new layers appear under it
  })

  it('stays under the same layers when one above it is deleted', () => {
    const { result } = withMap(2) // under B
    act(() => result.current.manager.handleDeleteLayer('A'))
    expect(result.current.activeMap?.entitiesIndex).toBe(1)
  })
})
