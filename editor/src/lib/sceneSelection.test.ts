import { describe, expect, it } from 'vitest'
import type { SceneNode } from '../../../shared/sceneTree'
import { makeEntity, makeGroup, makeImageLayer, makeLayer, makePicture } from '@/test/helpers'
import { sceneIndex } from './sceneIndex'
import { NO_SELECTION, activeLayerFor, clearSelection, expandPictureClick, isPictureGroup, pruneSelection, sameView, selectMany, selectNode, viewOf } from './sceneSelection'

// draw order: ground, town [npc, roofs], trees [oak, wall (a locked picture group) [left, right]]
const tree = (): SceneNode[] => [
  makeLayer('ground'),
  makeGroup('town', [makeEntity('npc'), makeLayer('roofs')]),
  makeImageLayer('trees', [makePicture('oak'), makeGroup('wall', [makePicture('left'), makePicture('right')], { locked: true }) as never]),
]
const index = () => sceneIndex(tree())
// the panel's rows, top first
const ROWS = ['trees', 'wall', 'right', 'left', 'oak', 'town', 'roofs', 'npc', 'ground']

describe('what a node stands for', () => {
  it('a group inside an image layer is a picture group; a plain group is not', () => {
    expect(isPictureGroup(index(), 'wall')).toBe(true)
    expect(isPictureGroup(index(), 'town')).toBe(false)
  })

  it('the active layer of a node: a layer itself, a picture its layer, a plain group itself, an entity none', () => {
    const idx = index()
    expect(activeLayerFor(idx, 'roofs')).toBe('roofs')
    expect(activeLayerFor(idx, 'left')).toBe('trees')
    expect(activeLayerFor(idx, 'wall')).toBe('trees')
    expect(activeLayerFor(idx, 'town')).toBe('town')
    expect(activeLayerFor(idx, 'npc')).toBeUndefined()
    expect(activeLayerFor(idx, 'gone')).toBeUndefined()
  })

  it('a click on a picture of a locked group picks the whole group, unless that group is the open one', () => {
    const idx = index()
    expect(expandPictureClick(idx, 'left', null)).toEqual(['left', 'right'])
    expect(expandPictureClick(idx, 'left', 'wall')).toEqual(['left'])
    expect(expandPictureClick(idx, 'oak', null)).toEqual(['oak'])
  })
})

describe('selectNode', () => {
  it('replace picks only the node, remembers it as the anchor and the layer it stands for', () => {
    const sel = selectNode(NO_SELECTION, index(), 'roofs')
    expect(sel).toMatchObject({ ids: ['roofs'], primary: 'roofs', anchor: 'roofs', lastLayerId: 'roofs', openGroupId: null })
  })

  it('picking a picture group picks its pictures and opens it; a picture inside the open group keeps it open', () => {
    const idx = index()
    const group = selectNode(NO_SELECTION, idx, 'wall')
    expect(group).toMatchObject({ ids: ['wall', 'left', 'right'], openGroupId: 'wall' })
    const inside = selectNode(group, idx, 'left')
    expect(inside).toMatchObject({ ids: ['left'], openGroupId: 'wall' })
    expect(selectNode(inside, idx, 'oak').openGroupId).toBeNull()
  })

  it('toggle adds and takes out, and moves the primary to what is left', () => {
    const idx = index()
    let sel = selectNode(NO_SELECTION, idx, 'ground')
    sel = selectNode(sel, idx, 'roofs', 'toggle')
    expect(sel).toMatchObject({ ids: ['ground', 'roofs'], primary: 'roofs' })
    sel = selectNode(sel, idx, 'roofs', 'toggle')
    expect(sel).toMatchObject({ ids: ['ground'], primary: 'ground' })
    // a locked group's picture toggles the whole group in and out
    sel = selectNode(sel, idx, 'left', 'toggle')
    expect(sel.ids).toEqual(['ground', 'left', 'right'])
    expect(selectNode(sel, idx, 'right', 'toggle').ids).toEqual(['ground'])
  })

  it('range picks the rows between the anchor and the node, as listed', () => {
    const idx = index()
    const sel = selectNode(selectNode(NO_SELECTION, idx, 'town'), idx, 'ground', 'range', ROWS)
    expect(sel.ids).toEqual(['town', 'roofs', 'npc', 'ground'])
    expect(sel).toMatchObject({ primary: 'ground', anchor: 'town' })
    // without the rows it is a plain click
    expect(selectNode(NO_SELECTION, idx, 'ground', 'range').ids).toEqual(['ground'])
  })

  it('ignores an unknown id', () => {
    expect(selectNode(NO_SELECTION, index(), 'gone')).toBe(NO_SELECTION)
  })
})

