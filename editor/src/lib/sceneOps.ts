// The editing operations of the scene tree that the managers and panels share, as pure functions over `SceneNode[]`: making
// nodes (names, where a new one goes), copies (copy, paste, duplicate), grouping, deleting, flags, and the pictures' draw
// order. Each returns the very same array when it changes nothing, so a caller can skip the history step.
// The primitives (insert, move, remove, update, the placement rules) are in shared/sceneTree.ts.

import {
  canHold,
  canPlace,
  childrenOf,
  cloneWithNewIds,
  drawOrderPictures,
  findNode,
  findPath,
  insertNode,
  isContainer,
  locate,
  moveNode,
  removeNodes,
  updateNode,
  walk,
  collisionLayerLike,
  mapTree,
  type CollisionLayerNode,
  type ContainerNode,
  type EntityNode,
  type PictureNode,
  type SceneNode,
  type SceneNodeType,
} from '../../../shared/sceneTree'
import { ENTITIES_GROUP_ID } from '../../../shared/sceneTreeMigrate'
import { assignNewCells, hasNewCells, nextTileGroupName } from '../../../shared/collisionLayers'
import { cloneEntity } from '../../../shared/engine/components'
import { withDerivedFree } from '../../../shared/engine/placement'
import type { EngineEntity } from '../../../shared/engine/types'
import { imagePickName } from './graphicAssets'
import { nextImageName } from './imageItems'

// ── names ──────────────────────────────────────────────────────────────────────────────────────────

/** `base`, else `base 2`, `base 3`...: the first one not in `taken`. */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  if (!used.has(base)) return base
  const stem = base.replace(/ \d+$/, '')
  for (let n = 2; ; n++) if (!used.has(`${stem} ${n}`)) return `${stem} ${n}`
}

const allNames = (nodes: readonly SceneNode[]): Set<string> => new Set(walk(nodes).map((e) => e.node.name))

/** The name a new node of `type` gets: "Layer 1", "Collision", "Images 2", "Group", "Entity 3"... (free among the tree's names). */
export function newNodeName(nodes: readonly SceneNode[], type: SceneNodeType): string {
  const taken = allNames(nodes)
  if (type === 'tile') {
    let n = 1
    while (taken.has(`Layer ${n}`)) n++
    return `Layer ${n}`
  }
  if (type === 'entity') {
    let n = 1
    while (taken.has(`Entity ${n}`)) n++
    return `Entity ${n}`
  }
  const base: Partial<Record<SceneNodeType, string>> = {
    collision: 'Collision',
    terrain: 'Terrain',
    encounters: 'Encounters',
    image: 'Images',
    objects: 'Objects',
    group: 'Group',
    collisionTiles: 'Tiles',
    collisionShape: 'Shape',
    picture: 'Picture',
  }
  return uniqueName(base[type] ?? 'Node', taken)
}

/** `name` + " Copy", " Copy 2"...: free among `taken` (the names are added to it). */
export function copyName(name: string, taken: Set<string>): string {
  let out = `${name} Copy`
  for (let n = 2; taken.has(out); n++) out = `${name} Copy ${n}`
  taken.add(out)
  return out
}

// ── making layers and groups ───────────────────────────────────────────────────────────────────────

export type NewNodeType = 'group' | 'tile' | 'image' | 'collision' | 'terrain' | 'encounters' | 'objects'

/** An empty node of a type (no id clash is checked here). */
export function makeNode(type: NewNodeType, id: string, name: string): SceneNode {
  if (type === 'group' || type === 'image') return { id, type, name, children: [] }
  if (type === 'collision') return { id, type, name, data: {}, children: [] }
  return { id, type, name }
}

const SPECIAL_LAYERS: readonly SceneNodeType[] = ['collision', 'terrain', 'encounters']

/**
 * Where a new node goes among the children of `parent`: the top (last), except that a tile or image layer goes below the
 * special layers (collision, terrain, encounters) that sit at the top, which stay on top by default.
 */
