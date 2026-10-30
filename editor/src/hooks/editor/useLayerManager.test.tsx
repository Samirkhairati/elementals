import { StrictMode, useState, type ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Layer, MapData } from '@/types/editor'
import { createSaveQueue } from '@/lib/saveQueue'
import { useMapAutosave } from '@/hooks/useMapAutosave'
import { makeLayer, makeMap } from '@/test/helpers'
import { useLayerManager } from './useLayerManager'

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>

function setup(initialLayers: Layer[] = [makeLayer('L1', { name: 'Layer 1' })]) {
  const onCommitHistory = vi.fn()
  const save = vi.fn()
  const queue = createSaveQueue({ delayMs: 300 })
  const initial: MapData = makeMap({ layers: initialLayers })

  const hook = renderHook(
    () => {
      const [activeMap, setActiveMap] = useState<MapData | null>(initial)
      const manager = useLayerManager({ setActiveMap, onCommitHistory })
      useMapAutosave(activeMap, { queue, save })
      return { activeMap, manager }
    },
    { wrapper }
  )
  // load the initial layers like onMapSelected does
  act(() => {
    hook.result.current.manager.setLayers(initialLayers)
    hook.result.current.manager.setActiveLayerId(initialLayers[0]?.id ?? null)
  })
  return { ...hook, onCommitHistory, save, queue }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useLayerManager (StrictMode)', () => {
  it('creating a tile layer commits history once, mirrors into the map, selects it and saves once', () => {
    const { result, onCommitHistory, save } = setup()
    act(() => result.current.manager.handleCreateLayer())

    expect(onCommitHistory).toHaveBeenCalledTimes(1)
    const layers = result.current.manager.layers
    expect(layers).toHaveLength(2)
    expect(layers[0]).toMatchObject({ name: 'Layer 2', type: 'tile' })
    expect(result.current.manager.activeLayerId).toBe(layers[0].id)
    expect(result.current.activeMap?.layers).toBe(layers)

    act(() => vi.advanceTimersByTime(300))
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('exposes the latest layers synchronously via getLayers, and passes them to onCommitHistory', () => {
    const { result, onCommitHistory } = setup()
    act(() => {
      result.current.manager.handleCreateLayerOfType('objects')
      expect(result.current.manager.getLayers().map(l => l.name)).toEqual(['Objects', 'Layer 1'])
      result.current.manager.handleRenameLayer('L1', 'Ground')
      expect(result.current.manager.getLayers().map(l => l.name)).toEqual(['Objects', 'Ground'])
    })
    expect(onCommitHistory).toHaveBeenCalledTimes(2)
    expect(onCommitHistory.mock.calls[1][0].map((l: Layer) => l.name)).toEqual(['Objects', 'Ground'])
  })

  it('keeps special layers above new tile layers and enforces singletons', () => {
    const { result, onCommitHistory } = setup()
    act(() => result.current.manager.handleCreateLayerOfType('collision'))
    act(() => result.current.manager.handleCreateLayerOfType('collision')) // duplicate -> ignored
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
    act(() => result.current.manager.handleCreateLayerOfType('tile'))
    expect(result.current.manager.layers.map(l => l.type)).toEqual(['collision', 'tile', 'tile'])
  })

  it('duplicates a layer with an independent copy of its data and selects it', () => {
    const { result } = setup([makeLayer('L1', { data: { 0: { tilesetId: 't', x: 1, y: 1 } } })])
    act(() => result.current.manager.handleDuplicateLayer('L1'))
    const [orig, copy] = result.current.manager.layers
    expect(copy.name).toBe('L1 Copy')
    expect(copy.data).toEqual(orig.data)
    expect(copy.data).not.toBe(orig.data)
    expect(result.current.manager.activeLayerId).toBe(copy.id)
  })

  it('deleting the active layer re-selects the first remaining; deleting another keeps selection', () => {
    const { result, onCommitHistory } = setup([makeLayer('A'), makeLayer('B'), makeLayer('C')])
    act(() => result.current.manager.setActiveLayerId('B'))
    act(() => result.current.manager.handleDeleteLayer('C'))
    expect(result.current.manager.activeLayerId).toBe('B')
    act(() => result.current.manager.handleDeleteLayer('B'))
    expect(result.current.manager.activeLayerId).toBe('A')
    expect(onCommitHistory).toHaveBeenCalledTimes(2)
  })

  it('toggle visibility / lock and reorder each commit once', () => {
    const { result, onCommitHistory } = setup([makeLayer('A'), makeLayer('B')])
    act(() => result.current.manager.toggleLayerVisibility('A'))
    act(() => result.current.manager.toggleLayerLock('A'))
    act(() => result.current.manager.handleReorderLayers([...result.current.manager.layers].reverse()))
    expect(result.current.manager.layers.map(l => l.id)).toEqual(['B', 'A'])
    expect(result.current.manager.layers[1]).toMatchObject({ visible: false, locked: true })
    expect(onCommitHistory).toHaveBeenCalledTimes(3)
  })

  it('blank rename is ignored', () => {
    const { result, onCommitHistory } = setup()
    act(() => result.current.manager.handleRenameLayer('L1', '   '))
    expect(onCommitHistory).not.toHaveBeenCalled()
  })

  it('switches to a virtual collision tile selection on collision layers and restores the previous one', () => {
    const { result } = setup([makeLayer('T'), makeLayer('C', { type: 'collision' })])
    const sel = { width: 1, height: 1, tiles: [{ tilesetId: 'ts', x: 2, y: 2 }] }
    act(() => result.current.manager.setTileSelection(sel))
    act(() => result.current.manager.setActiveLayerId('C'))
    expect(result.current.manager.tileSelection?.tiles[0]?.tilesetId).toBe('__collision__')
    act(() => result.current.manager.setActiveLayerId('T'))
    expect(result.current.manager.tileSelection).toEqual(sel)
  })
})