describe('selectMany, clear and prune', () => {
  it('selectMany keeps the ids that exist, the primary among them', () => {
    const sel = selectMany(NO_SELECTION, index(), 'oak', ['oak', 'gone', 'ground'])
    expect(sel).toMatchObject({ ids: ['oak', 'ground'], primary: 'oak', lastLayerId: 'trees' })
    expect(selectMany(NO_SELECTION, index(), 'gone', ['ground']).primary).toBe('ground')
  })

  it('clear keeps the last active layer and is a no-op when empty', () => {
    const sel = clearSelection(selectNode(NO_SELECTION, index(), 'roofs'))
    expect(sel).toMatchObject({ ids: [], primary: null, lastLayerId: 'roofs' })
    expect(clearSelection(sel)).toBe(sel)
  })

  it('prune drops what left the tree (undo, delete) and keeps the same object otherwise', () => {
    const sel = selectMany(NO_SELECTION, index(), 'roofs', ['ground', 'roofs'])
    expect(pruneSelection(sel, index())).toBe(sel)
    const smaller = sceneIndex([makeLayer('ground')])
    expect(pruneSelection(sel, smaller)).toMatchObject({ ids: ['ground'], primary: 'ground', lastLayerId: 'ground' })
  })
})

describe('viewOf', () => {
  it('an entity keeps the last layer active; the other layers picked are listed apart', () => {
    const idx = index()
    let sel = selectNode(NO_SELECTION, idx, 'ground')
    sel = selectNode(sel, idx, 'roofs', 'toggle')
    sel = selectNode(sel, idx, 'npc', 'toggle')
    const view = viewOf(sel, idx)
    expect(view).toMatchObject({ primaryId: 'npc', selectedEntityId: 'npc', activeLayerId: 'roofs', selectedImageId: null })
    expect(view.selectedLayerIds).toEqual(['ground'])
  })

  it('pictures: the primary one first (else the first picked), and a picture group is not a layer', () => {
    const idx = index()
    const sel = selectNode(selectNode(NO_SELECTION, idx, 'wall'), idx, 'oak', 'toggle')
    const view = viewOf(sel, idx)
    expect(view).toMatchObject({ primaryId: 'oak', activeLayerId: 'trees', selectedImageId: 'oak', pickedImageIds: ['oak', 'left', 'right'] })
    expect(view.selectedLayerIds).toEqual([])
    const onGroup = viewOf(selectNode(NO_SELECTION, idx, 'wall'), idx)
    expect(onGroup).toMatchObject({ primaryId: 'wall', selectedImageId: 'left', openImageGroupId: 'wall' })
  })

  it('sameView compares by value', () => {
    const idx = index()
    const a = viewOf(selectNode(NO_SELECTION, idx, 'oak'), idx)
    const b = viewOf(selectNode(NO_SELECTION, sceneIndex(tree()), 'oak'), sceneIndex(tree()))
    expect(sameView(a, b)).toBe(true)
    expect(sameView(a, viewOf(NO_SELECTION, idx))).toBe(false)
    expect(sameView(null, a)).toBe(false)
  })
})
