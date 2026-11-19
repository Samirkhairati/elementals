/* eslint-disable @typescript-eslint/no-explicit-any -- loose node fixtures */
import { describe, expect, it } from 'vitest'
import { findNode, type CollisionLayerNode, type SceneNode } from '../../../shared/sceneTree'
import { ENTITIES_GROUP_ID } from '../../../shared/sceneTreeMigrate'
import { makeEntity, makeGroup, makeImageLayer, makeLayer, makePicture } from '@/test/helpers'
import {
  addEntity,
  addNode,
  canDrop,
  carryView,
  copiesOf,
  copyName,
  countWithin,
  defaultIndex,
  deleteNodes,
  dropPlace,
  duplicateNodes,
  expandTo,
  groupNodes,
  isLockedPlace,
  makeNode,
  moveNodesTo,
  movePictureStep,
  newNodeName,
  paintCollision,
  parentPathFor,
  pasteCopies,
  patchNode,
  renameNode,
  setLocked,
  setVisible,
  setYSort,
  settlePictureZ,
  topLevelIds,
  ungroupNode,
  uniqueName,
} from './sceneOps'

const ids = (nodes: readonly SceneNode[]) => nodes.map((n) => n.id)
const kids = (nodes: SceneNode[], id: string) => ids((findNode(nodes, id) as any).children)
const counter = () => {
  let n = 0
  return () => `n${++n}`
}

// draw order: deco (back), ground, town [npc, roofs], trees [oak, pine]
const town = (): SceneNode[] => [
  makeLayer('deco', { name: 'Deco' }),
  makeLayer('ground', { name: 'Ground' }),
  makeGroup('town', [makeEntity('npc', { name: 'Elder', x: 16, y: 32 }), makeLayer('roofs', { name: 'Roofs' })], { name: 'Town' }),
  makeImageLayer('trees', [makePicture('oak', { name: 'Oak', x: 10, y: 20 }), makePicture('pine', { name: 'Pine', x: 40, y: 20 })], { name: 'Trees' }),
]

describe('names', () => {
  it('uniqueName counts up from the stem, copyName adds Copy and remembers what it gave', () => {
    expect(uniqueName('Group', [])).toBe('Group')
    expect(uniqueName('Group', ['Group', 'Group 2'])).toBe('Group 3')
    expect(uniqueName('Group 2', ['Group 2'])).toBe('Group 3')
    const taken = new Set(['Wall Copy'])
    expect(copyName('Wall', taken)).toBe('Wall Copy 2')
    expect(copyName('Wall', taken)).toBe('Wall Copy 3')
  })

  it('newNodeName numbers tile layers and entities, and keeps the rest free among every name in the tree', () => {
    const nodes = [makeLayer('a', { name: 'Layer 1' }), makeGroup('g', [makeEntity('e', { name: 'Entity 1' }), makeLayer('i', { type: 'image', name: 'Images', children: [] })])]
    expect(newNodeName(nodes, 'tile')).toBe('Layer 2')
    expect(newNodeName(nodes, 'entity')).toBe('Entity 2')
    expect(newNodeName(nodes, 'image')).toBe('Images 2')
    expect(newNodeName(nodes, 'group')).toBe('Group')
  })
})

describe('making nodes', () => {
  it('makeNode gives containers children and collision layers cells', () => {
    expect(makeNode('group', 'g', 'G')).toEqual({ id: 'g', type: 'group', name: 'G', children: [] })
    expect(makeNode('collision', 'c', 'C')).toEqual({ id: 'c', type: 'collision', name: 'C', data: {}, children: [] })
    expect(makeNode('tile', 't', 'T')).toEqual({ id: 't', type: 'tile', name: 'T' })
  })

  it('defaultIndex puts tile and image layers below the special layers on top, the rest on top', () => {
    const children = [makeLayer('a'), makeLayer('c', { type: 'collision', children: [] }), makeLayer('t', { type: 'terrain' })]
    expect(defaultIndex(children, 'tile')).toBe(1)
    expect(defaultIndex(children, 'image')).toBe(1)
    expect(defaultIndex(children, 'group')).toBe(3)
  })

  it('parentPathFor: inside the anchor when it holds the type, else the nearest container above that does', () => {
    const nodes = town()
    expect(ids(parentPathFor(nodes, 'tile', 'town'))).toEqual(['town'])
    expect(ids(parentPathFor(nodes, 'tile', 'roofs'))).toEqual(['town'])
    expect(ids(parentPathFor(nodes, 'tile', 'oak'))).toEqual([]) // a tile layer cannot go in an image layer
    expect(ids(parentPathFor(nodes, 'group', 'oak'))).toEqual(['trees']) // a group can (a picture group)
    expect(ids(parentPathFor(nodes, 'tile', null))).toEqual([])
  })

  it('addNode puts the node at the default place, and refuses a second terrain', () => {
    const made = addNode(town(), makeNode('tile', 'new', 'New'), 'roofs')
    expect(kids(made.nodes, 'town')).toEqual(['npc', 'roofs', 'new'])
    const once = addNode(town(), makeNode('terrain', 't1', 'Terrain'))
    expect(once.node?.id).toBe('t1')
    const twice = addNode(once.nodes, makeNode('terrain', 't2', 'Terrain'))
    expect(twice).toEqual({ nodes: once.nodes, node: null })
  })

  it('addEntity: into a selected group, after a selected entity, else into the Entities group, else on top', () => {
    const e = makeEntity('new')
    expect(kids(addEntity(town(), e, 'town'), 'town')).toEqual(['npc', 'roofs', 'new'])
    expect(kids(addEntity(town(), e, 'npc'), 'town')).toEqual(['npc', 'new', 'roofs'])
    const withHome = [...town(), makeGroup(ENTITIES_GROUP_ID, [], { name: 'Entities' })]
    expect(kids(addEntity(withHome, e, 'ground'), ENTITIES_GROUP_ID)).toEqual(['new'])
    expect(ids(addEntity(town(), e, null)).at(-1)).toBe('new')
  })
})

