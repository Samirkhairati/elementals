import { StrictMode, type ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { BranchNode, PictureNode, SceneNode } from '../../../../shared/sceneTree'
import { drawOrderPictures, picturesOf } from '../../../../shared/sceneTree'
import { makeGroup, makeImageLayer, makeLayer, makeMap, makePicture } from '@/test/helpers'
import { useSceneHarness } from '@/test/sceneHarness'

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>

function setup(initial: SceneNode[] = [makeLayer('L1', { name: 'Layer 1' })]) {
  const onCommitHistory = vi.fn()
  const hook = renderHook(() => useSceneHarness(makeMap({ nodes: initial }), onCommitHistory), { wrapper })
  act(() => hook.result.current.layers.setActiveLayerId(initial[0]?.id ?? null))
  return { ...hook, onCommitHistory }
}

type R = ReturnType<typeof setup>['result']
const imageLayer = (r: R, id = 'I1') => r.current.tree.index.byId.get(id)!.node as BranchNode
const order = (r: R, id = 'I1') => drawOrderPictures(imageLayer(r, id)).map((p) => p.id)
const withImageLayer = () => setup([makeImageLayer('I1', [], { name: 'Images' }), makeLayer('L1')])

describe('useLayerManager: sprites in Node2Ds', () => {
  it('creates a Node2D named Node2D, below the special layers, then Node2D 2', () => {
    const { result } = setup([makeLayer('L1'), makeLayer('C', { type: 'collision', children: [] })])
    act(() => result.current.layers.createNode('group', null))
    let nodes = result.current.tree.nodes
    expect(nodes.map((l) => l.type)).toEqual(['tile', 'group', 'collision'])
    expect(nodes[1]).toMatchObject({ name: 'Node2D', children: [] })
    expect(result.current.layers.activeLayerId).toBe(nodes[1].id)

    act(() => result.current.layers.createNode('group', null))
    nodes = result.current.tree.nodes
    expect(nodes.some((l) => l.name === 'Node2D 2')).toBe(true)
  })

  it('adds a picture, selects it and commits history once', () => {
    const { result, onCommitHistory } = withImageLayer()
    let id: string | null = null
    act(() => {
      id = result.current.layers.addImage('I1', { assetId: 'tree', x: 48, y: 64 })
    })
    expect(id).toBeTruthy()
    expect(imageLayer(result).children).toEqual([{ id, type: 'picture', name: 'tree', assetId: 'tree', x: 48, y: 64, children: [] }])
    expect(result.current.layers.selectedImageId).toBe(id)
    expect(result.current.layers.activeLayerId).toBe('I1')
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
    expect(result.current.activeMap?.nodes).toBe(result.current.tree.nodes)
  })

  it('refuses to add a sprite to a node that is not a Node2D or YSort', () => {
    const { result, onCommitHistory } = withImageLayer()
    act(() => {
      expect(result.current.layers.addImage('L1', { assetId: 'tree', x: 0, y: 0 })).toBeNull()
    })
    expect(onCommitHistory).not.toHaveBeenCalled()
  })

  it('updates a picture, and does nothing (no history step) when nothing changes', () => {
    const { result, onCommitHistory } = withImageLayer()
    let id = ''
    act(() => {
      id = result.current.layers.addImage('I1', { assetId: 'tree', x: 10, y: 20 })!
    })
    onCommitHistory.mockClear()
    act(() => result.current.layers.updateImage('I1', id, { x: 10, y: 20 }))
    expect(onCommitHistory).not.toHaveBeenCalled()
    act(() => result.current.layers.updateImage('I1', id, { x: 11, z: 4, flipX: true }))
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
    expect(imageLayer(result).children[0]).toMatchObject({ x: 11, y: 20, z: 4, flipX: true })
  })

  it('deletes a picture and clears its selection', () => {
    const { result } = withImageLayer()
    let id = ''
    act(() => {
      id = result.current.layers.addImage('I1', { assetId: 'tree', x: 0, y: 0 })!
    })
    act(() => result.current.layers.deleteNodes([id]))
    expect(imageLayer(result).children).toEqual([])
    expect(result.current.layers.selectedImageId).toBeNull()
  })

  it('duplicating an image layer gives the pictures new ids', () => {
    const { result } = withImageLayer()
    act(() => {
      result.current.layers.addImage('I1', { assetId: 'tree', x: 0, y: 0 })
    })
    act(() => result.current.layers.duplicateNodes(['I1']))
    // the copy goes below the original in the list
    const [original, copy] = result.current.tree.nodes.filter((l) => l.type === 'group').reverse() as BranchNode[]
    expect(copy.name).toBe('Images Copy')
    expect(copy.children).toHaveLength(1)
    expect(copy.children[0].id).not.toBe(original.children[0].id)
    expect(copy.children[0]).toMatchObject({ assetId: 'tree' })
  })

  it('placement mode starts, stops and ends on Escape', () => {
    const { result } = withImageLayer()
    act(() => result.current.layers.startImagePlacement({ assetId: 'tree' }))
    expect(result.current.layers.pendingImage).toEqual({ assetId: 'tree' })
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(result.current.layers.pendingImage).toBeNull()
  })
})

describe('useLayerManager: multi-layer selection and pin', () => {
  const three = () => setup([makeLayer('A'), makeLayer('B'), makeLayer('C')])

  it('Ctrl/Cmd+click adds layers to the selection, again removes, a plain click resets', () => {
    const { result } = three()
    expect(result.current.layers.activeLayerId).toBe('A')
    act(() => result.current.layers.select('B', 'toggle'))
    expect(new Set([result.current.layers.activeLayerId, ...result.current.layers.selectedLayerIds])).toEqual(new Set(['A', 'B']))
    expect(result.current.layers.activeLayerId).toBe('B')
    act(() => result.current.layers.select('C', 'toggle'))
    expect(new Set([result.current.layers.activeLayerId, ...result.current.layers.selectedLayerIds])).toEqual(new Set(['A', 'B', 'C']))
    act(() => result.current.layers.select('A', 'toggle'))
    expect(new Set([result.current.layers.activeLayerId, ...result.current.layers.selectedLayerIds])).toEqual(new Set(['B', 'C']))
    act(() => result.current.layers.select('C'))
    expect(result.current.layers.selectedLayerIds).toEqual([])
    expect(result.current.layers.activeLayerId).toBe('C')
  })

  it('Shift+click picks the range between the last click and the row, whatever the kinds', () => {
    const { result } = setup([makeLayer('A'), makeGroup('G', [makeLayer('B')]), makeLayer('C')])
    // the list reads C, G, B, A (top first); A was clicked first
    act(() => result.current.layers.select('C', 'range'))
    expect(new Set(result.current.tree.view.ids)).toEqual(new Set(['A', 'G', 'B', 'C']))
    expect(result.current.layers.activeLayerId).toBe('C')
  })

  it('deleting a layer drops it from the selection', () => {
    const { result } = three()
    act(() => result.current.layers.select('B', 'toggle'))
    act(() => result.current.layers.deleteNodes(['A']))
    expect([result.current.layers.activeLayerId, ...result.current.layers.selectedLayerIds]).toEqual(['B'])
  })

  it('a pinned selection is not swapped for the collision marker when a collision layer is activated', () => {
    const { result } = setup([makeLayer('C', { type: 'collision', children: [] }), makeLayer('L1')])
    const multi = { width: 1, height: 1, tiles: [{ tilesetId: 'ts', x: 1, y: 0 }] }
    act(() => result.current.layers.setPinSelection(true))
    act(() => result.current.layers.setTileSelection(multi))
    act(() => result.current.layers.setActiveLayerId('C'))
    expect(result.current.layers.tileSelection).toBe(multi)
  })

  it('unpinned, a collision layer still gets the collision marker', () => {
    const { result } = setup([makeLayer('C', { type: 'collision', children: [] }), makeLayer('L1')])
    act(() => result.current.layers.setActiveLayerId('C'))
    expect(result.current.layers.tileSelection?.tiles[0]?.tilesetId).toBe('__collision__')
  })
})

describe('useLayerManager: pictures', () => {
  it('duplicates a picture next to the original (same picture and crop, a tile away, named like its neighbours) and picks the copy', () => {
    const { result } = withImageLayer()
    let id = ''
    act(() => {
      id = result.current.layers.addImage('I1', { graphicId: 'sky/sheet.png', crop: { x: 1, y: 2, w: 3, h: 4 }, x: 64, y: 96 }) ?? ''
    })
    act(() => result.current.layers.duplicateNodes([id]))
    const pictures = picturesOf(imageLayer(result))
    expect(pictures).toHaveLength(2)
    expect(pictures[1]).toMatchObject({ graphicId: 'sky/sheet.png', crop: { x: 1, y: 2, w: 3, h: 4 }, x: 96, y: 128, name: 'sheet 2' })
    expect(pictures[1].id).not.toBe(id)
    expect(result.current.layers.selectedImageId).toBe(pictures[1].id)
  })

  it('moves a picture forward and back in the draw order', () => {
    const { result } = withImageLayer()
    let a = ''
    let b = ''
    act(() => {
      a = result.current.layers.addImage('I1', { graphicId: 'p.png', x: 0, y: 0 }) ?? ''
      b = result.current.layers.addImage('I1', { graphicId: 'q.png', x: 0, y: 0 }) ?? ''
    })
    act(() => result.current.layers.reorderImage('I1', a, 1))
    expect(order(result)).toEqual([b, a])
    act(() => result.current.layers.reorderImage('I1', a, 1)) // already in front: no change
    expect(order(result)).toEqual([b, a])
  })

  it('moving a picture past one with another z trades their z; with the same z they trade places', () => {
    const { result } = setup([makeImageLayer('I1', [makePicture('a', { z: 1 }), makePicture('b', { z: 5 }), makePicture('c', { z: 5 })])])
    act(() => result.current.layers.reorderImage('I1', 'a', 1))
    expect(order(result)).toEqual(['b', 'a', 'c'])
    expect(picturesOf(imageLayer(result)).find((p) => p.id === 'a')?.z).toBe(5)
    expect(picturesOf(imageLayer(result)).find((p) => p.id === 'b')?.z).toBe(1)
    act(() => result.current.layers.reorderImage('I1', 'c', -1))
    expect(order(result)).toEqual(['b', 'c', 'a'])
  })

  describe('arrow keys', () => {
    const press = (key: string, init: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
    const picked = () => {
      const r = withImageLayer()
      let id = ''
      act(() => {
        id = r.result.current.layers.addImage('I1', { graphicId: 'p.png', x: 100, y: 100 }) ?? ''
      })
      const pos = () => {
        const it = picturesOf(imageLayer(r.result))[0]
        return [it.x, it.y]
      }
      return { ...r, id, pos }
    }

    it('move the picked picture one pixel, and with Shift 8 px every time, however long the key is held', () => {
      const { pos } = picked()
      act(() => { press('ArrowRight') })
      expect(pos()).toEqual([101, 100])
      act(() => { press('ArrowUp') })
      expect(pos()).toEqual([101, 99])
      act(() => { press('ArrowLeft', { shiftKey: true }) })
      expect(pos()).toEqual([93, 99])
      act(() => { press('ArrowLeft', { shiftKey: true, repeat: true }) })
      expect(pos()).toEqual([85, 99]) // 8 more
      act(() => { press('ArrowLeft', { shiftKey: true, repeat: true }) })
      expect(pos()).toEqual([77, 99]) // 8 more, no acceleration
    })

    it('do nothing on a locked layer, while typing in a field, or while placing a picture', () => {
      const { pos, result } = picked()
      const input = document.createElement('input')
      document.body.appendChild(input)
      act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })) })
      expect(pos()).toEqual([100, 100])
      input.remove()
      act(() => result.current.layers.startImagePlacement({ graphicId: 'q.png' }))
      act(() => { press('ArrowRight') })
      expect(pos()).toEqual([100, 100])
      act(() => result.current.layers.cancelImagePlacement())
      act(() => result.current.layers.toggleNodeLock('I1'))
      act(() => { press('ArrowRight') })
      expect(pos()).toEqual([100, 100])
    })
  })

  it('dropping a picture in front of / behind another is one undo step and lands it where it was dropped', () => {
    const { result, onCommitHistory } = withImageLayer()
    const ids: string[] = []
    act(() => {
      for (const g of ['a.png', 'b.png', 'c.png']) ids.push(result.current.layers.addImage('I1', { graphicId: g, x: 0, y: 0 }) ?? '')
    })
    onCommitHistory.mockClear()
    // above the row of c in the list = in front of it
    act(() => result.current.layers.moveNodes([ids[0]], ids[2], 'above'))
    expect(order(result)).toEqual([ids[1], ids[2], ids[0]])
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
  })

  it('a dropped picture takes the z of the picture it lands next to, so the new order holds', () => {
    const { result } = setup([makeImageLayer('I1', [makePicture('a', { z: 1 }), makePicture('b', { z: 5 }), makePicture('c', { z: 9 })])])
    act(() => result.current.layers.moveNodes(['c'], 'a', 'below'))
    expect(order(result)).toEqual(['c', 'a', 'b'])
  })
})