export function defaultIndex(children: readonly SceneNode[], type: SceneNodeType): number {
  if (type !== 'tile' && type !== 'image') return children.length
  let at = children.length
  while (at > 0 && SPECIAL_LAYERS.includes(children[at - 1].type)) at--
  return at
}

/**
 * The container a new node of `type` goes into when made next to / from `anchorId`: the anchor itself when it holds that
 * type, else the nearest container above it that does (up to the map root, the empty path).
 */
export function parentPathFor(nodes: readonly SceneNode[], type: SceneNodeType, anchorId?: string | null): readonly SceneNode[] {
  const path = anchorId ? findPath(nodes as SceneNode[], anchorId) : undefined
  if (path) {
    const anchor = path[path.length - 1]
    if (isContainer(anchor) && canHold(path, type, nodes)) return path
    for (let i = path.length - 1; i >= 0; i--) if (canHold(path.slice(0, i), type, nodes)) return path.slice(0, i)
  }
  return []
}

/** `node` made at the default place next to `anchorId` (see `parentPathFor`); the same tree and null when it is refused (one terrain / encounters per map). */
export function addNode(nodes: SceneNode[], node: SceneNode, anchorId?: string | null): { nodes: SceneNode[]; node: SceneNode | null } {
  const path = parentPathFor(nodes, node.type, anchorId)
  const parent = path[path.length - 1] as ContainerNode | undefined
  const children = parent ? parent.children : nodes
  const next = insertNode(nodes, parent?.id ?? null, node, defaultIndex(children, node.type))
  if (next === nodes) return { nodes, node: null }
  return { nodes: next, node }
}

/**
 * Puts a new entity where the selection points: inside the selected group that can hold it, right after the selected
 * entity, otherwise in the "Entities" group when the map has it, else next to the selection or on top of the root.
 */
export function addEntity(nodes: SceneNode[], entity: EntityNode, anchorId?: string | null): SceneNode[] {
  const anchor = anchorId ? findNode(nodes, anchorId) : undefined
  const path = anchor ? findPath(nodes, anchor.id) : undefined
  if (anchor && path) {
    if (anchor.type === 'group' && canHold(path, 'entity', nodes)) return insertNode(nodes, anchor.id, entity)
    if (anchor.type === 'entity') {
      const at = locate(nodes, anchor.id)
      if (at) return insertNode(nodes, at.parent?.id ?? null, entity, at.index + 1)
    }
  }
  const home = findNode(nodes, ENTITIES_GROUP_ID)
  const homePath = home ? findPath(nodes, home.id) : undefined
  if (home && homePath && canHold(homePath, 'entity', nodes)) return insertNode(nodes, home.id, entity)
  const parent = parentPathFor(nodes, 'entity', anchorId)
  return insertNode(nodes, parent[parent.length - 1]?.id ?? null, entity)
}

// ── flags and fields ───────────────────────────────────────────────────────────────────────────────

/** The node with `key` set, or without it when `value` is `undefined` or the default (`visible: true`, `locked: false`). */
function withField<T extends SceneNode>(node: T, key: string, value: unknown, dropWhen?: unknown): T {
  const current = (node as unknown as Record<string, unknown>)[key]
  if (value === undefined || value === dropWhen) {
    if (current === undefined) return node
    const { [key]: _gone, ...rest } = node as unknown as Record<string, unknown>
    return rest as unknown as T
  }
  return current === value ? node : ({ ...node, [key]: value } as T)
}

/** Shows or hides a node (the node's own flag; what its ancestors say is counted when reading, see `shown`). */
export const setVisible = (nodes: SceneNode[], id: string, visible: boolean): SceneNode[] => updateNode(nodes, id, (n) => withField(n, 'visible', visible, true))
/** Locks or unlocks a node. */
export const setLocked = (nodes: SceneNode[], id: string, locked: boolean): SceneNode[] => updateNode(nodes, id, (n) => withField(n, 'locked', locked, false))
/** Opening or closing a container in the list (a view change: callers do not record it in the history). */
export const setCollapsed = (nodes: SceneNode[], id: string, collapsed: boolean): SceneNode[] => updateNode(nodes, id, (n) => (isContainer(n) ? withField(n, 'collapsed', collapsed, false) : n))

