import { StrictMode, type ReactNode } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { commandNodes } from '../../../../shared/engine/graph'
import { mapSaveQueue } from '@/lib/saveQueue'
import { installElectronAPI, makeEntity, makeLayer, makeMap, uninstallElectronAPI } from '@/test/helpers'
import { useMapManager } from './useMapManager'

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>

afterEach(() => {
  uninstallElectronAPI()
  vi.restoreAllMocks()
})

describe('useMapManager', () => {
  it('setActiveMap mirrors into maps exactly once per update and supports functional updates', () => {
    const a = makeMap({ fileName: 'a.json' })
    const b = makeMap({ fileName: 'b.json' })
    const { result } = renderHook(() => useMapManager(), { wrapper })
    act(() => result.current.setMaps([a, b]))
    act(() => result.current.setActiveMap(a))
    expect(result.current.activeMap).toBe(a)
    act(() => {
      result.current.setActiveMap(m => (m ? { ...m, layers: [makeLayer('X')] } : m))
      result.current.setActiveMap(m => (m ? { ...m, name: 'renamed' } : m))
    })
    expect(result.current.activeMap).toMatchObject({ name: 'renamed', layers: [{ id: 'X' }] })
    expect(result.current.maps[0]).toBe(result.current.activeMap)
    expect(result.current.maps[1]).toBe(b)
    expect(result.current.getActiveMap()).toBe(result.current.activeMap)
  })

  it('onSelectMap activates the map and reports its layers/entities once', () => {
    const onMapSelected = vi.fn()
    const map = makeMap({ layers: [makeLayer('L')], entities: [] })
    const { result } = renderHook(() => useMapManager({ onMapSelected }), { wrapper })
    act(() => result.current.onSelectMap(map))
    expect(result.current.activeMap).toBe(map)
    expect(onMapSelected).toHaveBeenCalledTimes(1)
    expect(onMapSelected).toHaveBeenCalledWith(map.layers, map.entities)
  })

  it('onSelectMap migrates legacy entities and stamps the current schemaVersion', () => {
    const onMapSelected = vi.fn()
    const legacy = makeMap({
      schemaVersion: undefined,
      entities: [
        makeEntity('sign', {
          components: { Transform: { x: 0, y: 0, depth: 10 }, Interactable: { type: 'on_interact', message: 'hello', eventKey: '' } },
        } as never),
      ],
    })
    delete (legacy as { schemaVersion?: number }).schemaVersion
    const { result } = renderHook(() => useMapManager({ onMapSelected }), { wrapper })
    act(() => result.current.onSelectMap(legacy))
    const active = result.current.activeMap!
    expect(active.schemaVersion).toBe(4)
    expect(Object.keys(active.entities![0].components)).toEqual(['Transform', 'Event'])
    expect(commandNodes(active.entities![0].components.Event!.states[0].graph)[0]).toMatchObject({ type: 'showText', params: { text: 'hello' } })
    expect(legacy.entities![0].components).toHaveProperty('Interactable') // input untouched
    expect(onMapSelected).toHaveBeenCalledWith(active.layers, active.entities)
  })

  it('loadMaps migrates every map it loads', async () => {
    const legacy = {
      ...makeMap({ fileName: 'old.json' }),
      entities: [makeEntity('p', { components: { Transform: { x: 0, y: 0 }, PlayerControl: {}, SpriteView: { texture: 'player-walk' } } } as never)],
    }
    delete (legacy as { schemaVersion?: number }).schemaVersion
    installElectronAPI({ getMaps: () => Promise.resolve({ success: true, folders: [], maps: [legacy] }) })
    const { result } = renderHook(() => useMapManager(), { wrapper })
    await act(async () => {
      await result.current.loadMaps()
    })
    const loaded = result.current.maps[0]
    expect(loaded.schemaVersion).toBe(4)
    expect(loaded.entities![0].components.Movement).toMatchObject({ controller: 'player' })
    expect(loaded.entities![0].components.Sprite).toMatchObject({ asset: 'characters/player' })
  })

  it('already canonical maps are used as they are (same object, no churn)', async () => {
    const map = makeMap({ entities: [makeEntity('a')] })
    installElectronAPI({ getMaps: () => Promise.resolve({ success: true, folders: [], maps: [map] }) })
    const { result } = renderHook(() => useMapManager(), { wrapper })
    await act(async () => {
      await result.current.loadMaps()
    })
    expect(result.current.maps[0]).toBe(map)
  })

  it('flushes pending autosaves before deleting a map, and clears the active map afterwards', async () => {
    const order: string[] = []
    installElectronAPI({
      deleteMap: () => {
        order.push('delete')
        return Promise.resolve({ success: true })
      },
      getMaps: () => Promise.resolve({ success: true, folders: [], maps: [] }),
    })
    mapSaveQueue.schedule('/test.json', () => {
      order.push('save')
    })

    const onClearActiveMap = vi.fn()
    let confirm: (() => void) | undefined
    const map = makeMap()
    const { result } = renderHook(
      () =>
        useMapManager({
          onClearActiveMap,
          onOpenConfirmDialog: cfg => {
            confirm = cfg.action
          },
        }),
      { wrapper }
    )
    act(() => result.current.setMaps([map]))
    act(() => result.current.setActiveMap(map))
    act(() => result.current.handleDeleteMap(null, 'test.json'))
    await act(async () => {
      await confirm!()
    })
    expect(order).toEqual(['save', 'delete'])
    expect(result.current.activeMap).toBeNull()
    expect(onClearActiveMap).toHaveBeenCalledTimes(1)
    expect(result.current.deletedMapsHistory).toHaveLength(1)
  })

  it('flushes pending autosaves before moving a map', async () => {
    const order: string[] = []
    installElectronAPI({
      moveMap: () => {
        order.push('move')
        return Promise.resolve({ success: true })
      },
      getMaps: () => Promise.resolve({ success: true, folders: [], maps: [] }),
    })
    mapSaveQueue.schedule('/x.json', () => {
      order.push('save')
    })
    const { result } = renderHook(() => useMapManager(), { wrapper })
    const data: Record<string, string> = { mapFileName: 'x.json', mapSourceFolder: 'null' }
    await act(async () => {
      await result.current.handleMapDrop(
        { preventDefault() {}, dataTransfer: { getData: (k: string) => data[k] } } as unknown as React.DragEvent,
        'target'
      )
    })
    expect(order).toEqual(['save', 'move'])
  })

  it('undoDeleteMap restores the file with a direct save and re-selects it', async () => {
    const saveMap = vi.fn(() => Promise.resolve({ success: true }))
    installElectronAPI({
      saveMap,
      getMaps: () => Promise.resolve({ success: true, folders: [], maps: [] }),
      deleteMap: () => Promise.resolve({ success: true }),
    })
    let confirm: (() => void) | undefined
    const map = makeMap()
    const { result } = renderHook(
      () => useMapManager({ onOpenConfirmDialog: cfg => { confirm = cfg.action } }),
      { wrapper }
    )
    act(() => result.current.setMaps([map]))
    act(() => result.current.handleDeleteMap(null, 'test.json'))
    await act(async () => {
      await confirm!()
    })
    await act(async () => {
      await result.current.undoDeleteMap()
    })
    expect(saveMap).toHaveBeenCalledWith(null, 'test.json', map)
    expect(result.current.activeMap).toBe(map)
  })
  it('loadMaps refreshes the active map name after a rename so autosave cannot revert it', async () => {
    const map = makeMap({ name: 'old name' })
    installElectronAPI({
      getMaps: () =>
        Promise.resolve({ success: true, folders: [], maps: [{ ...map, name: 'new name' }] }),
    })
    const { result } = renderHook(() => useMapManager(), { wrapper })
    act(() => result.current.setActiveMap(map))
    await act(async () => {
      await result.current.loadMaps()
    })
    expect(result.current.activeMap).toMatchObject({ name: 'new name', fileName: map.fileName })
    // other fields (unsaved edits) are kept untouched
    expect(result.current.activeMap?.layers).toBe(map.layers)
  })
})