describe('useLayerManager: groups of pictures and y-sort', () => {
  const grouped = () =>
    setup([
      makeImageLayer('I1', [
        makeGroup('g', [makePicture('a', { graphicId: 'p.png' })], { name: 'Group', pickAsOne: true }) as never,
        makePicture('b', { graphicId: 'p.png' }),
        makePicture('c', { graphicId: 'p.png' }),
        makeGroup('e', [], { name: 'Empty' }) as never,
      ]),
    ])

  it('selecting a Node2D that picks as one picks it and its sprites, opens it and makes it the active node', () => {
    const { result } = grouped()
    act(() => result.current.layers.select('g'))
    expect(result.current.layers.openImageGroupId).toBe('g')
    expect(result.current.layers.pickedImageIds).toEqual(['a'])
    expect(result.current.layers.activeLayerId).toBe('g')
  })

  it('an empty Node2D can be selected: it is the active node, and sprites added to it go inside', () => {
    const { result } = grouped()
    act(() => result.current.layers.select('e'))
    expect(result.current.layers.activeLayerId).toBe('e')
    expect(result.current.layers.pickedImageIds).toEqual([])
    let id: string | null = null
    act(() => {
      id = result.current.layers.addImage(result.current.layers.activeLayerId!, { graphicId: 'p.png', x: 1, y: 2 })
    })
    expect(result.current.tree.index.byId.get(id!)?.ancestors.map((a) => a.id)).toEqual(['I1', 'e'])
  })

  it('without a selected group a new picture stays loose', () => {
    const { result } = grouped()
    let id: string | null = null
    act(() => {
      id = result.current.layers.addImage('I1', { graphicId: 'p.png', x: 1, y: 2 })
    })
    expect(result.current.tree.index.byId.get(id!)?.ancestors.map((a) => a.id)).toEqual(['I1'])
  })

  it('a click on a sprite of a pick-as-one Node2D picks the whole group, unless the group is the selected one', () => {
    const { result } = setup([
      makeImageLayer('I1', [makeGroup('g', [makePicture('a'), makePicture('b')], { pickAsOne: true }) as never, makePicture('c')]),
    ])
    act(() => result.current.layers.selectImage('I1', 'a'))
    expect(new Set(result.current.layers.pickedImageIds)).toEqual(new Set(['a', 'b']))
    act(() => result.current.layers.select('g'))
    act(() => result.current.layers.selectImage('I1', 'b'))
    expect(result.current.layers.pickedImageIds).toEqual(['b'])
    expect(result.current.layers.openImageGroupId).toBe('g')
    // a picture outside the group closes it
    act(() => result.current.layers.selectImage('I1', 'c'))
    expect(result.current.layers.openImageGroupId).toBeNull()
  })

  it('moves a whole group in the draw order in one step', () => {
    const { result, onCommitHistory } = grouped()
    onCommitHistory.mockClear()
    act(() => result.current.layers.moveNodes(['g'], 'c', 'above'))
    expect(order(result)).toEqual(['b', 'c', 'a'])
    expect(onCommitHistory).toHaveBeenCalledTimes(1)
  })

  it('dropping a picture inside a group puts it there; beside a group row leaves it loose', () => {
    const { result } = grouped()
    act(() => result.current.layers.moveNodes(['c'], 'g', 'inside'))
    expect(result.current.tree.index.byId.get('c')?.ancestors.map((a) => a.id)).toEqual(['I1', 'g'])
    act(() => result.current.layers.moveNodes(['c'], 'g', 'below'))
    expect(result.current.tree.index.byId.get('c')?.ancestors.map((a) => a.id)).toEqual(['I1'])
  })

  it('grouping the picked pictures makes a group that holds them; ungrouping sets them free', () => {
    const { result } = grouped()
    act(() => result.current.layers.groupNodes(['b', 'c']))
    const group = result.current.tree.index.byId.get('b')!.ancestors.slice(-1)[0]
    expect(group.type).toBe('group')
    expect(result.current.tree.index.byId.get('c')!.ancestors.slice(-1)[0].id).toBe(group.id)
    act(() => result.current.layers.ungroupNode(group.id))
    expect(result.current.tree.index.byId.get('b')!.ancestors.map((a) => a.id)).toEqual(['I1'])
  })

  it('y-sort on turns a Node2D into a YSort and off turns it back; sprites have no y-sort of their own', () => {
    const { result } = grouped()
    act(() => result.current.layers.setNodeYSort('I1', true))
    expect(imageLayer(result).type).toBe('ySort')
    act(() => result.current.layers.setNodesYSort(['b', 'g'], true))
    expect(imageLayer(result).children.find((n) => n.id === 'g')?.type).toBe('ySort')
    expect(picturesOf(imageLayer(result)).find((i: PictureNode) => i.id === 'b')).not.toHaveProperty('ySort')
    act(() => result.current.layers.setNodeYSort('I1', undefined))
    expect(imageLayer(result).type).toBe('group')
  })

})