/** The tree with every group and layer above `id` opened (a node that was just made or moved into a closed group shows). */
export function expandTo(nodes: SceneNode[], id: string): SceneNode[] {
  const path = findPath(nodes, id)
  if (!path) return nodes
  return path.slice(0, -1).reduce((acc, a) => (isContainer(a) && a.collapsed ? setCollapsed(acc, a.id, false) : acc), nodes)
}

/** `restored` with the open / closed state of every container `current` also has: undo does not reopen what the author closed. */
export function carryView(current: readonly SceneNode[], restored: SceneNode[]): SceneNode[] {
  const closed = new Map<string, boolean>()
  for (const { node } of walk(current)) if (isContainer(node)) closed.set(node.id, node.collapsed === true)
  return mapTree(restored, (n) => {
    if (!isContainer(n) || !closed.has(n.id)) return n
    return withField(n, 'collapsed', closed.get(n.id) === true ? true : undefined)
  })
}

/** Y-sort on, off or (undefined) following the parent, for a group, image layer or picture. */
export const setYSort = (nodes: SceneNode[], id: string, value: boolean | undefined): SceneNode[] =>
  updateNode(nodes, id, (n) => (n.type === 'group' || n.type === 'image' || n.type === 'picture' ? withField(n, 'ySort', value) : n))

/** Renames a node (a blank name is ignored). */
export function renameNode(nodes: SceneNode[], id: string, name: string): SceneNode[] {
  const clean = name.trim()
  if (!clean) return nodes
  return updateNode(nodes, id, (n) => (n.name === clean ? n : { ...n, name: clean }))
}

/** Applies a patch of fields to a node; the same tree when none of them differs. */
export function patchNode(nodes: SceneNode[], id: string, patch: Record<string, unknown>): SceneNode[] {
  return updateNode(nodes, id, (n) => {
    const cur = n as unknown as Record<string, unknown>
    if (!Object.keys(patch).some((k) => cur[k] !== patch[k])) return n
    return { ...n, ...patch } as SceneNode
  })
}

// ── locks ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Whether a place (the path from the root to a container) is locked: it, or something above it, has its lock on. A locked
 * group inside an image layer is not counted: that lock only makes a click on its pictures pick the group as a whole.
 */
export function isLockedPlace(path: readonly SceneNode[]): boolean {
  const imageAt = path.findIndex((n) => n.type === 'image')
  return path.some((n, i) => n.locked === true && !(n.type === 'group' && imageAt !== -1 && i > imageAt))
}

// ── groups, deleting ───────────────────────────────────────────────────────────────────────────────

/** Ids of `ids` that are not inside another id of the list (copying or deleting a group already takes what is inside it). */
export function topLevelIds(nodes: readonly SceneNode[], ids: readonly string[]): string[] {
  const wanted = new Set(ids)
  return walk(nodes)
    .filter((e) => wanted.has(e.node.id) && !e.ancestors.some((a) => wanted.has(a.id)))
    .map((e) => e.node.id)
}

/**
 * The nodes `ids` put into one new group, which sits where the highest of them was. They must share a parent that can
 * hold a group (and the nodes inside it); returns the same tree and null otherwise.
 */
export function groupNodes(nodes: SceneNode[], ids: readonly string[], groupId: string, name: string): { nodes: SceneNode[]; group: SceneNode | null } {
  const tops = topLevelIds(nodes, ids)
  if (tops.length === 0) return { nodes, group: null }
  const places = tops.map((id) => locate(nodes, id)).filter((at): at is NonNullable<typeof at> => !!at)
  const parentId = places[0].parent?.id ?? null
  if (places.some((at) => (at.parent?.id ?? null) !== parentId)) return { nodes, group: null }
  const parentPath = places[0].ancestors
  if (isLockedPlace(parentPath)) return { nodes, group: null }
  const group: SceneNode = { id: groupId, type: 'group', name, children: places.sort((a, b) => a.index - b.index).map((at) => at.node) }
  if (!canPlace(parentPath, group)) return { nodes, group: null }
  const at = Math.max(...places.map((p) => p.index))
  const without = removeNodes(nodes, tops)
  // The group takes the place of the highest member (its index among what is left).
  const index = at - (places.length - 1)
  const next = insertNode(without, parentId, group, index)
  return next === without ? { nodes, group: null } : { nodes: next, group }
}

