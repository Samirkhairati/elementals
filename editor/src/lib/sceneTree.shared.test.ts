import { describe, it, expect } from 'vitest'
import {
  NODE_TYPES,
  NODE_TYPE_LIST,
  allEntities,
  allPictures,
  ancestorsOf,
  canHold,
  canPlace,
  cellGroupOf,
  childrenOf,
  cloneWithNewIds,
  collisionShapeNodes,
  collisionTileNodes,
  duplicateNode,
  effectiveOpacity,
  effectiveYSort,
  findNode,
  findPath,
  inheritedValue,
  inheritedYSort,
  insertNode,
  isContainer,
  isLocked,
  isVisible,
  isWithin,
  layerNodes,
  layerNodesInListOrder,
  locate,
  mapTree,
  moveNode,
  nodeIds,
  panelChildren,
  parentOf,
  picturesOf,
  removeNodes,
  updateNode,
  walk,
  walkPanel,
  type CollisionLayerNode,
  type EntityNode,
  type GroupNode,
  type BranchNode,
  type PictureNode,
  type SceneNode,
  type SceneNodeType,
} from '../../../shared/sceneTree'

// ── builders ────────────────────────────────────────────────────────────────

const tile = (id: string, extra: Partial<SceneNode> = {}): SceneNode => ({ id, type: 'tile', name: id, ...extra }) as SceneNode
const terrain = (id: string): SceneNode => ({ id, type: 'terrain', name: id })
const encounters = (id: string): SceneNode => ({ id, type: 'encounters', name: id })
const group = (id: string, children: SceneNode[] = [], extra: Partial<GroupNode> = {}): GroupNode => ({ id, type: 'group', name: id, children, ...extra })
// a Node holding sprites (an image layer before schema 7)
const image = (id: string, children: SceneNode[] = [], extra: Partial<BranchNode> = {}): BranchNode => ({ id, type: 'group', name: id, children, ...extra }) as BranchNode
const picture = (id: string, extra: Partial<PictureNode> = {}): PictureNode => ({ id, type: 'picture', name: id, graphicId: `${id}.png`, x: 0, y: 0, children: [], ...extra })
const entity = (id: string, extra: Partial<EntityNode> = {}): EntityNode => ({ id, type: 'entity', name: id, x: 0, y: 0, components: { Transform: { x: 0, y: 0, depth: 10 } }, children: [], ...extra })
const collision = (id: string, children: SceneNode[] = [], extra: Partial<CollisionLayerNode> = {}): CollisionLayerNode => ({ id, type: 'collision', name: id, children, ...extra })
const tilesItem = (id: string): SceneNode => ({ id, type: 'collisionTiles', name: id })
const shape = (id: string): SceneNode => ({ id, type: 'collisionShape', name: id, closed: true, points: [] })

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const v of Object.values(value)) deepFreeze(v)
  }
  return value
}

/**
 *   root (draw order, first = back)
 *   ├─ ground (tile)
 *   ├─ town (group)
 *   │  ├─ houses (tile)
 *   │  ├─ trees (group)
 *   │  │  └─ oak (entity)
 *   │  └─ npc (entity)
 *   ├─ sky (Node of sprites)
 *   │  ├─ cloud (picture)
 *   │  └─ birds (group)
 *   │     ├─ b1 (picture)
 *   │     └─ b2 (picture)
 *   ├─ walls (collision)
 *   │  ├─ w1 (collisionTiles)
 *   │  └─ fence (collisionShape)
 *   └─ water (terrain)
 */
function sample(): SceneNode[] {
  return [
    tile('ground'),
    group('town', [tile('houses'), group('trees', [entity('oak')]), entity('npc')]),
    image('sky', [picture('cloud'), group('birds', [picture('b1'), picture('b2')])]),
    collision('walls', [tilesItem('w1'), shape('fence')]),
    terrain('water'),
  ]
}