describe('flags and fields', () => {
  it('visible / locked are only stored when not the default, and the same tree comes back when nothing changes', () => {
    const nodes = town()
    const hidden = setVisible(nodes, 'ground', false)
    expect(findNode(hidden, 'ground')).toMatchObject({ visible: false })
    expect(findNode(setVisible(hidden, 'ground', true), 'ground')).not.toHaveProperty('visible')
    expect(setVisible(nodes, 'ground', true)).toBe(nodes)
    const locked = setLocked(nodes, 'town', true)
    expect(findNode(setLocked(locked, 'town', false), 'town')).not.toHaveProperty('locked')
  })

  it('y-sort is set on groups, image layers and pictures only; undefined follows the parent again', () => {
    const nodes = town()
    expect(findNode(setYSort(nodes, 'oak', true), 'oak')).toMatchObject({ ySort: true })
    expect(setYSort(nodes, 'ground', true)).toBe(nodes)
    expect(findNode(setYSort(setYSort(nodes, 'trees', false), 'trees', undefined), 'trees')).not.toHaveProperty('ySort')
  })

  it('renames (ignoring a blank name) and patches only what differs', () => {
    const nodes = town()
    expect(findNode(renameNode(nodes, 'ground', '  Grass '), 'ground')?.name).toBe('Grass')
    expect(renameNode(nodes, 'ground', '   ')).toBe(nodes)
    expect(patchNode(nodes, 'oak', { x: 10 })).toBe(nodes)
    expect(findNode(patchNode(nodes, 'oak', { x: 11 }), 'oak')).toMatchObject({ x: 11, y: 20 })
  })

  it('expandTo opens every container above a node; carryView keeps the open / closed state across an undo', () => {
    const closed = [makeGroup('g', [makeImageLayer('i', [makePicture('p')], { collapsed: true })], { collapsed: true })]
    const open = expandTo(closed, 'p')
    expect(findNode(open, 'g')).not.toHaveProperty('collapsed')
    expect(findNode(open, 'i')).not.toHaveProperty('collapsed')
    // the author opened g; undo brings back a tree where it was closed: it stays open
    const restored = carryView(open, closed)
    expect(findNode(restored, 'g')).not.toHaveProperty('collapsed')
  })
})

describe('locks', () => {
  it('a place is locked by a lock on it or above it, but not by a picture group inside an image layer', () => {
    const layer = makeImageLayer('i', [])
    expect(isLockedPlace([makeGroup('g', [], { locked: true }), layer])).toBe(true)
    expect(isLockedPlace([layer, makeGroup('pg', [], { locked: true })])).toBe(false)
    expect(isLockedPlace([{ ...layer, locked: true } as SceneNode])).toBe(true)
  })
})