/** A group dissolved: what it held takes its place, in the same order. The same tree when a child cannot go where the group is. */
export function ungroupNode(nodes: SceneNode[], groupId: string): SceneNode[] {
  const at = locate(nodes, groupId)
  if (!at || at.node.type !== 'group') return nodes
  const group = at.node
  if (isLockedPlace(at.ancestors)) return nodes
  if (!group.children.every((c) => canPlace(at.ancestors, c, nodes, groupId))) return nodes
  const parentId = at.parent?.id ?? null
  const without = removeNodes(nodes, [groupId])
  let next = without
  group.children.forEach((child, i) => {
    next = insertNode(next, parentId, child, at.index + i)
  })
  return next
}

/** The tree without these nodes and what is inside them (a tiles item takes its cells with it). */
export const deleteNodes = (nodes: SceneNode[], ids: readonly string[]): SceneNode[] => removeNodes(nodes, topLevelIds(nodes, ids))

/** How many nodes would go with `ids` (they included). */
export function countWithin(nodes: readonly SceneNode[], ids: readonly string[]): number {
  return topLevelIds(nodes, ids).reduce((n, id) => {
    const node = findNode(nodes as SceneNode[], id)
    return n + (node ? walk([node]).length : 0)
  }, 0)
}

// ── copies ─────────────────────────────────────────────────────────────────────────────────────────

/** What copying `ids` takes: the nodes that are not inside another picked one, in tree order, each with what is inside it. Tiles items are not copied alone (their cells belong to the layer). */
export function copiesOf(nodes: readonly SceneNode[], ids: readonly string[]): SceneNode[] {
  const tops = new Set(topLevelIds(nodes, ids))
  return walk(nodes)
    .filter((e) => tops.has(e.node.id) && e.node.type !== 'collisionTiles')
    .map((e) => JSON.parse(JSON.stringify(e.node)) as SceneNode)
}

const COPY_OFFSET = 32

/** A copy with every entity in it given fresh event ids and its position moved. */
function movedCopy(node: SceneNode, dx: number, dy: number): SceneNode {
  const shift = (n: SceneNode): SceneNode => {
    if (n.type === 'entity') {
      const cloned = cloneEntity(n as unknown as EngineEntity, true) as unknown as EntityNode
      const entity: EntityNode = { ...cloned, id: n.id, x: n.x + dx, y: n.y + dy }
      const transform = entity.components.Transform
      if (transform) entity.components = { ...entity.components, Transform: { ...transform, x: entity.x, y: entity.y } }
      return withDerivedFree(entity)
    }
    if (n.type === 'picture') return { ...n, x: n.x + dx, y: n.y + dy }
    if (n.type === 'collisionShape') return { ...n, points: n.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) }
    return n
  }
  return mapTree([node], shift)[0]
}

/** Where `node` goes when put next to `targetId`: inside it (a container that can hold it) or beside it (below layers / groups, above the rest). */
function destinationFor(
  nodes: SceneNode[],
  node: SceneNode,
  targetId: string | null,
  mode: 'inside' | 'beside'
): { parentId: string | null; index?: number } | null {
  const at = targetId ? locate(nodes, targetId) : undefined
  if (at) {
    const path = [...at.ancestors, at.node]
    if (mode === 'inside' && isContainer(at.node) && !isLockedPlace(path) && canPlace(path, node, nodes)) return { parentId: at.node.id }
    // Beside: climb until a container can take it, putting it right next to the node we came from.
    let child: SceneNode = at.node
    for (let i = path.length - 2; i >= -1; i--) {
      const parentPath = path.slice(0, i + 1)
      if (!isLockedPlace(parentPath) && canPlace(parentPath, node, nodes)) {
        const parent = parentPath[parentPath.length - 1] as ContainerNode | undefined
        const siblings = parent ? parent.children : nodes
        const idx = siblings.indexOf(child)
        // Layers and groups go below, pictures (and groups of pictures), entities and shapes above.
        const below = node.type !== 'entity' && node.type !== 'picture' && node.type !== 'collisionShape' && !(node.type === 'group' && parentPath.some((n) => n.type === 'image'))
        return { parentId: parent?.id ?? null, index: below ? idx : idx + 1 }
      }
      child = parentPath[parentPath.length - 1]
    }
    return null
  }
  // No target: entities go to the "Entities" group when there is one, everything else on top of the root.
  if (node.type === 'entity') {
    const home = findNode(nodes, ENTITIES_GROUP_ID)
    if (home && canPlace(findPath(nodes, home.id) ?? [], node, nodes)) return { parentId: home.id }
  }
  return canPlace([], node, nodes) ? { parentId: null } : null
}

