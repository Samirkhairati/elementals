import { StrictMode, useState, type ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { MapData } from '@/types/editor'
import { createSaveQueue } from '@/lib/saveQueue'
import { useMapAutosave } from '@/hooks/useMapAutosave'
import { makeEntity, makeMap } from '@/test/helpers'
import { PRESET_PREFABS } from '@/lib/componentRegistry'
import { useEntityManager } from './useEntityManager'

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>

function setup(initial: MapData = makeMap({ entities: [makeEntity('a'), makeEntity('b')] })) {
  const onCommitHistory = vi.fn()
  const save = vi.fn()
  const queue = createSaveQueue({ delayMs: 300 })

  const hook = renderHook(
    () => {
      const [activeMap, setActiveMap] = useState<MapData | null>(initial)
      const manager = useEntityManager({ activeMap, setActiveMap, onCommitHistory })
      useMapAutosave(activeMap, { queue, save })
      return { activeMap, setActiveMap, manager }
    },
    { wrapper }
  )
  return { ...hook, onCommitHistory, save, queue }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useEntityManager (StrictMode)', () => {
  it('createEntity: one history commit, one save, new entity selected', () => {
    const { result, onCommitHistory, save } = setup()
    act(() => result.current.manager.createEntity('Hero', 32, 64))

    expect(onCommitHistory).toHaveBeenCalledTimes(1)
    const created = result.current.manager.entities[2]
    expect(created).toMatchObject({ name: 'Hero', x: 32, y: 64, folder: null })
    expect(created.components.Transform).toMatchObject({ x: 32, y: 64 })
    expect(result.current.manager.selectedEntityId).toBe(created.id)
    expect(result.current.activeMap?.entities).toHaveLength(3)

    act(() => vi.advanceTimersByTime(300))
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0].entities).toHaveLength(3)
  })

  it('createEntity from a prefab puts Transform at the placement, with fresh event ids', () => {
    const { result } = setup()
    const chest = PRESET_PREFABS.find((p) => p.id === 'chest')!
    act(() => result.current.manager.createEntity('Chest', 80, 96, chest.components))
    const created = result.current.manager.entities[2]
    expect(created.x).toBe(80)
    expect(created.components.Transform).toMatchObject({ x: 80, y: 96 })
    expect(created.components.Event?.pages).toHaveLength(2)
    expect(created.components.Sprite).toMatchObject({ asset: 'objects/chest' })
  })

  it('addComponent creates schema defaults (Event gets a first page, Collider is one tile)', () => {
    const { result } = setup()
    act(() => result.current.manager.addComponent('a', 'Event'))
    act(() => result.current.manager.addComponent('a', 'Collider'))
    act(() => result.current.manager.addComponent('b', 'Event'))
    const [a, b] = result.current.manager.entities
    expect(a.components.Event?.pages).toHaveLength(1)
    expect(a.components.Event?.pages[0]).toMatchObject({ trigger: 'action', commands: [] })
    expect(a.components.Collider).toMatchObject({ width: 32, height: 32, isSolid: true })
    expect(b.components.Event?.pages[0].id).not.toBe(a.components.Event?.pages[0].id)
    // singleton: adding twice keeps the first
    const before = result.current.manager.entities[0].components.Event
    act(() => result.current.manager.addComponent('a', 'Event'))
    expect(result.current.manager.entities[0].components.Event).toBe(before)
  })

  it('duplicateEntity gives the copy its own event page ids', () => {
    const { result } = setup()
    act(() => result.current.manager.addComponent('a', 'Event'))
    act(() => result.current.manager.duplicateEntity('a'))
    const [a, copy] = result.current.manager.entities
    expect(copy.name).toBe('a Copy')
    expect(copy.components.Event?.pages[0].id).not.toBe(a.components.Event?.pages[0].id)
    expect(copy.components.Event?.pages).toHaveLength(1)
  })

  it('createEntity names blank entities "Entity N" and honours the folder', () => {
    const { result } = setup(makeMap({ entities: [makeEntity('x', { name: 'Entity 1' })] }))
    act(() => result.current.manager.createEntity('  ', 0, 0, undefined, 'folder-1'))
    const created = result.current.manager.entities[1]
    expect(created.name).toBe('Entity 2')
    expect(created.folder).toBe('folder-1')
  })

  it('two mutations in one tick compose (no lost update)', () => {
    const { result, onCommitHistory } = setup()
    act(() => {
      result.current.manager.renameEntity('a', 'Alpha')
      result.current.manager.renameEntity('b', 'Beta')
    })
    expect(result.current.manager.entities.map(e => e.name)).toEqual(['Alpha', 'Beta'])
    expect(result.current.activeMap?.entities?.map(e => e.name)).toEqual(['Alpha', 'Beta'])
    expect(onCommitHistory).toHaveBeenCalledTimes(2)
    // the latest commit already sees both changes
    expect(result.current.manager.getEntities().map(e => e.name)).toEqual(['Alpha', 'Beta'])
  })

  it('duplicateEntity inserts a copy after the original and selects it', () => {
    const { result, onCommitHistory } = setup(
      makeMap({ entities: [makeEntity('a', { x: 10, y: 20, components: { Transform: { x: 10, y: 20 } } }), makeEntity('b')] })
    )
    act(() => result.current.manager.duplicateEntity('a'))
    const list = result.current.manager.entities
    expect(list.map(e => e.name)).toEqual(['a', 'a Copy', 'b'])
    expect(list[1]).toMatchObject({ x: 26, y: 36 })
    expect(list[1].components.Transform).toMatchObject({ x: 26, y: 36 })
    expect(list[1].components.Transform).not.toBe(list[0].components.Transform)
    expect(result.current.manager.selectedEntityId).toBe(list[1].id)
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
  })

  it('duplicateEntity of an unknown id is a no-op (no commit)', () => {
    const { result, onCommitHistory } = setup()
    act(() => result.current.manager.duplicateEntity('nope'))
    expect(onCommitHistory).not.toHaveBeenCalled()
  })

  it('deleteEntity reselects the first remaining entity only when the selected one was deleted', () => {
    const { result, onCommitHistory, save } = setup(
      makeMap({ entities: [makeEntity('a'), makeEntity('b'), makeEntity('c')] })
    )
    act(() => result.current.manager.setSelectedEntityId('b'))
    act(() => result.current.manager.deleteEntity('b'))
    expect(result.current.manager.entities.map(e => e.id)).toEqual(['a', 'c'])
    expect(result.current.manager.selectedEntityId).toBe('a')
    expect(onCommitHistory).toHaveBeenCalledTimes(1)

    act(() => result.current.manager.deleteEntity('c'))
    expect(result.current.manager.selectedEntityId).toBe('a') // unrelated deletion keeps selection

    act(() => result.current.manager.deleteEntity('a'))
    expect(result.current.manager.selectedEntityId).toBeNull()

    act(() => vi.advanceTimersByTime(300))
    expect(save).toHaveBeenCalledTimes(1) // three mutations, one debounced save
    expect(save.mock.calls[0][0].entities).toEqual([])
  })

  it('moveEntity updates x/y on the entity and its Transform', () => {
    const { result, onCommitHistory } = setup()
    act(() => result.current.manager.moveEntity('a', 96, 128))
    const a = result.current.manager.entities.find(e => e.id === 'a')!
    expect(a).toMatchObject({ x: 96, y: 128 })
    expect(a.components.Transform).toMatchObject({ x: 96, y: 128 })
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
  })

  it('updateComponentProp keeps entity x/y in sync for Transform', () => {
    const { result, onCommitHistory, save } = setup()
    act(() => result.current.manager.updateComponentProp('a', 'Transform', 'x', '48'))
    const a = result.current.manager.entities.find(e => e.id === 'a')!
    expect(a.x).toBe(48)
    expect(a.components.Transform?.x).toBe('48')
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(300))
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('updateComponentProps applies several props in a single commit', () => {
    const { result, onCommitHistory } = setup(
      makeMap({ entities: [makeEntity('a', { components: { Collider: { width: 1, height: 1, offsetX: 0, offsetY: 0, isSolid: true } } })] })
    )
    act(() =>
      result.current.manager.updateComponentProps('a', 'Collider', { width: 64, height: 32, offsetX: 4, offsetY: 8 })
    )
    expect(result.current.manager.entities[0].components.Collider).toEqual({
      width: 64,
      height: 32,
      offsetX: 4,
      offsetY: 8,
      isSolid: true,
    })
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
  })

  it('add/removeComponent', () => {
    const { result } = setup()
    act(() => result.current.manager.addComponent('a', 'Collider'))
    expect(result.current.manager.entities[0].components.Collider).toBeDefined()
    act(() => result.current.manager.removeComponent('a', 'Collider'))
    expect(result.current.manager.entities[0].components.Collider).toBeUndefined()
  })

  it('toggleEntityVisibility / moveEntityToFolder / reorderEntities commit once each', () => {
    const { result, onCommitHistory } = setup()
    act(() => result.current.manager.toggleEntityVisibility('a'))
    expect(result.current.manager.entities[0].visible).toBe(false)
    act(() => result.current.manager.moveEntityToFolder('a', 'f1'))
    expect(result.current.manager.entities[0].folder).toBe('f1')
    act(() => result.current.manager.reorderEntities([...result.current.manager.entities].reverse()))
    expect(result.current.manager.entities.map(e => e.id)).toEqual(['b', 'a'])
    expect(onCommitHistory).toHaveBeenCalledTimes(3)
  })

  describe('folders', () => {
    it('create / rename / toggle commit to the map and save, but never to history', () => {
      const { result, onCommitHistory, save } = setup()
      act(() => result.current.manager.createEntityFolder())
      const folder = result.current.manager.entityFolders[0]
      expect(folder).toMatchObject({ name: 'Folder 1', expanded: true, visible: true })
      expect(result.current.activeMap?.entityFolders).toHaveLength(1)

      act(() => result.current.manager.renameEntityFolder(folder.id, '  NPCs '))
      expect(result.current.manager.entityFolders[0].name).toBe('NPCs')

      act(() => result.current.manager.toggleEntityFolderExpanded(folder.id))
      expect(result.current.manager.entityFolders[0].expanded).toBe(false)
      act(() => result.current.manager.toggleEntityFolderVisibility(folder.id))
      expect(result.current.manager.entityFolders[0].visible).toBe(false)

      expect(onCommitHistory).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(300))
      expect(save).toHaveBeenCalledTimes(1)
      expect(save.mock.calls[0][0].entityFolders[0]).toMatchObject({ name: 'NPCs', expanded: false, visible: false })
    })

    it('numbers default folder names', () => {
      const { result } = setup()
      act(() => result.current.manager.createEntityFolder())
      act(() => result.current.manager.createEntityFolder())
      expect(result.current.manager.entityFolders.map(f => f.name)).toEqual(['Folder 1', 'Folder 2'])
    })

    it('deleteEntityFolder removes the folder and un-folders its entities (one history step)', () => {
      const { result, onCommitHistory } = setup(
        makeMap({
          entities: [makeEntity('a', { folder: 'f1' }), makeEntity('b', { folder: 'f2' })],
          entityFolders: [{ id: 'f1', name: 'one' }, { id: 'f2', name: 'two' }],
        })
      )
      act(() => result.current.manager.deleteEntityFolder('f1'))
      expect(result.current.manager.entityFolders.map(f => f.id)).toEqual(['f2'])
      expect(result.current.manager.entities.map(e => e.folder)).toEqual([null, 'f2'])
      expect(result.current.activeMap?.entityFolders?.map(f => f.id)).toEqual(['f2'])
      expect(result.current.activeMap?.entities?.map(e => e.folder)).toEqual([null, 'f2'])
      expect(onCommitHistory).toHaveBeenCalledTimes(1)
    })
  })

  it('re-syncs entities/folders and clears a stale selection when the active map is replaced', () => {
    const { result } = setup()
    act(() => result.current.manager.setSelectedEntityId('a'))
    const other = makeMap({
      fileName: 'other.json',
      entities: [makeEntity('z')],
      entityFolders: [{ id: 'f9', name: 'nine' }],
    })
    act(() => result.current.setActiveMap(other))
    expect(result.current.manager.entities.map(e => e.id)).toEqual(['z'])
    expect(result.current.manager.entityFolders.map(f => f.id)).toEqual(['f9'])
    expect(result.current.manager.selectedEntityId).toBeNull()
  })

  it('keeps the selection when the active map is replaced by one that still contains it', () => {
    const { result } = setup()
    act(() => result.current.manager.setSelectedEntityId('b'))
    act(() => result.current.setActiveMap(makeMap({ fileName: 'other.json', entities: [makeEntity('b')] })))
    expect(result.current.manager.selectedEntityId).toBe('b')
  })
})