describe('grouping and deleting', () => {
  it('topLevelIds leaves out what is inside another picked node; countWithin counts them all', () => {
    expect(topLevelIds(town(), ['roofs', 'town', 'ground'])).toEqual(['ground', 'town'])
    expect(countWithin(town(), ['town', 'roofs'])).toBe(3)
  })

  it('groups siblings in one new group where the highest of them was, in draw order', () => {
    const { nodes, group } = groupNodes(town(), ['deco', 'ground'], 'g', 'Group')
    expect(group?.id).toBe('g')
    expect(ids(nodes)).toEqual(['g', 'town', 'trees'])
    expect(kids(nodes, 'g')).toEqual(['deco', 'ground'])
    // the highest member is town: the group takes its place
    const second = groupNodes(town(), ['deco', 'town'], 'g', 'Group').nodes
    expect(ids(second)).toEqual(['ground', 'g', 'trees'])
  })

  it('refuses nodes of different parents, and a locked place', () => {
    const nodes = town()
    expect(groupNodes(nodes, ['deco', 'roofs'], 'g', 'G')).toEqual({ nodes, group: null })
    const locked = setLocked(nodes, 'town', true)
    expect(groupNodes(locked, ['npc', 'roofs'], 'g', 'G').group).toBeNull()
  })

  it('ungroup puts the children in the group\'s place, in order', () => {
    expect(ids(ungroupNode(town(), 'town'))).toEqual(['deco', 'ground', 'npc', 'roofs', 'trees'])
    const nodes = town()
    expect(ungroupNode(nodes, 'ground')).toBe(nodes)
  })

  it('deletes nodes with what is inside them, and a tiles item with its cells', () => {
    expect(ids(deleteNodes(town(), ['town', 'roofs']))).toEqual(['deco', 'ground', 'trees'])
    const col: CollisionLayerNode = { id: 'c', type: 'collision', name: 'C', data: { 1: { tilesetId: '__collision__', x: 0, y: 0, group: 't' }, 2: { tilesetId: '__collision__', x: 0, y: 0, group: 'u' } }, children: [{ id: 't', type: 'collisionTiles', name: 'T' }, { id: 'u', type: 'collisionTiles', name: 'U' }] }
    const after = deleteNodes([col], ['t'])[0] as CollisionLayerNode
    expect(ids(after.children)).toEqual(['u'])
    expect(Object.keys(after.data ?? {})).toEqual(['2'])
  })
})

describe('copies', () => {
  it('copiesOf takes the top picked nodes in tree order, deep, but never a tiles item alone', () => {
    const copies = copiesOf(town(), ['trees', 'oak', 'ground'])
    expect(ids(copies)).toEqual(['ground', 'trees'])
    expect(ids((copies[1] as any).children)).toEqual(['oak', 'pine'])
    const col = [{ id: 'c', type: 'collision', name: 'C', data: {}, children: [{ id: 't', type: 'collisionTiles', name: 'T' }] } as SceneNode]
    expect(copiesOf(col, ['t'])).toEqual([])
  })

  it('pastes inside a container with new ids and free names, moving pictures and entities a tile', () => {
    const nodes = town()
    const { nodes: next, ids: made } = pasteCopies(nodes, copiesOf(nodes, ['npc', 'ground']), 'town', counter())
    expect(made).toHaveLength(2)
    expect(kids(next, 'town')).toEqual(['npc', 'roofs', ...made])
    const copies = made.map((id) => findNode(next, id) as any)
    expect(copies.map((c) => c.name)).toEqual(['Ground Copy', 'Elder Copy'])
    expect(copies[1]).toMatchObject({ x: 48, y: 64 })
  })

  it('a pasted picture lands at the cursor, named "Oak 2"; a picture copy that fits nowhere is dropped', () => {
    const nodes = town()
    const { nodes: next, ids: made } = pasteCopies(nodes, copiesOf(nodes, ['oak']), 'trees', counter(), { at: { x: 100, y: 200 } })
    expect(findNode(next, made[0])).toMatchObject({ name: 'Oak 2', x: 100, y: 200 })
    const nowhere = pasteCopies(nodes, copiesOf(nodes, ['oak']), 'ground', counter())
    expect(nowhere).toEqual({ nodes, ids: [] })
  })

  it('duplicates layers below the original and pictures above the last one', () => {
    const layer = duplicateNodes(town(), ['ground'], counter())
    expect(ids(layer.nodes)).toEqual(['deco', layer.ids[0], 'ground', 'town', 'trees'])
    const pic = duplicateNodes(town(), ['oak'], counter())
    expect(kids(pic.nodes, 'trees')).toEqual(['oak', pic.ids[0], 'pine'])
  })
})

