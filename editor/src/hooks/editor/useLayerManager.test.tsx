import { StrictMode, type ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { SceneNode } from '../../../../shared/sceneTree'
import { collisionShapeNodes } from '../../../../shared/sceneTree'
import { createSaveQueue } from '@/lib/saveQueue'
import { useMapAutosave } from '@/hooks/useMapAutosave'
import { lockedNode, shown } from '@/lib/sceneIndex'
import { makeGroup, makeLayer, makeMap } from '@/test/helpers'
import { useSceneHarness } from '@/test/sceneHarness'

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>

function setup(initial: SceneNode[] = [makeLayer('L1', { name: 'Layer 1' })]) {
  const onCommitHistory = vi.fn()
  const save = vi.fn()
  const queue = createSaveQueue({ delayMs: 300 })
  const hook = renderHook(
    () => {
      const scene = useSceneHarness(makeMap({ nodes: initial }), onCommitHistory)
      useMapAutosave(scene.activeMap, { queue, save })
      return scene
    },
    { wrapper }
  )
  act(() => hook.result.current.layers.setActiveLayerId(initial.find((n) => n.type !== 'group')?.id ?? null))
  return { ...hook, onCommitHistory, save, queue }
}

/** The layers as the list shows them, top first. */
const names = (r: { current: ReturnType<typeof useSceneHarness> }) => r.current.tree.index.layersTopFirst.map((l) => l.name)

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useLayerManager on the scene tree (StrictMode)', () => {
  it('creating a tile layer commits history once, writes into the map, selects it and saves once', () => {
    const { result, onCommitHistory, save } = setup()
    act(() => result.current.layers.handleCreateLayer())

    expect(onCommitHistory).toHaveBeenCalledTimes(1)
    const nodes = result.current.activeMap!.nodes
    // the tree is in draw order: the new layer is the last one, on top
    expect(nodes.map((n) => n.name)).toEqual(['Layer 1', 'Layer 2'])
    expect(nodes[1]).toMatchObject({ type: 'tile' })
    expect(result.current.layers.activeLayerId).toBe(nodes[1].id)
    // the tree is the map itself: no copy is kept anywhere
    expect(result.current.tree.nodes).toBe(nodes)

    act(() => vi.advanceTimersByTime(300))
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0].nodes).toBe(nodes)
  })

  it('exposes the latest tree synchronously via getNodes, and passes it to onCommitHistory', () => {
    const { result, onCommitHistory } = setup()
    act(() => {
      result.current.layers.createNode('objects')
      expect(result.current.tree.getNodes().map((n) => n.name)).toEqual(['Layer 1', 'Objects'])
      result.current.layers.renameNode('L1', 'Ground')
      expect(result.current.tree.getNodes().map((n) => n.name)).toEqual(['Ground', 'Objects'])
    })
    expect(onCommitHistory).toHaveBeenCalledTimes(2)
    expect(onCommitHistory.mock.calls[1][0].map((n: SceneNode) => n.name)).toEqual(['Ground', 'Objects'])
  })

  it('keeps special layers above new tile layers; one terrain layer per map, collision layers can be many', () => {
    const { result, onCommitHistory } = setup()
    act(() => result.current.layers.createNode('terrain'))
    act(() => result.current.layers.createNode('terrain')) // duplicate -> ignored
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
    act(() => result.current.layers.createNode('collision'))
    act(() => result.current.layers.createNode('collision'))
    expect(onCommitHistory).toHaveBeenCalledTimes(3)
    act(() => result.current.layers.createNode('tile', null))
    expect(result.current.tree.index.layersTopFirst.map((l) => l.type)).toEqual(['collision', 'collision', 'terrain', 'tile', 'tile'])
    const cols = result.current.tree.index.layers.filter((l) => l.type === 'collision')
    expect(cols.map((l) => l.name).sort()).toEqual(['Collision', 'Collision 2'])
    expect(cols[0]).toMatchObject({ data: {}, children: [] })
  })

  it('duplicates a layer with an independent copy of its data, below it, and selects it', () => {
    const { result } = setup([makeLayer('L1', { data: { 0: { tilesetId: 't', x: 1, y: 1 } } })])
    act(() => result.current.layers.duplicateNodes(['L1']))
    const [orig, copy] = result.current.tree.index.layersTopFirst.slice().reverse().sort((a) => (a.id === 'L1' ? -1 : 1)) as never[] as { id: string; name: string; data: object }[]
    expect(copy.name).toBe('L1 Copy')
    expect(copy.data).toEqual(orig.data)
    expect(copy.data).not.toBe(orig.data)
    expect(result.current.layers.activeLayerId).toBe(copy.id)
    // lower in the list = earlier in the draw order
    expect(result.current.tree.nodes.map((n) => n.id)).toEqual([copy.id, 'L1'])
  })

  it('deleting the active layer re-selects the topmost remaining; deleting another keeps selection', () => {
    const { result, onCommitHistory } = setup([makeLayer('A'), makeLayer('B'), makeLayer('C')])
    act(() => result.current.layers.setActiveLayerId('B'))
    act(() => result.current.layers.deleteNodes(['C']))
    expect(result.current.layers.activeLayerId).toBe('B')
    act(() => result.current.layers.deleteNodes(['B']))
    expect(result.current.layers.activeLayerId).toBe('A')
    expect(onCommitHistory).toHaveBeenCalledTimes(2)
  })

  it('toggle visibility / lock and moving each commit once', () => {
    const { result, onCommitHistory } = setup([makeLayer('A'), makeLayer('B')])
    act(() => result.current.layers.toggleNodeVisibility('A'))
    act(() => result.current.layers.toggleNodeLock('A'))
    act(() => result.current.layers.moveNodes(['A'], 'B', 'above'))
    expect(result.current.tree.nodes.map((n) => n.id)).toEqual(['B', 'A'])
    expect(result.current.tree.nodes[1]).toMatchObject({ visible: false, locked: true })
    expect(onCommitHistory).toHaveBeenCalledTimes(3)
    // switching back removes the flag instead of storing the default
    act(() => result.current.layers.toggleNodeVisibility('A'))
    expect(result.current.tree.nodes[1]).not.toHaveProperty('visible')
  })

  it('blank rename is ignored', () => {
    const { result, onCommitHistory } = setup()
    act(() => result.current.layers.renameNode('L1', '   '))
    expect(onCommitHistory).not.toHaveBeenCalled()
  })

  it('switches to a virtual collision tile selection on collision layers and restores the previous one', () => {
    const { result } = setup([makeLayer('T'), makeLayer('C', { type: 'collision', children: [] })])
    const sel = { width: 1, height: 1, tiles: [{ tilesetId: 'ts', x: 2, y: 2 }] }
    act(() => result.current.layers.setTileSelection(sel))
    act(() => result.current.layers.setActiveLayerId('C'))
    expect(result.current.layers.tileSelection?.tiles[0]?.tilesetId).toBe('__collision__')
    act(() => result.current.layers.setActiveLayerId('T'))
    expect(result.current.layers.tileSelection).toEqual(sel)
  })

  it('replaces the shapes of a collision layer in one step and keeps the untouched ones the same objects', () => {
    const shape = { id: 's1', type: 'collisionShape' as const, name: '', closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }] }
    const { result, onCommitHistory } = setup([makeLayer('C', { type: 'collision', children: [shape] })])
    const before = collisionShapeNodes(result.current.tree.index.layers[0] as never)[0]
    act(() => result.current.layers.setCollisionShapes('C', [before, { id: 's2', closed: false, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }]))
    const after = collisionShapeNodes(result.current.tree.index.layers[0] as never)
    expect(after.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(after[0]).toBe(before)
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
    act(() => result.current.layers.setCollisionShapes('C', after))
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
  })

  describe('groups', () => {
    const held = () => [
      makeGroup('F', [makeLayer('a', { name: 'Ground' }), makeLayer('b', { name: 'Deco' })], { name: 'Scenery' }),
      makeLayer('c', { name: 'Loose' }),
    ]

    it('creates Nodes named Node, Node 2', () => {
      const { result } = setup()
      act(() => result.current.layers.createNode('group', null))
      act(() => result.current.layers.createNode('group', null))
      expect(result.current.tree.nodes.filter((n) => n.type === 'group').map((n) => n.name).sort()).toEqual(['Node', 'Node 2'])
    })

    it('the group eye and lock reach the layers inside it, in one undo step each', () => {
      const { result, onCommitHistory } = setup(held())
      act(() => result.current.layers.toggleNodeVisibility('F'))
      const index = result.current.tree.index
      expect(['a', 'b', 'c'].map((id) => shown(index, id))).toEqual([false, false, true])
      expect(onCommitHistory).toHaveBeenCalledTimes(1)
      act(() => result.current.layers.toggleNodeLock('F'))
      expect(['a', 'b', 'c'].map((id) => lockedNode(result.current.tree.index, id))).toEqual([true, true, false])
    })

    it('a layer created inside a group goes in as its top layer, opens the group and is selected', () => {
      const nodes = held().map((n) => (n.id === 'F' ? ({ ...n, collapsed: true } as SceneNode) : n))
      const { result } = setup(nodes)
      act(() => result.current.layers.createNode('tile', 'F'))
      const group = result.current.tree.nodes.find((n) => n.id === 'F') as { children: SceneNode[]; collapsed?: boolean }
      expect(group.children).toHaveLength(3)
      expect(group.children[2]).toMatchObject({ type: 'tile' })
      expect(group.collapsed).toBeUndefined()
      expect(result.current.layers.activeLayerId).toBe(group.children[2].id)
      // other kinds go in too: a group holds every layer type (and Sprites)
      act(() => result.current.layers.createNode('objects', 'F'))
      expect((result.current.tree.nodes.find((n) => n.id === 'F') as { children: SceneNode[] }).children.some((c) => c.type === 'objects')).toBe(true)
    })

    it('deleting a group deletes what is inside it; ungrouping keeps it', () => {
      const { result } = setup(held())
      act(() => result.current.layers.ungroupNode('F'))
      expect(result.current.tree.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c'])
      act(() => result.current.layers.groupNodes(['a', 'b']))
      const group = result.current.tree.nodes.find((n) => n.type === 'group')!
      expect(group.name).toBe('Node')
      act(() => result.current.layers.deleteNodes([group.id]))
      expect(result.current.tree.nodes.map((n) => n.id)).toEqual(['c'])
    })

    it('opening or closing a group is saved but is not an undo step', () => {
      const { result, onCommitHistory } = setup(held())
      act(() => result.current.layers.toggleCollapsed('F'))
      expect(result.current.tree.nodes[0]).toMatchObject({ collapsed: true })
      expect(result.current.activeMap!.nodes[0]).toMatchObject({ collapsed: true })
      expect(onCommitHistory).not.toHaveBeenCalled()
      act(() => result.current.layers.toggleCollapsed('F'))
      expect(result.current.tree.nodes[0]).not.toHaveProperty('collapsed')
    })

    it('dragging a layer into a group moves it there; a layer dropped on a leaf lands beside it', () => {
      const { result } = setup(held())
      act(() => result.current.layers.moveNodes(['c'], 'F', 'inside'))
      expect((result.current.tree.nodes[0] as { children: SceneNode[] }).children.map((n) => n.id)).toEqual(['a', 'b', 'c'])
      act(() => result.current.layers.moveNodes(['c'], 'a', 'below'))
      expect((result.current.tree.nodes[0] as { children: SceneNode[] }).children.map((n) => n.id)).toEqual(['c', 'a', 'b'])
      expect(names(result)).toEqual(['Deco', 'Ground', 'Loose'])
    })
  })
})