export interface PasteOptions {
  /** Pictures: the first one lands here (the cursor); without it copies are put a tile down-right of the originals. */
  at?: { x: number; y: number } | null
  /** `inside` puts copies into the target container (paste); `beside` always puts them next to it (duplicate). */
  mode?: 'inside' | 'beside'
  /** Copies are moved a tile down-right (default: yes for pictures, entities and shapes). */
  offset?: boolean
}

/**
 * Copies put into the tree next to `targetId` (see `destinationFor`): new ids, names made free ("Wall Copy", pictures
 * "Tree 2"), pictures, entities and shapes moved. A copy that fits nowhere is dropped. Returns the new tree and the ids made.
 */
export function pasteCopies(nodes: SceneNode[], copies: readonly SceneNode[], targetId: string | null, newId: () => string, options: PasteOptions = {}): { nodes: SceneNode[]; ids: string[] } {
  const { at = null, mode = 'inside', offset = true } = options
  let tree = nodes
  const ids: string[] = []
  const taken = allNames(nodes)
  const firstPicture = copies.map((c) => walk([c]).find((e) => e.node.type === 'picture')?.node as PictureNode | undefined).find((p) => !!p)
  // Copies of the same kind that fit in the same place stay together, in order.
  let last: { parentId: string | null; index: number } | null = null
  for (const copy of copies) {
    const dx = firstPicture && at ? at.x - firstPicture.x : offset ? COPY_OFFSET : 0
    const dy = firstPicture && at ? at.y - firstPicture.y : offset ? COPY_OFFSET : 0
    let fresh = cloneWithNewIds(copy, newId)
    fresh = movedCopy(fresh, dx, dy)
    let dest = destinationFor(tree, fresh, targetId, mode)
    if (last && dest && (dest.parentId ?? null) === last.parentId) dest = { parentId: last.parentId, index: last.index + 1 }
    if (!dest) continue
    // Names: a picture takes a free "Name 2" among the pictures of its layer, the rest a free "Name Copy".
    if (fresh.type === 'picture') {
      const layerId = dest.parentId
      const layerPath = layerId ? findPath(tree, layerId) : undefined
      const layer = layerPath?.find((n) => n.type === 'image')
      const names = (layer ? drawOrderPictures(layer) : []).map((p) => p.name || imagePickName(p))
      fresh = { ...fresh, name: nextImageName(fresh.name || imagePickName(fresh), names) }
    } else {
      fresh = { ...fresh, name: copyName(fresh.name, taken) }
    }
    const next = insertNode(tree, dest.parentId, fresh, dest.index)
    if (next === tree) continue
    tree = next
    ids.push(fresh.id)
    const placed = locate(tree, fresh.id)
    last = placed ? { parentId: placed.parent?.id ?? null, index: placed.index } : null
  }
  return { nodes: tree, ids }
}

