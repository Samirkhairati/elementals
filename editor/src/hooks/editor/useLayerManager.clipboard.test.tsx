import { StrictMode, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { GroupNode, BranchNode, PictureNode, SceneNode } from '../../../../shared/sceneTree'
import { drawOrderPictures, picturesOf } from '../../../../shared/sceneTree'
import { makeGroup, makeImageLayer, makeLayer, makeMap, makePicture } from '@/test/helpers'
import { useSceneHarness } from '@/test/sceneHarness'
import { useEditorClipboard } from '@/store/editorClipboard'

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>

function setup(initial: SceneNode[]) {
  const onCommitHistory = vi.fn()
  const hook = renderHook(() => useSceneHarness(makeMap({ nodes: initial }), onCommitHistory), { wrapper })
  act(() => hook.result.current.layers.setActiveLayerId(initial[0]?.id ?? null))
  return { ...hook, onCommitHistory }
}
type R = ReturnType<typeof setup>['result']

const img = (id: string, x: number, name?: string): PictureNode => makePicture(id, { assetId: undefined, graphicId: 'images/city/dam-wall.png', x, y: 64, name: name ?? id })
const imageLayer = (pictures: SceneNode[], id = 'I1', extra: Record<string, unknown> = {}) => makeImageLayer(id, pictures as never, { name: 'Images', ...extra })
const layer = (r: R, id = 'I1') => r.current.tree.index.byId.get(id)!.node as BranchNode
const parentOf = (r: R, id: string) => r.current.tree.index.byId.get(id)?.ancestors.slice(-1)[0]?.id ?? null

afterEach(() => useEditorClipboard.getState().set(null))

describe('picking several pictures', () => {
  it('Ctrl/Cmd toggles pictures into the picked set and Shift picks a range (front first)', () => {
    const { result } = setup([imageLayer([img('a', 0), img('b', 10), img('c', 20), img('d', 30)])])
    act(() => result.current.layers.selectImage('I1', 'a', 'replace'))
    expect(result.current.layers.pickedImageIds).toEqual(['a'])
    act(() => result.current.layers.selectImage('I1', 'c', 'toggle'))
    expect([...result.current.layers.pickedImageIds].sort()).toEqual(['a', 'c'])
    expect(result.current.layers.selectedImageId).toBe('c')
    act(() => result.current.layers.selectImage('I1', 'a', 'toggle'))
    expect(result.current.layers.pickedImageIds).toEqual(['c'])
    act(() => result.current.layers.selectImage('I1', 'a', 'range'))
    // front first: d c b a, so from c to a is c b a
    expect([...result.current.layers.pickedImageIds].sort()).toEqual(['a', 'b', 'c'])
  })

  it('selecting the layer again lets go of the picked set', () => {
    const { result } = setup([imageLayer([img('a', 0), img('b', 10)])])
    act(() => result.current.layers.selectImage('I1', 'a', 'replace'))
    act(() => result.current.layers.selectImage('I1', 'b', 'toggle'))
    act(() => result.current.layers.setActiveLayerId('I1'))
    expect(result.current.layers.pickedImageIds).toEqual([])
    expect(result.current.layers.activeLayerId).toBe('I1')
  })
})

describe('several pictures at once', () => {
  it('deleteNodes removes them all in one history step', () => {
    const { result, onCommitHistory } = setup([imageLayer([img('a', 0), img('b', 10), img('c', 20)])])
    onCommitHistory.mockClear()
    act(() => result.current.layers.deleteNodes(['a', 'c']))
    expect(picturesOf(layer(result)).map((i) => i.id)).toEqual(['b'])
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
    expect(result.current.layers.pickedImageIds).toEqual([])
  })

  it('duplicateNodes copies them with new ids and unique names in one step, and picks the copies', () => {
    const { result, onCommitHistory } = setup([imageLayer([img('a', 0), img('b', 10, 'Wall')])])
    onCommitHistory.mockClear()
    act(() => result.current.layers.duplicateNodes(['a', 'b']))
    const pictures = picturesOf(layer(result))
    expect(pictures).toHaveLength(4)
    expect(new Set(pictures.map((i) => i.id)).size).toBe(4)
    expect(pictures.map((i) => i.name)).toEqual(['a', 'Wall', 'a 2', 'Wall 2'])
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
    expect(result.current.layers.pickedImageIds).toHaveLength(2)
    expect(pictures[2].x).toBe(32)
  })

  it('copy then paste puts copies in the layer, also in another image layer, where the cursor is', () => {
    const { result } = setup([imageLayer([img('a', 100)], 'I1'), imageLayer([], 'I2')])
    act(() => {
      expect(result.current.layers.copyNodes(['a'])).toBe(1)
    })
    expect(useEditorClipboard.getState().content?.kind).toBe('nodes')
    act(() => result.current.layers.pasteNodes('I2', { x: 5, y: 6 }))
    const pasted = picturesOf(layer(result, 'I2'))
    expect(pasted).toHaveLength(1)
    expect(pasted[0]).toMatchObject({ graphicId: 'images/city/dam-wall.png', x: 5, y: 6, name: 'a' })
    expect(pasted[0].id).not.toBe('a')
  })

  it('does not paste into a locked layer; pictures do not fit anywhere but an image layer', () => {
    const { result } = setup([imageLayer([img('a', 0)], 'I1'), imageLayer([], 'I2', { locked: true }), makeLayer('T')])
    act(() => result.current.layers.copyNodes(['a']))
    act(() => result.current.layers.pasteNodes('I2'))
    expect(picturesOf(layer(result, 'I2'))).toEqual([])
    act(() => result.current.layers.pasteNodes('T'))
    expect(picturesOf(layer(result, 'I1'))).toHaveLength(1)
    expect(result.current.tree.nodes.map((n) => n.id)).toEqual(['I1', 'I2', 'T'])
  })
})

describe('several layers at once', () => {
  const layers = () => [makeLayer('A', { name: 'A' }), makeLayer('B', { name: 'B' }), makeLayer('C', { name: 'C' }), makeGroup('F', [], { name: 'F' })]
  /** Names top first, groups followed by what they hold. */
  const listed = (r: R) => r.current.tree.rows.map((id) => r.current.tree.index.byId.get(id)!.node.name)

  it('Shift+click picks every row from the active one to the clicked one', () => {
    const { result } = setup(layers())
    // the list reads F, C, B, A; A is active
    act(() => result.current.layers.select('C', 'range'))
    expect(new Set([result.current.layers.activeLayerId, ...result.current.layers.selectedLayerIds])).toEqual(new Set(['A', 'B', 'C']))
    expect(result.current.layers.activeLayerId).toBe('C')
  })

  it('deleteNodes removes several in one history step and drops them from the selection', () => {
    const { result, onCommitHistory } = setup(layers())
    act(() => result.current.layers.select('C', 'range'))
    onCommitHistory.mockClear()
    act(() => result.current.layers.deleteNodes(['A', 'C']))
    expect(result.current.tree.nodes.map((n) => n.id)).toEqual(['B', 'F'])
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
    expect([result.current.layers.activeLayerId, ...result.current.layers.selectedLayerIds]).toEqual(['B'])
  })

  it('duplicateNodes puts the copies right below the lowest one, with new ids and unique names', () => {
    const { result } = setup(layers())
    act(() => result.current.layers.duplicateNodes(['A', 'B']))
    // the list reads F, C, B, A with the copies under A... A Copy, B Copy go below the lowest (A)
    expect(listed(result)).toEqual(['F', 'C', 'B', 'A', 'B Copy', 'A Copy'])
    expect(new Set(result.current.tree.index.entries.map((e) => e.node.id)).size).toBe(6)
  })

  it('copyNodes + pasteNodes paste below the given layer, again with free names; groups are copied too', () => {
    const { result } = setup(layers())
    act(() => result.current.layers.copyNodes(['B', 'F']))
    act(() => result.current.layers.pasteNodes('C'))
    expect(listed(result)).toEqual(['F', 'C', 'F Copy', 'B Copy', 'B', 'A'])
    act(() => result.current.layers.pasteNodes('C'))
    expect(listed(result)).toContain('B Copy 2')
  })

  it('a layer copied out of a group is pasted back into that group, and a copied group brings its layers', () => {
    const inGroup = [makeGroup('F', [makeLayer('a', { name: 'a' }), makeLayer('b', { name: 'b' })], { name: 'F' }), makeLayer('x', { name: 'x' })]
    const { result } = setup(inGroup)
    act(() => result.current.layers.copyNodes(['a']))
    act(() => result.current.layers.pasteNodes('a'))
    const at = (id: string) => result.current.tree.index.byId.get(id)
    expect((at('F')!.node as GroupNode).children.map((n) => n.name)).toEqual(['a Copy', 'a', 'b'])
    act(() => result.current.layers.duplicateNodes(['F']))
    const copy = result.current.tree.nodes.find((n) => n.name === 'F Copy') as GroupNode
    // what is inside keeps its names: only the copied group itself is a copy
    expect(copy.children.map((n) => n.name)).toEqual(['a Copy', 'a', 'b'])
    expect(copy.children.map((n) => n.id)).not.toContain('a')
  })

  it('pasting on a group row puts the copy inside it', () => {
    const { result } = setup([makeGroup('F', [makeLayer('a')], { name: 'F' }), makeLayer('x', { name: 'x' })])
    act(() => result.current.layers.copyNodes(['x']))
    act(() => result.current.layers.pasteNodes('F'))
    expect((result.current.tree.nodes[0] as GroupNode).children.map((n) => n.name)).toEqual(['a', 'x Copy'])
  })
})

describe('place multiple', () => {
  it('turns a picture into the placement preview with its crop, scale, flips and opacity, and drops what is unset', () => {
    const item = makePicture('a', { assetId: undefined, graphicId: 'images/city/dam-wall.png', x: 5, y: 6, name: 'Wall', crop: { x: 1, y: 2, w: 3, h: 4 }, scale: 2, flipX: true, opacity: 0.5 })
    const { result } = setup([imageLayer([item, img('b', 0)])])
    act(() => result.current.layers.placeMultiple('I1', 'a'))
    expect(result.current.layers.pendingImage).toEqual({ graphicId: 'images/city/dam-wall.png', crop: { x: 1, y: 2, w: 3, h: 4 }, scale: 2, flipX: true, opacity: 0.5 })
    expect(result.current.layers.pendingImage?.crop).not.toBe(item.crop)
    act(() => result.current.layers.placeMultiple('I1', 'b'))
    expect(result.current.layers.pendingImage).toEqual({ graphicId: 'images/city/dam-wall.png' })
  })

  it('does nothing for a picture that is not there', () => {
    const { result } = setup([imageLayer([img('a', 0)])])
    act(() => result.current.layers.placeMultiple('I1', 'zzz'))
    expect(result.current.layers.pendingImage).toBeNull()
  })
})

describe('groups of pictures', () => {
  const four = () => imageLayer([img('a', 0), img('b', 10), img('c', 20), img('d', 30)])
  const groupId = (r: R) => (layer(r).children.find((n) => n.type === 'group') as GroupNode).id
  const groupedFirstTwo = () => {
    const hook = setup([four()])
    act(() => hook.result.current.layers.selectImage('I1', 'a', 'replace'))
    act(() => hook.result.current.layers.selectImage('I1', 'b', 'toggle'))
    act(() => hook.result.current.layers.groupNodes(hook.result.current.layers.pickedImageIds))
    return hook
  }

  it('groups the picked pictures in one history step and selects the group row', () => {
    const { result, onCommitHistory } = setup([four()])
    act(() => result.current.layers.groupNodes([]))
    expect(layer(result).children.some((n) => n.type === 'group')).toBe(false)
    expect(onCommitHistory).not.toHaveBeenCalled()
    act(() => result.current.layers.selectImage('I1', 'a', 'replace'))
    onCommitHistory.mockClear()
    act(() => result.current.layers.selectImage('I1', 'b', 'toggle'))
    act(() => result.current.layers.groupNodes(result.current.layers.pickedImageIds))
    const gid = groupId(result)
    expect(picturesOf(result.current.tree.index.byId.get(gid)!.node).map((i) => i.id).sort()).toEqual(['a', 'b'])
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
    expect(result.current.tree.view.primaryId).toBe(gid)
  })

  it('a Node that picks as one is picked as a whole by a click on any member; others are not', () => {
    const { result } = groupedFirstTwo()
    const gid = groupId(result)
    act(() => result.current.layers.setActiveLayerId('I1'))
    act(() => result.current.layers.selectImage('I1', 'a', 'replace'))
    expect(result.current.layers.pickedImageIds).toEqual(['a'])
    act(() => result.current.layers.setPickAsOne(gid, true))
    expect(result.current.tree.index.byId.get(gid)!.node).toMatchObject({ pickAsOne: true })
    expect(result.current.tree.index.byId.get(gid)!.node.locked).toBeUndefined()
    act(() => result.current.layers.setActiveLayerId('I1'))
    act(() => result.current.layers.selectImage('I1', 'a', 'replace'))
    expect([...result.current.layers.pickedImageIds].sort()).toEqual(['a', 'b'])
    expect(result.current.layers.selectedImageId).toBe('a')
  })

  it('selecting the group row opens it: then one member can be picked on its own, until another picture is clicked', () => {
    const { result } = groupedFirstTwo()
    const gid = groupId(result)
    act(() => result.current.layers.setPickAsOne(gid, true))
    act(() => result.current.layers.select(gid))
    expect([...result.current.layers.pickedImageIds].sort()).toEqual(['a', 'b'])
    expect(result.current.layers.openImageGroupId).toBe(gid)
    act(() => result.current.layers.selectImage('I1', 'b', 'replace'))
    expect(result.current.layers.pickedImageIds).toEqual(['b'])
    expect(result.current.layers.openImageGroupId).toBe(gid)
    act(() => result.current.layers.selectImage('I1', 'c', 'replace'))
    expect(result.current.layers.openImageGroupId).toBeNull()
    act(() => result.current.layers.selectImage('I1', 'a', 'replace'))
    expect([...result.current.layers.pickedImageIds].sort()).toEqual(['a', 'b'])
  })

  it('Ctrl/Cmd+click on a pick-as-one group toggles all of it in or out', () => {
    const { result } = groupedFirstTwo()
    act(() => result.current.layers.setPickAsOne(groupId(result), true))
    act(() => result.current.layers.selectImage('I1', 'c', 'replace'))
    act(() => result.current.layers.selectImage('I1', 'a', 'toggle'))
    expect([...result.current.layers.pickedImageIds].sort()).toEqual(['a', 'b', 'c'])
    act(() => result.current.layers.selectImage('I1', 'b', 'toggle'))
    expect(result.current.layers.pickedImageIds).toEqual(['c'])
  })

  it('ungroup keeps the pictures and drops the group', () => {
    const { result } = groupedFirstTwo()
    act(() => result.current.layers.ungroupNode(groupId(result)))
    expect(layer(result).children.every((n) => n.type === 'picture')).toBe(true)
    expect(picturesOf(layer(result))).toHaveLength(4)
    expect(result.current.layers.openImageGroupId).toBeNull()
  })

  it('renames a group, ignoring an empty name', () => {
    const { result } = groupedFirstTwo()
    const gid = groupId(result)
    act(() => result.current.layers.renameNode(gid, '  Dam wall '))
    expect(result.current.tree.index.byId.get(gid)!.node.name).toBe('Dam wall')
    act(() => result.current.layers.renameNode(gid, '   '))
    expect(result.current.tree.index.byId.get(gid)!.node.name).toBe('Dam wall')
  })

  it('moveImages moves several pictures by one amount in one history step', () => {
    const { result, onCommitHistory } = groupedFirstTwo()
    onCommitHistory.mockClear()
    act(() => result.current.layers.moveImages('I1', ['a', 'b'], 5, -3))
    const xs = Object.fromEntries(picturesOf(layer(result)).map((i) => [i.id, [i.x, i.y]]))
    expect(xs.a).toEqual([5, 61])
    expect(xs.b).toEqual([15, 61])
    expect(xs.c).toEqual([20, 64])
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
  })

  it('duplicating a whole group makes a new group of copies ("Copy" name, same settings); the original is untouched', () => {
    const { result } = groupedFirstTwo()
    const gid = groupId(result)
    act(() => result.current.layers.setPickAsOne(gid, true))
    act(() => result.current.layers.duplicateNodes([gid]))
    const groups = layer(result).children.filter((n): n is GroupNode => n.type === 'group')
    expect(groups).toHaveLength(2)
    expect(groups.find((g) => g.id !== gid)).toMatchObject({ name: 'Node Copy', pickAsOne: true })
    expect(groups.map((g) => g.name).sort()).toEqual(['Node', 'Node Copy'])
    expect(groups[0].children).toHaveLength(2)
    expect(groups[1].children).toHaveLength(2)
  })

  it('deleting its pictures keeps the group (empty); deleting the group takes its pictures', () => {
    const { result } = groupedFirstTwo()
    act(() => result.current.layers.deleteNodes(['a', 'b']))
    expect(layer(result).children.filter((n) => n.type === 'group')).toHaveLength(1)
    const again = groupedFirstTwo()
    act(() => again.result.current.layers.deleteNodes([groupId(again.result)]))
    expect(layer(again.result).children.some((n) => n.type === 'group')).toBe(false)
    expect(picturesOf(layer(again.result)).map((i) => i.id)).toEqual(['c', 'd'])
    expect(again.result.current.layers.pickedImageIds).toEqual([])
  })

  it('an empty group can be made, filled, and pictures taken back out of it', () => {
    const { result } = setup([four()])
    act(() => result.current.layers.createNode('group', 'I1'))
    const gid = groupId(result)
    expect(result.current.tree.index.byId.get(gid)!.node).toMatchObject({ name: 'Node', children: [] })
    act(() => result.current.layers.moveNodes(['c', 'd'], gid, 'inside'))
    expect(picturesOf(result.current.tree.index.byId.get(gid)!.node).map((i) => i.id)).toEqual(['c', 'd'])
    act(() => result.current.layers.moveNodes(['d'], gid, 'above'))
    expect(parentOf(result, 'd')).toBe('I1')
  })

  it('dragging a picture in the list onto a loose one takes it out of its group; onto a member puts it in', () => {
    const { result, onCommitHistory } = groupedFirstTwo()
    const gid = groupId(result)
    onCommitHistory.mockClear()
    act(() => result.current.layers.moveNodes(['a'], 'd', 'above'))
    expect(parentOf(result, 'a')).toBe('I1')
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
    act(() => result.current.layers.moveNodes(['c'], 'b', 'below'))
    expect(parentOf(result, 'c')).toBe(gid)
  })

  it('copy and paste into another image layer brings the group along as a new one', () => {
    const hook = setup([four(), imageLayer([], 'I2')])
    act(() => hook.result.current.layers.selectImage('I1', 'a', 'replace'))
    act(() => hook.result.current.layers.selectImage('I1', 'b', 'toggle'))
    act(() => hook.result.current.layers.groupNodes(hook.result.current.layers.pickedImageIds))
    act(() => hook.result.current.layers.copyNodes([groupId(hook.result)]))
    act(() => hook.result.current.layers.pasteNodes('I2'))
    const target = layer(hook.result, 'I2')
    const groups = target.children.filter((n): n is GroupNode => n.type === 'group')
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('Node Copy')
    expect(groups[0].children).toHaveLength(2)
    expect(drawOrderPictures(target)).toHaveLength(2)
  })

  it('a locked layer refuses group changes', () => {
    const { result } = setup([imageLayer([img('a', 0), img('b', 1)], 'I1', { locked: true })])
    act(() => result.current.layers.selectImage('I1', 'a', 'replace'))
    act(() => result.current.layers.selectImage('I1', 'b', 'toggle'))
    act(() => result.current.layers.groupNodes(result.current.layers.pickedImageIds))
    expect(layer(result).children.some((n) => n.type === 'group')).toBe(false)
  })
})
