import { StrictMode, type ReactNode } from 'react'
import { entityView } from '@/lib/sceneIndex'
import { SCHEMA_VERSION } from '../../../../shared/engine/types'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { commandNodes } from '../../../../shared/engine/graph'
import { mapSaveQueue } from '@/lib/saveQueue'
import type { EntityNode } from '../../../../shared/sceneTree'
import { allEntities } from '../../../../shared/sceneTree'
import { installElectronAPI, makeEntity, makeLayer, makeMap, uninstallElectronAPI } from '@/test/helpers'
import { useMapManager } from './useMapManager'
import { ENTITIES_GROUP_ID } from '../../../../shared/sceneTreeMigrate'

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
      result.current.setActiveMap(m => (m ? { ...m, nodes: [makeLayer('X')] } : m))
      result.current.setActiveMap(m => (m ? { ...m, name: 'renamed' } : m))
    })
    expect(result.current.activeMap).toMatchObject({ name: 'renamed', nodes: [{ id: 'X' }] })
    expect(result.current.maps[0]).toBe(result.current.activeMap)
    expect(result.current.maps[1]).toBe(b)
    expect(result.current.getActiveMap()).toBe(result.current.activeMap)
  })

  it('onSelectMap activates the map and reports it once', () => {
    const onMapSelected = vi.fn()
    const map = makeMap({ nodes: [makeLayer('L')] })
    const { result } = renderHook(() => useMapManager({ onMapSelected }), { wrapper })
    act(() => result.current.onSelectMap(map))
    expect(result.current.activeMap).toBe(map)
    expect(onMapSelected).toHaveBeenCalledTimes(1)
    expect(onMapSelected).toHaveBeenCalledWith(map)
  })

  // An old map (schema 5: layers, entities, entity folders) as it is on disk.
  const legacyMap = (extra: Record<string, unknown> = {}) => ({
    name: 'Old',
    fileName: 'old.json',
    folderPath: null,
    width: 4,
    height: 4,
    layers: [{ id: 'g', name: 'ground', type: 'tile', visible: true, locked: false }],
    entities: [{ id: 'sign', name: 'Sign', x: 16, y: 32, components: { Transform: { x: 16, y: 32, depth: 10 }, Interactable: { type: 'on_interact', message: 'hello', eventKey: '' } } }],
    ...extra,
  })
  // as the entity code reads it: the node with all its components (its child nodes')
  const entityOf = (m: { nodes: unknown[] }, id: string) => entityView(allEntities(m.nodes as never).find((e) => e.id === id) as EntityNode)

  it('onSelectMap migrates an old map to the scene tree (entities canonical, current schema)', () => {
    const onMapSelected = vi.fn()
    const legacy = legacyMap({ schemaVersion: 2 }) as never as ReturnType<typeof makeMap>
    const { result } = renderHook(() => useMapManager({ onMapSelected }), { wrapper })
    act(() => result.current.onSelectMap(legacy))
    const active = result.current.activeMap!
    expect(active.schemaVersion).toBe(SCHEMA_VERSION)
    expect(active).not.toHaveProperty('layers')
    expect(active).not.toHaveProperty('entities')
    expect(active.nodes.map((n) => [n.type, n.name])).toEqual([['tile', 'ground'], ['group', 'Entities']])
    const sign = entityOf(active, 'sign')
    expect(Object.keys(sign.components)).toEqual(['Transform', 'Event'])
    expect(commandNodes((sign.components.Event as never as { states: { graph: never }[] }).states[0].graph)[0]).toMatchObject({ type: 'showText', params: { text: 'hello' } })
    expect(legacy as unknown as { entities: { components: object }[] }).toHaveProperty('entities.0.components.Interactable') // input untouched
    expect(onMapSelected).toHaveBeenCalledWith(active)
  })

  it('loadMaps migrates every map it loads, without writing anything back', async () => {
    const legacy = legacyMap({ entities: [{ id: 'p', name: 'p', x: 0, y: 0, components: { Transform: { x: 0, y: 0 }, PlayerControl: {}, SpriteView: { texture: 'player-walk' } } }] })
    const saveMap = vi.fn(() => Promise.resolve({ success: true }))
    installElectronAPI({ saveMap, getMaps: () => Promise.resolve({ success: true, folders: [], maps: [legacy] }) })
    const { result } = renderHook(() => useMapManager(), { wrapper })
    await act(async () => {
      await result.current.loadMaps()
    })
    const loaded = result.current.maps[0]
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION)
    expect(entityOf(loaded, 'p').components.Movement).toMatchObject({ controller: 'player' })
    expect(entityOf(loaded, 'p').components.Sprite).toMatchObject({ asset: 'characters/player' })
    expect(saveMap).not.toHaveBeenCalled()
  })

  it('loads a schema 6 tree as the same tree, typed (its nodes keep their ids and order)', async () => {
    const v6 = {
      name: 'Tree',
      fileName: 'tree.json',
      folderPath: null,
      width: 4,
      height: 4,
      schemaVersion: 6,
      nodes: [
        { id: 'a', type: 'tile', name: 'ground', data: {} },
        { id: ENTITIES_GROUP_ID, type: 'group', name: 'Entities', children: [] },
      ],
    }
    installElectronAPI({ getMaps: () => Promise.resolve({ success: true, folders: [], maps: [v6] }) })
    const { result } = renderHook(() => useMapManager(), { wrapper })
    await act(async () => {
      await result.current.loadMaps()
    })
    const loaded = result.current.maps[0]
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION)
    expect(loaded.nodes.map((n) => [n.id, n.type])).toEqual([['a', 'tile'], [ENTITIES_GROUP_ID, 'group']])
    expect(loaded.nodes[0]).toMatchObject({ children: [] })
  })

  it('already canonical maps are used as they are (same object, no churn)', async () => {
    const map = makeMap({ nodes: [makeEntity('a')] })
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
    expect(result.current.activeMap?.nodes).toBe(map.nodes)
  })
})