/** Duplicates `ids`: copies go next to the originals (layers and groups below the lowest one, the rest above the last one). */
export function duplicateNodes(nodes: SceneNode[], ids: readonly string[], newId: () => string): { nodes: SceneNode[]; ids: string[] } {
  const copies = copiesOf(nodes, ids)
  if (copies.length === 0) return { nodes, ids: [] }
  const order = walk(nodes)
  const originals = copies.map((c) => order.find((e) => e.node.id === c.id)).filter((e): e is NonNullable<typeof e> => !!e)
  const layerLike = originals.every(({ node, ancestors }) => node.type !== 'entity' && node.type !== 'picture' && node.type !== 'collisionShape' && !(node.type === 'group' && ancestors.some((a) => a.type === 'image')))
  const anchor = layerLike ? originals[0] : originals[originals.length - 1]
  return pasteCopies(nodes, copies, anchor.node.id, newId, { mode: 'beside' })
}

// ── dragging nodes in the list ─────────────────────────────────────────────────────────────────────

/** Where dropped nodes land relative to the row they were dropped on: above it in the list, below it, or inside it (a container). */
export type DropWhere = 'above' | 'below' | 'inside'

/** The place a node dropped `where` on `targetId` would take: its parent path, and (for a drop beside) the index among the parent's children. */
export function dropPlace(nodes: readonly SceneNode[], targetId: string, where: DropWhere): { parentPath: readonly SceneNode[]; index?: number } | null {
  const at = locate(nodes as SceneNode[], targetId)
  if (!at) return null
  if (where === 'inside') return isContainer(at.node) ? { parentPath: [...at.ancestors, at.node] } : null
  // The list shows the last child first: above a row is later in the draw order, below it earlier.
  return { parentPath: at.ancestors, index: where === 'above' ? at.index + 1 : at.index }
}

/** Whether every one of `ids` (and what is inside them) may be dropped `where` on `targetId`. */
export function canDrop(nodes: readonly SceneNode[], ids: readonly string[], targetId: string, where: DropWhere): boolean {
  const place = dropPlace(nodes, targetId, where)
  if (!place) return false
  const tops = topLevelIds(nodes, ids)
  if (tops.length === 0 || tops.includes(targetId)) return false
  return tops.every((id) => {
    const at = locate(nodes as SceneNode[], id)
    if (!at) return false
    // Not into itself, nor into something it holds.
    if (place.parentPath.some((n) => n.id === id)) return false
    // A tiles item is only reordered inside its own layer.
    if (at.node.type === 'collisionTiles' && (at.parent?.id ?? null) !== (place.parentPath[place.parentPath.length - 1]?.id ?? null)) return false
    return !isLockedPlace(place.parentPath) && canPlace(place.parentPath, at.node, nodes as SceneNode[], id)
  })
}

/**
 * The nodes `ids` moved to where they are dropped on `targetId`, keeping their order among themselves; pictures settle
 * their `z` on the picture they land next to. The same tree when it is refused.
 */
export function moveNodesTo(nodes: SceneNode[], ids: readonly string[], targetId: string, where: DropWhere): SceneNode[] {
  if (!canDrop(nodes, ids, targetId, where)) return nodes
  const tops = topLevelIds(nodes, ids)
  let next = nodes
  let previous: string | null = null
  for (const id of tops) {
    const target = locate(next, targetId)
    if (!target) break
    let parentId: string | null
    let index: number | undefined
    if (where === 'inside') {
      parentId = target.node.id
      index = undefined
    } else {
      const anchor = previous ? locate(next, previous) : target
      if (!anchor) break
      parentId = anchor.parent?.id ?? null
      index = previous || where === 'above' ? anchor.index + 1 : anchor.index
      // `moveNode` counts the index once the node has left its place: one less when it leaves from before the anchor.
      const from = locate(next, id)
      if (from && (from.parent?.id ?? null) === parentId && from.index < anchor.index) index -= 1
    }
    const moved = moveNode(next, id, parentId, index)
    if (moved === next) continue
    next = settlePictureZ(moved, id)
    previous = id
  }
  return next
}

// ── collision items ────────────────────────────────────────────────────────────────────────────────

/**
 * The collision layer with newly painted cells (`data`): they join the tiles item `pickedId` when it is one of the layer's;
 * with none picked (or a shape picked) a new tiles item is made first. Returns the layer and the tiles item the cells joined.
 */