describe('dropping in the list', () => {
  it('above a row is later in the draw order, below it earlier, inside only for a container', () => {
    expect(dropPlace(town(), 'ground', 'above')).toMatchObject({ index: 2 })
    expect(dropPlace(town(), 'ground', 'below')).toMatchObject({ index: 1 })
    expect(dropPlace(town(), 'ground', 'inside')).toBeNull()
    expect(ids(dropPlace(town(), 'town', 'inside')!.parentPath)).toEqual(['town'])
  })

  it('canDrop follows the placement rules and never drops a node into itself', () => {
    const nodes = town()
    expect(canDrop(nodes, ['ground'], 'town', 'inside')).toBe(true)
    expect(canDrop(nodes, ['town'], 'roofs', 'above')).toBe(false) // into itself
    expect(canDrop(nodes, ['oak'], 'ground', 'above')).toBe(false) // a picture outside an image layer
    expect(canDrop(nodes, ['ground'], 'trees', 'inside')).toBe(false) // a layer into an image layer
    expect(canDrop(setLocked(nodes, 'town', true), ['ground'], 'town', 'inside')).toBe(false)
  })

  it('moves within the same container to exactly the dropped place, both ways', () => {
    // deco is before ground: above ground = just after it (an index counted before deco left used to land one too far)
    expect(ids(moveNodesTo(town(), ['deco'], 'ground', 'above'))).toEqual(['ground', 'deco', 'town', 'trees'])
    expect(ids(moveNodesTo(town(), ['deco'], 'town', 'below'))).toEqual(['ground', 'deco', 'town', 'trees'])
    expect(ids(moveNodesTo(town(), ['trees'], 'ground', 'below'))).toEqual(['deco', 'trees', 'ground', 'town'])
    expect(ids(moveNodesTo(town(), ['trees'], 'deco', 'above'))).toEqual(['deco', 'trees', 'ground', 'town'])
  })

  it('moves several nodes together, keeping their order, and refuses what canDrop refuses', () => {
    expect(ids(moveNodesTo(town(), ['deco', 'ground'], 'trees', 'above'))).toEqual(['town', 'trees', 'deco', 'ground'])
    expect(kids(moveNodesTo(town(), ['deco', 'ground'], 'town', 'inside'), 'town')).toEqual(['npc', 'roofs', 'deco', 'ground'])
    const nodes = town()
    expect(moveNodesTo(nodes, ['oak'], 'ground', 'above')).toBe(nodes)
  })

  it('a picture dropped next to another takes its z, so the new tree order decides', () => {
    const nodes = [makeImageLayer('i', [makePicture('a', { z: 0 }), makePicture('b', { z: 5 })])]
    const moved = moveNodesTo(nodes, ['a'], 'b', 'above')
    expect(kids(moved, 'i')).toEqual(['b', 'a'])
    expect(findNode(moved, 'a')).toMatchObject({ z: 5 })
  })
})

describe('collision painting', () => {
  const col = (): CollisionLayerNode => ({ id: 'c', type: 'collision', name: 'C', data: {}, children: [{ id: 't', type: 'collisionTiles', name: 'Tiles' }] })
  const M = { tilesetId: '__collision__', x: 0, y: 0 }

  it('new cells join the picked tiles item', () => {
    const r = paintCollision(col(), { 3: M }, 't', counter())
    expect(r).toMatchObject({ tilesId: 't', created: false })
    expect(r.layer.data?.[3]).toMatchObject({ group: 't' })
  })

  it('with no tiles item picked a new one is made for them; erasing makes none', () => {
    const r = paintCollision(col(), { 3: M }, null, counter())
    expect(r).toMatchObject({ tilesId: 'n1', created: true })
    expect(r.layer.children.map((c) => c.name)).toEqual(['Tiles', 'Tiles 2'])
    const erase = paintCollision(col(), {}, null, counter())
    expect(erase).toMatchObject({ tilesId: null, created: false })
    expect(erase.layer.children).toHaveLength(1)
  })
})

describe('pictures: draw order', () => {
  it('a step trades places with the neighbour of the same z, or trades z with one of another z', () => {
    const same = [makeImageLayer('i', [makePicture('a'), makePicture('b')])]
    expect(kids(movePictureStep(same, 'i', 'a', 1), 'i')).toEqual(['b', 'a'])
    expect(movePictureStep(same, 'i', 'a', -1)).toBe(same) // already at the back
    const zs = [makeImageLayer('i', [makePicture('a', { z: 1 }), makePicture('b', { z: 3 })])]
    const traded = movePictureStep(zs, 'i', 'a', 1)
    expect([findNode(traded, 'a'), findNode(traded, 'b')]).toMatchObject([{ z: 3 }, { z: 1 }])
  })

  it('across groups the mover takes a z just beyond its neighbour', () => {
    const nodes = [makeImageLayer('i', [makeGroup('g', [makePicture('a')]) as any, makePicture('b')])]
    expect(findNode(movePictureStep(nodes, 'i', 'a', 1), 'a')).toMatchObject({ z: 1 })
  })

  it('settlePictureZ gives moved pictures the z of the picture they now draw next to', () => {
    const nodes = [makeImageLayer('i', [makePicture('a', { z: 2 }), makePicture('b', { z: 7 })])]
    expect(findNode(settlePictureZ(nodes, 'b'), 'b')).toMatchObject({ z: 2 })
    expect(settlePictureZ(nodes, 'i')).toBe(nodes)
  })
})
