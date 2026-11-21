import { StrictMode, type ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { MapData } from '@/types/editor'
import type { GroupNode, SceneNode } from '../../../../shared/sceneTree'
import { ENTITIES_GROUP_ID } from '../../../../shared/sceneTreeMigrate'
import { createSaveQueue } from '@/lib/saveQueue'
import { useMapAutosave } from '@/hooks/useMapAutosave'
import { makeEntity, makeGroup, makeLayer, makeMap } from '@/test/helpers'
import { useSceneHarness } from '@/test/sceneHarness'
import { PRESET_PREFABS } from '@/lib/componentRegistry'

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>

function setup(initial: MapData = makeMap({ nodes: [makeEntity('a'), makeEntity('b')] })) {
  const onCommitHistory = vi.fn()
  const save = vi.fn()
  const queue = createSaveQueue({ delayMs: 300 })

  const hook = renderHook(
    () => {
      const scene = useSceneHarness(initial, onCommitHistory)
      useMapAutosave(scene.activeMap, { queue, save })
      return { ...scene, manager: scene.entities }
    },
    { wrapper }
  )
  return { ...hook, onCommitHistory, save, queue }
}

/** The map with these nodes. */
const mapOf = (...nodes: SceneNode[]) => makeMap({ nodes })

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useEntityManager on the scene tree (StrictMode)', () => {
  it('createEntity: one history commit, one save, new entity selected', () => {
    const { result, onCommitHistory, save } = setup()
    act(() => result.current.manager.createEntity('Hero', 32, 64))

    expect(onCommitHistory).toHaveBeenCalledTimes(1)
    const created = result.current.manager.entities[2]
    expect(created).toMatchObject({ name: 'Hero', x: 32, y: 64 })
    expect(created.components.Transform).toMatchObject({ x: 32, y: 64 })
    expect(result.current.manager.selectedEntityId).toBe(created.id)
    expect(result.current.activeMap?.nodes).toHaveLength(3)

    act(() => vi.advanceTimersByTime(300))
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0].nodes).toHaveLength(3)
  })

  it('createEntity from a prefab puts Transform at the placement, with fresh event ids', () => {
    const { result } = setup()
    const chest = PRESET_PREFABS.find((p) => p.id === 'chest')!
    act(() => result.current.manager.createEntity('Chest', 80, 96, chest.components))
    const created = result.current.manager.entities[2]
    expect(created.x).toBe(80)
    expect(created.components.Transform).toMatchObject({ x: 80, y: 96 })
    expect(created.components.Event?.states).toHaveLength(2)
    expect(created.components.Sprite).toMatchObject({ asset: 'objects/chest' })
  })

  it('addComponent creates schema defaults (Event gets a first state, Collider is one tile)', () => {
    const { result } = setup()
    act(() => result.current.manager.addComponent('a', 'Event'))
    act(() => result.current.manager.addComponent('a', 'Collider'))
    act(() => result.current.manager.addComponent('b', 'Event'))
    const [a, b] = result.current.manager.entities
    expect(a.components.Event?.states).toHaveLength(1)
    expect(a.components.Event?.states[0]).toMatchObject({ trigger: 'interact' })
    expect(a.components.Event?.states[0].graph.nodes.map((n: { type: string }) => n.type)).toEqual(['start'])
    expect(a.components.Collider).toMatchObject({ width: 32, height: 32, isSolid: true })
    expect(b.components.Event?.states[0].id).not.toBe(a.components.Event?.states[0].id)
    // singleton: adding twice keeps the first
    const before = result.current.manager.entities[0].components.Event
    act(() => result.current.manager.addComponent('a', 'Event'))
    expect(result.current.manager.entities[0].components.Event).toBe(before)
  })

  it('duplicateEntity gives the copy its own event state ids', () => {
    const { result } = setup()
    act(() => result.current.manager.addComponent('a', 'Event'))
    act(() => result.current.manager.duplicateEntity('a'))
    const copy = result.current.manager.entities.find((e) => e.name === 'a Copy')!
    const a = result.current.manager.entities.find((e) => e.id === 'a')!
    expect(copy.components.Event?.states[0].id).not.toBe(a.components.Event?.states[0].id)
    expect(copy.components.Event?.states).toHaveLength(1)
  })

  it('createEntity names blank entities "Entity N"', () => {
    const { result } = setup(mapOf(makeEntity('x', { name: 'Entity 1' })))
    act(() => result.current.manager.createEntity('  ', 0, 0))
    expect(result.current.manager.entities[1].name).toBe('Entity 2')
  })

  it('two mutations in one tick compose (no lost update)', () => {
    const { result, onCommitHistory } = setup()
    act(() => {
      result.current.manager.renameEntity('a', 'Alpha')
      result.current.manager.renameEntity('b', 'Beta')
    })
    expect(result.current.manager.entities.map((e) => e.name)).toEqual(['Alpha', 'Beta'])
    expect(result.current.activeMap?.nodes.map((e) => e.name)).toEqual(['Alpha', 'Beta'])
    expect(onCommitHistory).toHaveBeenCalledTimes(2)
    // the latest commit already sees both changes
    expect(result.current.manager.getEntities().map((e) => e.name)).toEqual(['Alpha', 'Beta'])
  })

  it('duplicateEntity inserts a copy after the original and selects it', () => {
    const { result, onCommitHistory } = setup(mapOf(makeEntity('a', { x: 10, y: 20, components: { Transform: { x: 10, y: 20 } } }), makeEntity('b')))
    act(() => result.current.manager.duplicateEntity('a'))
    const list = result.current.manager.entities
    expect(list.map((e) => e.name)).toEqual(['a', 'a Copy', 'b'])
    expect(list[1]).toMatchObject({ x: 42, y: 52 })
    expect(list[1].components.Transform).toMatchObject({ x: 42, y: 52 })
    expect(list[1].components.Transform).not.toBe(list[0].components.Transform)
    expect(result.current.manager.selectedEntityId).toBe(list[1].id)
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
  })

  it('duplicateEntity of an unknown id is a no-op (no commit)', () => {
    const { result, onCommitHistory } = setup()
    act(() => result.current.manager.duplicateEntity('nope'))
    expect(onCommitHistory).not.toHaveBeenCalled()
  })

  it('deleteEntity drops the selection only when the selected one was deleted', () => {
    const { result, onCommitHistory, save } = setup(mapOf(makeEntity('a'), makeEntity('b'), makeEntity('c')))
    act(() => result.current.manager.setSelectedEntityId('b'))
    act(() => result.current.manager.deleteEntity('b'))
    expect(result.current.manager.entities.map((e) => e.id)).toEqual(['a', 'c'])
    expect(result.current.manager.selectedEntityId).toBeNull()
    expect(onCommitHistory).toHaveBeenCalledTimes(1)

    act(() => result.current.manager.setSelectedEntityId('a'))
    act(() => result.current.manager.deleteEntity('c'))
    expect(result.current.manager.selectedEntityId).toBe('a') // unrelated deletion keeps selection

    act(() => result.current.manager.deleteEntity('a'))
    expect(result.current.manager.selectedEntityId).toBeNull()

    act(() => vi.advanceTimersByTime(300))
    expect(save).toHaveBeenCalledTimes(1) // three mutations, one debounced save
    expect(save.mock.calls[0][0].nodes).toEqual([])
  })

  it('moveEntity updates x/y on the entity and its Transform', () => {
    const { result, onCommitHistory } = setup()
    act(() => result.current.manager.moveEntity('a', 96, 128))
    const a = result.current.manager.entities.find((e) => e.id === 'a')!
    expect(a).toMatchObject({ x: 96, y: 128 })
    expect(a.components.Transform).toMatchObject({ x: 96, y: 128 })
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
  })

  it('updateComponentProp keeps entity x/y in sync for Transform', () => {
    const { result, onCommitHistory, save } = setup()
    act(() => result.current.manager.updateComponentProp('a', 'Transform', 'x', '48'))
    const a = result.current.manager.entities.find((e) => e.id === 'a')!
    expect(a.x).toBe(48)
    expect(a.components.Transform?.x).toBe('48')
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(300))
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('updateComponentProps applies several props in a single commit', () => {
    const { result, onCommitHistory } = setup(mapOf(makeEntity('a', { components: { Collider: { width: 1, height: 1, offsetX: 0, offsetY: 0, isSolid: true } } })))
    act(() => result.current.manager.updateComponentProps('a', 'Collider', { width: 64, height: 32, offsetX: 4, offsetY: 8 }))
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

  it('toggleEntityVisibility commits once and keeps a hidden entity out of the shown ones', () => {
    const { result, onCommitHistory } = setup()
    act(() => result.current.manager.toggleEntityVisibility('a'))
    expect(result.current.manager.entities[0].visible).toBe(false)
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
    act(() => result.current.manager.toggleEntityVisibility('a'))
    expect(result.current.manager.entities[0]).not.toHaveProperty('visible')
  })

  it('setSelectedEntityId(null) brings back the layer that was active before the entity', () => {
    const { result } = setup(mapOf(makeLayer('L'), makeEntity('a')))
    act(() => result.current.layers.setActiveLayerId('L'))
    act(() => result.current.manager.setSelectedEntityId('a'))
    expect(result.current.manager.selectedEntityId).toBe('a')
    // the layer stays the active one while an entity is selected
    expect(result.current.layers.activeLayerId).toBe('L')
    act(() => result.current.manager.setSelectedEntityId(null))
    expect(result.current.manager.selectedEntityId).toBeNull()
    expect(result.current.layers.activeLayerId).toBe('L')
  })

  describe('where a new entity goes', () => {
    const tree = () => [
      makeLayer('L'),
      makeGroup(ENTITIES_GROUP_ID, [makeEntity('a')], { name: 'Entities' }),
      makeGroup('G', [makeEntity('b')], { name: 'G' }),
    ]
    const parentOf = (r: { current: ReturnType<typeof setup>['result']['current'] }, id: string) => r.current.tree.index.byId.get(id)!.ancestors.slice(-1)[0]?.id ?? null
    const newest = (r: { current: ReturnType<typeof setup>['result']['current'] }) => r.current.manager.entities.find((e) => !['a', 'b'].includes(e.id))!

    it('inside the selected group', () => {
      const { result } = setup(mapOf(...tree()))
      act(() => result.current.layers.select('G'))
      act(() => result.current.manager.createEntity('New', 0, 0))
      expect(parentOf(result, newest(result).id)).toBe('G')
      expect((result.current.tree.nodes[2] as GroupNode).children.map((n) => n.name)).toEqual(['b', 'New'])
    })

    it('inside the selected entity: it is a Node, so the new one becomes its child (as in Godot)', () => {
      const { result } = setup(mapOf(...tree()))
      act(() => result.current.manager.setSelectedEntityId('b'))
      act(() => result.current.manager.createEntity('New', 0, 0))
      expect(parentOf(result, newest(result).id)).toBe('b')
    })

    it('else in the Entities group when the map has one', () => {
      const { result } = setup(mapOf(...tree()))
      act(() => result.current.layers.select('L'))
      act(() => result.current.manager.createEntity('New', 0, 0))
      expect(parentOf(result, newest(result).id)).toBe(ENTITIES_GROUP_ID)
    })

    it('else on top of the root', () => {
      const { result } = setup(mapOf(makeLayer('L')))
      act(() => result.current.manager.createEntity('New', 0, 0))
      expect(parentOf(result, newest(result).id)).toBeNull()
      expect(result.current.tree.nodes.map((n) => n.id).slice(0, 1)).toEqual(['L'])
      expect(result.current.tree.nodes[1].type).toBe('entity')
    })
  })

  it('an entity in a hidden group is not among the shown ones, wherever it sits', () => {
    const { result } = setup(mapOf(makeGroup('G', [makeEntity('b')], { visible: false }), makeEntity('a')))
    act(() => result.current.manager.setSelectedEntityId('a'))
    expect(result.current.manager.entities.map((e) => e.id)).toEqual(['b', 'a']) // all of them, in tree order
  })

  it('the entities list keeps its identity while something else in the tree changes', () => {
    const { result } = setup(mapOf(makeLayer('L'), makeEntity('a')))
    const before = result.current.manager.entities
    act(() => result.current.layers.renameNode('L', 'Ground'))
    expect(result.current.manager.entities).toBe(before)
  })

  it('re-reads the entities and drops a stale selection when the open map is replaced', () => {
    const { result } = setup()
    act(() => result.current.manager.setSelectedEntityId('a'))
    act(() => result.current.setActiveMap(makeMap({ fileName: 'other.json', nodes: [makeEntity('z')] })))
    act(() => result.current.tree.pruneToTree())
    expect(result.current.manager.entities.map((e) => e.id)).toEqual(['z'])
    expect(result.current.manager.selectedEntityId).toBeNull()
  })

  it('keeps the selection when the open map is replaced by one that still contains it', () => {
    const { result } = setup()
    act(() => result.current.manager.setSelectedEntityId('b'))
    act(() => result.current.setActiveMap(makeMap({ fileName: 'other.json', nodes: [makeEntity('b')] })))
    act(() => result.current.tree.pruneToTree())
    expect(result.current.manager.selectedEntityId).toBe('b')
  })
})

describe('useEntityManager derives Transform.free from the position', () => {
  it('createEntity: on a tile anchor it is false, off the grid true (whatever the template said)', () => {
    const { result } = setup(mapOf(makeLayer('L')))
    act(() => result.current.manager.createEntity('Tile', 48, 64))
    act(() => result.current.manager.createEntity('Off', 50, 61, { Transform: { depth: 20, free: false } }))
    const [tile, off] = result.current.manager.entities
    expect(tile.components.Transform).toMatchObject({ x: 48, y: 64, free: false })
    expect(off).toMatchObject({ x: 50, y: 61 })
    expect(off.components.Transform).toMatchObject({ x: 50, y: 61, free: true })
  })

  it('moveEntity and Transform edits keep the flag in step with the position, one undo step each', () => {
    const entity = makeEntity('a', { x: 48, y: 64, components: { Transform: { x: 48, y: 64, depth: 10 } } })
    const { result, onCommitHistory } = setup(mapOf(entity))
    act(() => result.current.manager.moveEntity('a', 50, 61))
    expect(result.current.manager.entities[0].components.Transform).toMatchObject({ x: 50, y: 61, free: true })
    act(() => result.current.manager.updateComponentProp('a', 'Transform', 'x', 48))
    act(() => result.current.manager.updateComponentProps('a', 'Transform', { y: 64 }))
    expect(result.current.manager.entities[0].components.Transform).toMatchObject({ x: 48, y: 64, free: false })
    expect(onCommitHistory).toHaveBeenCalledTimes(3)
  })

  it('a duplicate moves one whole tile, so one on the grid stays on it and one off the grid stays off it', () => {
    const onGrid = makeEntity('a', { x: 48, y: 64, components: { Transform: { x: 48, y: 64, depth: 10 } } })
    const offGrid = makeEntity('b', { x: 50, y: 70, components: { Transform: { x: 50, y: 70, depth: 10 } } })
    const { result } = setup(mapOf(onGrid, offGrid))
    act(() => result.current.manager.duplicateEntity('a'))
    act(() => result.current.manager.duplicateEntity('b'))
    const [, aCopy, , bCopy] = result.current.manager.entities
    expect(aCopy.components.Transform).toMatchObject({ x: 80, y: 96 })
    expect(aCopy.components.Transform?.free).not.toBe(true)
    expect(bCopy.components.Transform).toMatchObject({ x: 82, y: 102, free: true })
  })
})