export function paintCollision(layer: CollisionLayerNode, data: NonNullable<CollisionLayerNode['data']>, pickedId: string | null, newId: () => string): { layer: CollisionLayerNode; tilesId: string | null; created: boolean } {
  if (!hasNewCells(layer, data)) return { layer: { ...layer, data }, tilesId: null, created: false }
  const like = collisionLayerLike(layer)
  const tiles = like.tileGroups ?? []
  let tilesId = pickedId && tiles.some((g) => g.id === pickedId) ? pickedId : null
  let children = layer.children
  let created = false
  if (!tilesId) {
    const id = newId()
    children = [...layer.children, { id, type: 'collisionTiles', name: nextTileGroupName(like) }]
    tilesId = id
    created = true
  }
  return { layer: { ...layer, children, data: assignNewCells(layer, data, tilesId) }, tilesId, created }
}

// ── pictures: draw order ───────────────────────────────────────────────────────────────────────────

/**
 * One step toward the front (+1) or back (-1) in the draw order of an image layer. Neighbours with different `z` trade
 * their `z`; neighbours with the same `z` trade places in the tree (or, from different groups, the mover takes a `z` just
 * beyond the neighbour's).
 */
export function movePictureStep(nodes: SceneNode[], layerId: string, pictureId: string, direction: 1 | -1): SceneNode[] {
  const layer = findNode(nodes, layerId)
  if (!layer || layer.type !== 'image') return nodes
  const sorted = drawOrderPictures(layer)
  const from = sorted.findIndex((p) => p.id === pictureId)
  const to = from + direction
  if (from === -1 || to < 0 || to >= sorted.length) return nodes
  const a = sorted[from]
  const b = sorted[to]
  if ((a.z ?? 0) !== (b.z ?? 0)) {
    const az = a.z ?? 0
    const bz = b.z ?? 0
    return updateNode(updateNode(nodes, a.id, (n) => ({ ...n, z: bz }) as SceneNode), b.id, (n) => ({ ...n, z: az }) as SceneNode)
  }
  const pa = locate(nodes, a.id)
  const pb = locate(nodes, b.id)
  if (!pa || !pb) return nodes
  if ((pa.parent?.id ?? null) === (pb.parent?.id ?? null)) {
    // Same container: the two swap places.
    const swap = (children: SceneNode[]) => {
      const next = children.slice()
      next[pa.index] = pb.node
      next[pb.index] = pa.node
      return next
    }
    return pa.parent ? updateNode(nodes, pa.parent.id, (n) => (isContainer(n) ? { ...n, children: swap(n.children) } : n)) : swap(nodes)
  }
  return updateNode(nodes, a.id, (n) => ({ ...n, z: (b.z ?? 0) + direction }) as SceneNode)
}

/**
 * After a picture (or a group of pictures) was moved in the tree: its pictures take the `z` of the picture they now draw
 * next to, so the new tree order decides (pictures with the same `z` draw in tree order).
 */
export function settlePictureZ(nodes: SceneNode[], id: string): SceneNode[] {
  const at = locate(nodes, id)
  if (!at) return nodes
  const layer = at.ancestors.find((n) => n.type === 'image')
  if (!layer || (at.node.type !== 'picture' && at.node.type !== 'group')) return nodes
  const moving = new Set(at.node.type === 'picture' ? [id] : pictureIdsBelow(at.node))
  if (moving.size === 0) return nodes
  const flat = walk([layer]).filter((e) => e.node.type === 'picture').map((e) => e.node as PictureNode)
  const first = flat.findIndex((p) => moving.has(p.id))
  const last = flat.length - 1 - [...flat].reverse().findIndex((p) => moving.has(p.id))
  const neighbour = flat[first - 1] ?? flat[last + 1]
  if (!neighbour) return nodes
  const z = neighbour.z ?? 0
  return flat.filter((p) => moving.has(p.id) && (p.z ?? 0) !== z).reduce((acc, p) => updateNode(acc, p.id, (n) => ({ ...n, z }) as SceneNode), nodes)
}

/** Every container is walked to find where pictures are in a group: all pictures below a node. */
export const pictureIdsBelow = (node: SceneNode): string[] => walk(childrenOf(node)).filter((e) => e.node.type === 'picture').map((e) => e.node.id)