describe('NODE_TYPES', () => {
  it('has one entry per type, in step with the container rule', () => {
    expect(Object.keys(NODE_TYPES).sort()).toEqual([...NODE_TYPE_LIST].sort())
    for (const type of NODE_TYPE_LIST) {
      const info = NODE_TYPES[type]
      expect(info.type).toBe(type)
      expect(info.label).not.toBe('')
      expect(info.icon).toMatch(/^[a-z0-9-]+$/)
      expect(info.accent).toMatch(/^#[0-9a-f]{6}$/)
      expect(info.sections.node).toBe(true)
    }
    const containers = NODE_TYPE_LIST.filter((t) => NODE_TYPES[t].container).sort()
    expect(containers).toEqual(['area', 'body', 'collision', 'entity', 'group', 'picture', 'tile'])
    expect(isContainer(group('g'))).toBe(true)
    expect(isContainer(tile('t'))).toBe(true) // it may hold a Look
    expect(isContainer(terrain('t'))).toBe(false)
  })

  it('says which common sections apply', () => {
    expect(NODE_TYPES.picture.sections).toEqual({ node: true, drawing: true, look: true })
    expect(NODE_TYPES.entity.sections.look).toBe(true) // an entity is a Node with components
    expect(NODE_TYPES.group.sections.look).toBe(true)
    expect(NODE_TYPES.event.sections).toEqual({ node: true, drawing: false, look: false })
  })

  it('names the nodes the Godot way, with an icon each and no two alike', () => {
    expect([NODE_TYPES.group.label, NODE_TYPES.picture.label, NODE_TYPES.animatedSprite.label, NODE_TYPES.area.label]).toEqual(['Node', 'Sprite', 'AnimatedSprite', 'Area'])
    expect(NODE_TYPES.entity.label).toBe('Node') // a Node with components is still a Node
    const menu = NODE_TYPE_LIST.filter((t) => t !== 'body' && t !== 'collision' && t !== 'entity') // both StaticBody: the map's and an entity's
    expect(new Set(menu.map((t) => NODE_TYPES[t].label)).size).toBe(menu.length)
  })
})

describe('walking and finding', () => {
  it('walks depth first in draw order with ancestors, index and depth', () => {
    const entries = walk(sample())
    expect(entries.map((e) => e.node.id)).toEqual(['ground', 'town', 'houses', 'trees', 'oak', 'npc', 'sky', 'cloud', 'birds', 'b1', 'b2', 'walls', 'w1', 'fence', 'water'])
    const oak = entries.find((e) => e.node.id === 'oak')!
    expect(oak.ancestors.map((a) => a.id)).toEqual(['town', 'trees'])
    expect(oak.depth).toBe(2)
    expect(oak.index).toBe(0)
    expect(entries.find((e) => e.node.id === 'npc')!.index).toBe(2)
  })

  it('walks the panel last child first, optionally skipping what a closed container holds', () => {
    const tree = sample()
    expect(walkPanel(tree).map((e) => e.node.id)).toEqual(['water', 'walls', 'fence', 'w1', 'sky', 'birds', 'b2', 'b1', 'cloud', 'town', 'npc', 'trees', 'oak', 'houses', 'ground'])
    const closed = updateNode(tree, 'town', (n) => ({ ...n, collapsed: true }) as SceneNode)
    expect(walkPanel(closed, { closed: true }).map((e) => e.node.id)).toEqual(['water', 'walls', 'fence', 'w1', 'sky', 'birds', 'b2', 'b1', 'cloud', 'town', 'ground'])
    expect(panelChildren(tree[1]).map((n) => n.id)).toEqual(['npc', 'trees', 'houses'])
    expect(childrenOf(tree[0])).toEqual([])
  })

  it('locates nodes, their paths and parents', () => {
    const tree = sample()
    const at = locate(tree, 'b2')!
    expect(at.node.id).toBe('b2')
    expect(at.parent?.id).toBe('birds')
    expect(at.index).toBe(1)
    expect(at.ancestors.map((a) => a.id)).toEqual(['sky', 'birds'])
    expect(locate(tree, 'ground')!.parent).toBeNull()
    expect(locate(tree, 'nope')).toBeUndefined()
    expect(findNode(tree, 'oak')?.type).toBe('entity')
    expect(findNode(tree, 'nope')).toBeUndefined()
    expect(findPath(tree, 'oak')!.map((n) => n.id)).toEqual(['town', 'trees', 'oak'])
    expect(ancestorsOf(tree, 'oak')!.map((n) => n.id)).toEqual(['town', 'trees'])
    expect(ancestorsOf(tree, 'town')).toEqual([])
    expect(parentOf(tree, 'oak')?.id).toBe('trees')
    expect(parentOf(tree, 'town')).toBeNull()
    expect(parentOf(tree, 'nope')).toBeUndefined()
    expect(isWithin(tree, 'oak', 'town')).toBe(true)
    expect(isWithin(tree, 'town', 'town')).toBe(true)
    expect(isWithin(tree, 'town', 'oak')).toBe(false)
    expect(nodeIds(tree).size).toBe(15)
  })
})

describe('canHold', () => {
  const types: SceneNodeType[] = [...NODE_TYPE_LIST]
  const holds = (path: SceneNode[]) => types.filter((t) => canHold(path, t))

  it('lets the root hold the scene nodes, but no Sprite (a sprite sits in a Node) and no YSort (it sorts a Node)', () => {
    expect(holds([]).sort()).toEqual(['collision', 'encounters', 'entity', 'group', 'objects', 'terrain', 'tile'])
  })

  it('lets a Node hold the scene nodes, Sprites, a Look, a YSort and components, at any depth', () => {
    const components = ['animatedSprite', 'area', 'body', 'event', 'mover', 'playerController', 'wander']
    const branch = ['collision', 'encounters', 'entity', 'group', 'look', 'objects', 'picture', 'terrain', 'tile', 'ySort', ...components].sort()
    expect(holds([group('g')]).sort()).toEqual(branch)
    expect(holds([group('outer'), image('i'), group('g'), group('h')]).sort()).toEqual(branch)
    // a YSort is a modifier: it holds nothing, and a Node holds one
    expect(holds([group('g'), { id: 'y', type: 'ySort', name: 'y' }])).toEqual([])
    const sorted = group('s', [{ id: 'y', type: 'ySort', name: 'y' }])
    expect(canHold([sorted], 'ySort')).toBe(false)
    expect(canHold([sorted], 'ySort', undefined, 'y')).toBe(true)
  })

  it('lets a TileMap and a Sprite hold only a Look: no sprite inside a sprite', () => {
    expect(holds([tile('t')])).toEqual(['look'])
    expect(holds([group('g'), picture('p')])).toEqual(['look'])
    expect(canHold([group('g'), picture('p')], 'picture')).toBe(false)
  })

  it('lets the map\'s StaticBody hold collision items only, and leaves hold nothing', () => {
    expect(holds([collision('c')]).sort()).toEqual(['collisionShape', 'collisionTiles'])
    for (const leaf of [terrain('x'), tilesItem('w'), shape('s')]) expect(holds([leaf])).toEqual([])
  })

  it('lets an entity hold what a Node holds, its components one of each and one movement node; a body or area one shape', () => {
    expect(holds([entity('e')]).sort()).toEqual(holds([group('g')]).sort())
    const e = entity('e', { children: [{ id: 's', type: 'animatedSprite', name: 'AnimatedSprite', props: {} }, { id: 'w', type: 'wander', name: 'Wander', props: {} }] })
    expect(canHold([e], 'animatedSprite')).toBe(false)
    expect(canHold([e], 'mover')).toBe(false) // one movement node
    expect(canHold([e], 'animatedSprite', undefined, 's')).toBe(true) // moving it within the entity
    expect(canHold([e], 'event')).toBe(true)
    const body: SceneNode = { id: 'b', type: 'body', name: 'b', children: [] }
    expect(holds([e, body])).toEqual(['collisionShape'])
    expect(canHold([e, { ...body, children: [shape('s1')] } as SceneNode], 'collisionShape')).toBe(false)
    expect(canHold([group('g')], 'animatedSprite')).toBe(true) // a Node that gets a component becomes an entity (promoteNodes)
  })

  it('holds one Look per node', () => {
    const look: SceneNode = { id: 'l', type: 'look', name: 'Look', look: {} }
    expect(canHold([tile('t', { children: [look] } as Partial<SceneNode>)], 'look')).toBe(false)
    expect(canHold([group('g', [look])], 'look')).toBe(false)
    expect(canHold([group('g', [look])], 'look', undefined, 'l')).toBe(true)
  })

  it('allows one terrain and one encounters node per map', () => {
    const tree = sample()
    expect(canHold([], 'terrain')).toBe(true)
    expect(canHold([], 'terrain', tree)).toBe(false)
    expect(canHold([], 'encounters', tree)).toBe(true)
    expect(canHold([], 'encounters', [...tree, encounters('e')])).toBe(false)
    // a node that is being moved does not count against itself
    expect(canHold([], 'terrain', tree, 'water')).toBe(true)
    expect(canHold([], 'terrain', [group('g', [terrain('t')])], 'g')).toBe(true)
  })

  it('checks a whole subtree with canPlace', () => {
    expect(canPlace([], group('g', [entity('e'), tile('t')]))).toBe(true)
    expect(canPlace([image('i')], group('g', [picture('p')]))).toBe(true)
    expect(canPlace([], group('g', [image('i', [picture('p')])]))).toBe(true)
    expect(canPlace([], group('g', [picture('p')]))).toBe(true)
    expect(canPlace([], picture('p'))).toBe(false)
    expect(canPlace([group('g')], picture('p', { children: [picture('q')] }))).toBe(false)
    const look = (id: string): SceneNode => ({ id, type: 'look', name: 'Look', look: {} })
    expect(canPlace([], tile('t', { children: [look('a'), look('b')] } as Partial<SceneNode>))).toBe(false) // two Looks
  })
})

describe('insertNode', () => {
  it('puts a node last (on top) by default and at an index when given', () => {
    const tree = sample()
    const a = insertNode(tree, null, tile('new'))
    expect(a.map((n) => n.id)).toEqual(['ground', 'town', 'sky', 'walls', 'water', 'new'])
    const b = insertNode(tree, null, tile('new'), 1)
    expect(b.map((n) => n.id)).toEqual(['ground', 'new', 'town', 'sky', 'walls', 'water'])
    const c = insertNode(tree, 'trees', entity('e2'), 0)
    expect(findNode(c, 'trees') && childrenOf(findNode(c, 'trees')!).map((n) => n.id)).toEqual(['e2', 'oak'])
    expect(insertNode(tree, null, tile('new'), 99).at(-1)!.id).toBe('new')
    expect(insertNode(tree, null, tile('new'), -5)[0].id).toBe('new')
  })

  it('copies only the path down to the change and never mutates', () => {
    const tree = deepFreeze(sample())
    const next = insertNode(tree, 'trees', entity('e2'))
    expect(next).not.toBe(tree)
    expect(next[0]).toBe(tree[0])
    expect(next[2]).toBe(tree[2])
    expect(next[1]).not.toBe(tree[1])
    expect((next[1] as GroupNode).children[0]).toBe((tree[1] as GroupNode).children[0])
  })

  it('refuses, returning the same array, what the rules forbid or what is unknown', () => {
    const tree = sample()
    expect(insertNode(tree, null, picture('p'))).toBe(tree)
    expect(insertNode(tree, 'cloud', picture('p'))).toBe(tree) // no sprite inside a sprite
    expect(insertNode(tree, 'ground', tile('t'))).toBe(tree)
    expect(insertNode(tree, 'walls', tile('t'))).toBe(tree)
    expect(insertNode(tree, 'nope', tile('t'))).toBe(tree)
    expect(insertNode(tree, null, tile('ground'))).toBe(tree) // the id is taken
    expect(insertNode(tree, null, terrain('t2'))).toBe(tree) // one terrain per map
    expect(insertNode(tree, null, group('g', [tile('houses')]))).toBe(tree) // an id below is taken
    expect(insertNode(tree, null, group('g2', [encounters('a'), encounters('b')]))).toBe(tree) // two encounters in one subtree
    expect(insertNode(tree, 'birds', picture('b3')).length).toBe(tree.length)
    expect(findNode(insertNode(tree, 'birds', picture('b3')), 'b3')).toBeDefined()
    expect(findNode(insertNode(tree, 'walls', shape('s2')), 's2')).toBeDefined()
  })
})

describe('removeNodes', () => {
  it('removes nodes with everything below them, and ignores unknown ids', () => {
    const tree = deepFreeze(sample())
    const next = removeNodes(tree, ['trees', 'cloud', 'nope'])
    expect(walk(next).map((e) => e.node.id)).toEqual(['ground', 'town', 'houses', 'npc', 'sky', 'birds', 'b1', 'b2', 'walls', 'w1', 'fence', 'water'])
    expect(removeNodes(tree, ['nope'])).toBe(tree)
    expect(removeNodes(tree, [])).toBe(tree)
    expect(removeNodes(tree, ['town', 'oak']).map((n) => n.id)).toEqual(['ground', 'sky', 'walls', 'water'])
    // untouched branches keep their identity
    expect(next[0]).toBe(tree[0])
    expect(next[3]).toBe(tree[3])
  })

  it('takes the cells of a collision tiles item with it, the default ones too', () => {
    const cell = (group?: string) => ({ tilesetId: '__collision__', x: 0, y: 0, ...(group ? { group } : {}) })
    const layer = collision('c', [tilesItem('a'), tilesItem('b'), shape('s')], { data: { 1: cell('a'), 2: cell('b'), 3: cell(), 4: cell('gone') } })
    const tree: SceneNode[] = [layer]
    expect(cellGroupOf(layer, cell())).toBe('a')
    expect(cellGroupOf(layer, cell('b'))).toBe('b')
    expect(cellGroupOf(layer, cell('gone'))).toBe('a')
    const withoutB = removeNodes(tree, ['b'])[0] as CollisionLayerNode
    expect(Object.keys(withoutB.data!)).toEqual(['1', '3', '4'])
    expect(collisionTileNodes(withoutB).map((n) => n.id)).toEqual(['a'])
    const withoutA = removeNodes(tree, ['a'])[0] as CollisionLayerNode
    // the cells of `a` (its own and the ones that defaulted to the first item) go; `b` keeps its own
    expect(Object.keys(withoutA.data!)).toEqual(['2'])
    const withoutShape = removeNodes(tree, ['s'])[0] as CollisionLayerNode
    expect(withoutShape.data).toBe(layer.data)
    expect(collisionShapeNodes(withoutShape)).toEqual([])
  })
})

describe('moveNode', () => {
  const ids = (nodes: readonly SceneNode[]) => nodes.map((n) => n.id)

  it('reorders within a parent (the index counts the siblings once the node has left)', () => {
    const tree = sample()
    expect(ids(moveNode(tree, 'ground', null, 4))).toEqual(['town', 'sky', 'walls', 'water', 'ground'])
    expect(ids(moveNode(tree, 'ground', null))).toEqual(['town', 'sky', 'walls', 'water', 'ground'])
    expect(ids(moveNode(tree, 'water', null, 0))).toEqual(['water', 'ground', 'town', 'sky', 'walls'])
    expect(ids(moveNode(tree, 'town', null, 3))).toEqual(['ground', 'sky', 'walls', 'town', 'water'])
  })

  it('returns the same array when the node would not move', () => {
    const tree = sample()
    expect(moveNode(tree, 'ground', null, 0)).toBe(tree)
    expect(moveNode(tree, 'water', null)).toBe(tree)
    expect(moveNode(tree, 'water', null, 99)).toBe(tree)
    expect(moveNode(tree, 'npc', 'town', 2)).toBe(tree)
  })

  it('reparents, into groups, out of them, and into an image layer', () => {
    const tree = deepFreeze(sample())
    const inTown = moveNode(tree, 'ground', 'town', 0)
    expect(ids(inTown)).toEqual(['town', 'sky', 'walls', 'water'])
    expect(ids(childrenOf(findNode(inTown, 'town')!))).toEqual(['ground', 'houses', 'trees', 'npc'])
    const out = moveNode(tree, 'oak', null, 1)
    expect(ids(out)).toEqual(['ground', 'oak', 'town', 'sky', 'walls', 'water'])
    expect(ids(childrenOf(findNode(out, 'trees')!))).toEqual([])
    const into = moveNode(tree, 'b1', 'sky', 0)
    expect(ids(childrenOf(findNode(into, 'sky')!))).toEqual(['b1', 'cloud', 'birds'])
    const shapeMoved = moveNode([...tree, collision('c2')], 'fence', 'c2')
    expect(ids(childrenOf(findNode(shapeMoved, 'c2')!))).toEqual(['fence'])
  })

  it('refuses a move into the node itself or one of its descendants', () => {
    const tree = sample()
    expect(moveNode(tree, 'town', 'town')).toBe(tree)
    expect(moveNode(tree, 'town', 'trees')).toBe(tree)
    expect(moveNode(tree, 'sky', 'birds')).toBe(tree)
  })

  it('refuses what the placement rules forbid', () => {
    const tree = sample()
    expect(moveNode(tree, 'cloud', null)).toBe(tree) // a sprite lives in a Node
    expect(moveNode(tree, 'cloud', 'b1')).toBe(tree) // not in another sprite
    expect(moveNode(tree, 'ground', 'walls')).toBe(tree)
    expect(moveNode(tree, 'ground', 'houses')).toBe(tree) // a leaf holds nothing
    expect(moveNode(tree, 'nope', null)).toBe(tree)
    expect(moveNode(tree, 'ground', 'nope')).toBe(tree)
    const two = [...tree, collision('c2')]
    expect(moveNode(two, 'w1', 'c2')).toBe(two) // a tiles item stays in its layer
  })

  it('does not take a collision tiles item to another layer, but reorders it in its own', () => {
    const tree: SceneNode[] = [collision('a', [tilesItem('t1'), tilesItem('t2')]), collision('b')]
    expect(moveNode(tree, 't1', 'b')).toBe(tree)
    const reordered = moveNode(tree, 't1', 'a')
    expect(ids(childrenOf(findNode(reordered, 'a')!))).toEqual(['t2', 't1'])
  })

  it('moves a terrain node around: the one-per-map rule does not count it against itself', () => {
    const tree = sample()
    const inGroup = moveNode(tree, 'water', 'town')
    expect(ids(childrenOf(findNode(inGroup, 'town')!))).toContain('water')
    const wrapped: SceneNode[] = [...tree, group('g')]
    expect(findNode(moveNode(wrapped, 'water', 'g'), 'water')).toBeDefined()
    // a group holding the terrain node moves too
    const twoDeep = moveNode([group('a', [terrain('t')]), group('b')], 'a', 'b')
    expect(ids(twoDeep)).toEqual(['b'])
  })
})

describe('updateNode and mapTree', () => {
  it('replaces one node and shares everything else', () => {
    const tree = deepFreeze(sample())
    const next = updateNode(tree, 'b2', (n) => ({ ...n, name: 'renamed' }) as SceneNode)
    expect(findNode(next, 'b2')!.name).toBe('renamed')
    expect(next[0]).toBe(tree[0])
    expect(next[2]).not.toBe(tree[2])
    expect((next[1])).toBe(tree[1])
    expect(updateNode(tree, 'b2', (n) => n)).toBe(tree)
    expect(updateNode(tree, 'nope', (n) => ({ ...n, name: 'x' }) as SceneNode)).toBe(tree)
  })

  it('maps every node, children first, and keeps the tree when nothing changes', () => {
    const tree = deepFreeze(sample())
    expect(mapTree(tree, (n) => n)).toBe(tree)
    const order: string[] = []
    mapTree(tree, (n) => {
      order.push(n.id)
      return n
    })
    expect(order.indexOf('oak')).toBeLessThan(order.indexOf('trees'))
    expect(order.indexOf('trees')).toBeLessThan(order.indexOf('town'))
    const hidden = mapTree(tree, (n) => (n.type === 'picture' ? ({ ...n, visible: false } as SceneNode) : n))
    expect(allPictures(hidden).every((p) => p.visible === false)).toBe(true)
    expect(hidden[0]).toBe(tree[0])
    expect(hidden[1]).toBe(tree[1])
  })
})

describe('copies', () => {
  const counter = () => {
    let n = 0
    return () => `n${++n}`
  }

  it('clones deeply with a new id for every node and leaves the original alone', () => {
    const tree = deepFreeze(sample())
    const copy = cloneWithNewIds(tree[1], counter()) as GroupNode
    expect(walk([copy]).map((e) => e.node.id)).toEqual(['n1', 'n2', 'n3', 'n4', 'n5'].map((id) => id)) // in tree order, ids handed out depth first
    const copyIds = walk([copy]).map((e) => e.node.id)
    expect(new Set(copyIds).size).toBe(copyIds.length)
    expect(copyIds.some((id) => nodeIds(tree).has(id))).toBe(false)
    expect(walk([copy]).map((e) => e.node.type)).toEqual(walk([tree[1]]).map((e) => e.node.type))
    expect(copy.children[0]).not.toBe((tree[1] as GroupNode).children[0])
  })

  it('remaps the group of collision cells to the cloned tiles items', () => {
    const cell = (group?: string) => ({ tilesetId: '__collision__', x: 0, y: 0, ...(group ? { group } : {}) })
    const layer = collision('c', [tilesItem('a'), tilesItem('b'), shape('s')], { data: { 1: cell('a'), 2: cell('b'), 3: cell(), 4: cell('other') } })
    const copy = cloneWithNewIds(layer, counter())
    const [ta, tb] = collisionTileNodes(copy)
    expect(copy.data![1].group).toBe(ta.id)
    expect(copy.data![2].group).toBe(tb.id)
    expect(copy.data![3].group).toBeUndefined()
    expect(copy.data![4].group).toBe('other') // dangling stays dangling
    expect(ta.id).not.toBe('a')
    expect(layer.data![1].group).toBe('a')
    expect(copy.data).not.toBe(layer.data)
  })

  it('duplicates next to the original, in the same parent', () => {
    const tree = deepFreeze(sample())
    const { nodes, copy } = duplicateNode(tree, 'trees', counter(), (n) => `${n} Copy`)
    expect(copy!.name).toBe('trees Copy')
    expect(ids(childrenOf(findNode(nodes, 'town')!))).toEqual(['houses', 'trees', copy!.id, 'npc'])
    expect(duplicateNode(tree, 'nope', counter())).toEqual({ nodes: tree, copy: null })
    // one terrain per map: its copy is refused
    const again = duplicateNode(tree, 'water', counter())
    expect(again.nodes).toBe(tree)
    expect(again.copy).toBeNull()
    // a picture is copied inside its image layer
    expect(ids(childrenOf(findNode(duplicateNode(tree, 'cloud', counter()).nodes, 'sky')!))).toHaveLength(3)
  })

  const ids = (nodes: readonly SceneNode[]) => nodes.map((n) => n.id)
})

describe('flat views', () => {
  it('lists entities, layers and pictures in tree order', () => {
    const tree = sample()
    expect(allEntities(tree).map((e) => e.id)).toEqual(['oak', 'npc'])
    expect(layerNodes(tree).map((l) => l.id)).toEqual(['ground', 'houses', 'walls', 'water'])
    expect(layerNodesInListOrder(tree).map((l) => l.id)).toEqual(['water', 'walls', 'houses', 'ground'])
    expect(picturesOf(tree[2]).map((p) => p.id)).toEqual(['cloud', 'b1', 'b2'])
    expect(picturesOf(findNode(tree, 'birds')!).map((p) => p.id)).toEqual(['b1', 'b2'])
    expect(picturesOf(tree[0])).toEqual([])
    expect(allPictures(tree).map((p) => p.id)).toEqual(['cloud', 'b1', 'b2'])
  })
})

describe('inherited properties', () => {
  it('is hidden or locked when any ancestor is', () => {
    const tree = sample()
    const hiddenTown = updateNode(tree, 'town', (n) => ({ ...n, visible: false, locked: true }) as SceneNode)
    const oak = locate(hiddenTown, 'oak')!
    expect(isVisible(oak.node, oak.ancestors)).toBe(false)
    expect(isLocked(oak.node, oak.ancestors)).toBe(true)
    const sky = locate(hiddenTown, 'sky')!
    expect(isVisible(sky.node, sky.ancestors)).toBe(true)
    expect(isLocked(sky.node, sky.ancestors)).toBe(false)
    const own = updateNode(tree, 'houses', (n) => ({ ...n, visible: false }) as SceneNode)
    expect(isVisible(findNode(own, 'houses')!, [])).toBe(false)
    expect(isVisible(findNode(own, 'houses')!, ancestorsOf(own, 'houses')!)).toBe(false)
    expect(isVisible(findNode(own, 'npc')!, ancestorsOf(own, 'npc')!)).toBe(true)
  })

  it('y-sort: a Node holding a shown YSort and everything below it sorts by its feet, nothing else does', () => {
    const at = (tree: SceneNode[], id: string) => {
      const found = locate(tree, id)!
      return { sorted: effectiveYSort(found.node, found.ancestors), inherited: inheritedYSort(found.ancestors) }
    }
    const p = picture('p')
    expect(at([group('outer', [image('layer', [group('inner', [p])])])], 'p')).toEqual({ sorted: false, inherited: false })
    const sorted: SceneNode[] = [group('outer', [group('ys', [group('inner', [p]), { id: 'mod', type: 'ySort', name: 'YSort' }])])]
    expect(at(sorted, 'p')).toEqual({ sorted: true, inherited: true })
    expect(at(sorted, 'ys')).toEqual({ sorted: true, inherited: false })
    expect(at(sorted, 'outer')).toEqual({ sorted: false, inherited: false })
    // a hidden YSort is off
    const off: SceneNode[] = [group('ys', [p, { id: 'mod', type: 'ySort', name: 'YSort', visible: false }])]
    expect(at(off, 'p')).toEqual({ sorted: false, inherited: false })
  })

  it('multiplies opacity down the tree', () => {
    const p = picture('p', { opacity: 0.5 })
    const tree: SceneNode[] = [group('g', [image('i', [p])])]
    const at = locate(tree, 'p')!
    expect(effectiveOpacity(at.node, at.ancestors)).toBe(0.5)
    expect(effectiveOpacity(picture('q'), [])).toBe(1)
    const groupWithOpacity = { ...tree[0], opacity: 0.5 } as unknown as SceneNode
    expect(effectiveOpacity(at.node, [groupWithOpacity, ...at.ancestors.slice(1)])).toBe(0.25) // a Node's opacity multiplies too
  })

  it('finds the nearest value of any property', () => {
    const tree: SceneNode[] = [group('a', [group('b', [tile('t')])], { z: 5 }), group('c', [tile('u')])]
    const t = locate(tree, 't')!
    expect(inheritedValue(t.node, t.ancestors, (n) => (n.type === 'group' ? n.z : undefined))).toBe(5)
    const u = locate(tree, 'u')!
    expect(inheritedValue(u.node, u.ancestors, (n) => (n.type === 'group' ? n.z : undefined))).toBeUndefined()
    expect(inheritedValue(undefined, [], () => 1)).toBeUndefined()
  })
})
