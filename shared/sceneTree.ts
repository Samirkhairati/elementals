// The scene tree of a map: one tree of nodes for everything a map holds (groups, tile / image / collision / terrain /
// encounters / objects layers, pictures, collision items, entities), the way Godot's scene tree works. See
// docs/node-tree-plan.md ("Implementation decisions") for the model and docs/maps.md for the file format (schema 6).
//
// A map's `nodes` are the children of the map root. Children are stored in DRAW ORDER: the first child draws first, at
// the back. The editor's panel lists a container's children last-first, so the top row is the one drawn on top.
//
// Everything here is pure and immutable: an operation that changes nothing (or is refused) returns the very same array
// or object it was given; a change copies only the path down to what changed. No DOM, Node or editor imports; keep the
// syntax type-strippable (no enums, namespaces or parameter properties).

import type { ShapePoint } from './collisionShapes.ts'
import type { LookSet } from './look/types.ts'
import type { EditorImageCrop, EditorTile } from './mapTypes.ts'
import { cellGroupId, collisionItems } from './collisionLayers.ts'
import type { CollisionItem, CollisionLayerLike } from './collisionLayers.ts'
import { cloneJson } from './engine/util.ts'

// ── node types ─────────────────────────────────────────────────────────────────────────────────────

export type SceneNodeType =
  | 'group'
  | 'tile'
  | 'image'
  | 'picture'
  | 'collision'
  | 'collisionTiles'
  | 'collisionShape'
  | 'terrain'
  | 'encounters'
  | 'objects'
  | 'entity'

/** Cells of a layer node: the map cell index -> the tile (a collision layer's cells are `__collision__` markers). */
export type NodeCells = Record<number | string, EditorTile>

interface NodeBase {
  id: string
  type: SceneNodeType
  name: string
  /** Absent = shown. */
  visible?: boolean
  /** Absent = unlocked. */
  locked?: boolean
}

interface ContainerFields {
  /** In draw order (the first child draws first). */
  children: SceneNode[]
  /** Shown closed in the list (view state, not an undo step). */
  collapsed?: boolean
}

/** Holds anything its place allows (see `canHold`): the folders, picture groups and entity folders of old maps. */
export interface GroupNode extends NodeBase, ContainerFields {
  type: 'group'
  /** Y-sort for the pictures below that have no setting of their own (nearest set value wins); absent = follow the parent. */
  ySort?: boolean
}

export interface TileLayerNode extends NodeBase {
  type: 'tile'
  data?: NodeCells
  z?: number
  look?: LookSet
}

/** Holds pictures and groups of pictures. */
export interface ImageLayerNode extends NodeBase, ContainerFields {
  type: 'image'
  z?: number
  ySort?: boolean
  look?: LookSet
}

/**
 * One freely placed picture of an image layer, drawn at a pixel position (its anchor: bottom-centre of the picture). It is
 * either a sprite asset (`assetId`) or a plain picture from the graphics library (`graphicId`), never both.
 */
export interface PictureNode extends NodeBase {
  type: 'picture'
  /** Sprite (character) id, e.g. `objects/chest`. */
  assetId?: string
  /** Graphic id (a picture under project/graphics), e.g. `scenery/clouds.png`. */
  graphicId?: string
  crop?: EditorImageCrop
  x: number
  y: number
  /** Draw order inside the layer (ties keep tree order). */
  z?: number
  scale?: number
  flipX?: boolean
  flipY?: boolean
  opacity?: number
  ySort?: boolean
  look?: LookSet
}

/** Holds collision items: sets of painted tiles and single shapes. The painted cells are this node's `data`. */
export interface CollisionLayerNode extends NodeBase, ContainerFields {
  type: 'collision'
  /** Cells; `group` = the id of a `collisionTiles` child (a cell with no or an unknown group belongs to the first one). */
  data?: NodeCells
  z?: number
}

/** A named set of the painted cells of its collision layer (the cells whose `group` is its id). */
export interface CollisionTilesNode extends NodeBase {
  type: 'collisionTiles'
}

/** One collision shape in map pixels: a closed polygon or an open line. `name` is '' when it has none. */
export interface CollisionShapeNode extends NodeBase {
  type: 'collisionShape'
  points: ShapePoint[]
  closed: boolean
}

export interface TerrainNode extends NodeBase {
  type: 'terrain'
  data?: NodeCells
  z?: number
}

export interface EncountersNode extends NodeBase {
  type: 'encounters'
  data?: NodeCells
  z?: number
}

/** Kept for old maps. */
export interface ObjectsLayerNode extends NodeBase {
  type: 'objects'
  data?: NodeCells
  z?: number
}

/** An entity: the node id is the entity id. `visible` is the node's. */
export interface EntityNode extends NodeBase {
  type: 'entity'
  x: number
  y: number
  components: Record<string, Record<string, unknown> | undefined>
}

export type SceneNode =
  | GroupNode
  | TileLayerNode
  | ImageLayerNode
  | PictureNode
  | CollisionLayerNode
  | CollisionTilesNode
  | CollisionShapeNode
  | TerrainNode
  | EncountersNode
  | ObjectsLayerNode
  | EntityNode

export type ContainerNode = GroupNode | ImageLayerNode | CollisionLayerNode
/** The nodes that are layers of the exported map: a tile layer, an image layer, a collision layer or one of the gameplay layers. */
export type LayerNode = TileLayerNode | ImageLayerNode | CollisionLayerNode | TerrainNode | EncountersNode | ObjectsLayerNode
/** Layers that hold painted cells of a tileset (everything but image and collision layers). */
export type CellLayerNode = TileLayerNode | TerrainNode | EncountersNode | ObjectsLayerNode
/** Layers that hold painted cells (`data`): the cell layers and the collision layer. */
export type DataLayerNode = CellLayerNode | CollisionLayerNode

// ── the type table ─────────────────────────────────────────────────────────────────────────────────

export interface NodeTypeInfo {
  type: SceneNodeType
  label: string
  /** lucide icon name (kebab-case). */
  icon: string
  /** Hex colour of the icon. */
  accent: string
  /** Holds children. */
  container: boolean
  /** Which common inspector sections apply: the node section (name, visible, locked), drawing (opacity, z, y-sort) and look. */
  sections: { node: boolean; drawing: boolean; look: boolean }
}

const section = (drawing: boolean, look: boolean) => ({ node: true, drawing, look })

/** One entry per node type; data only. */
export const NODE_TYPES: Record<SceneNodeType, NodeTypeInfo> = {
  group: { type: 'group', label: 'Group', icon: 'folder', accent: '#facc15', container: true, sections: section(true, false) },
  tile: { type: 'tile', label: 'Tile Layer', icon: 'layers', accent: '#cbd5e1', container: false, sections: section(true, true) },
  image: { type: 'image', label: 'Image Layer', icon: 'image', accent: '#a78bfa', container: true, sections: section(true, true) },
  picture: { type: 'picture', label: 'Picture', icon: 'image', accent: '#c4b5fd', container: false, sections: section(true, true) },
  collision: { type: 'collision', label: 'Collision Layer', icon: 'square-x', accent: '#f87171', container: true, sections: section(true, false) },
  collisionTiles: { type: 'collisionTiles', label: 'Collision Tiles', icon: 'grid-3x3', accent: '#fca5a5', container: false, sections: section(false, false) },
  collisionShape: { type: 'collisionShape', label: 'Collision Shape', icon: 'pentagon', accent: '#fca5a5', container: false, sections: section(false, false) },
  terrain: { type: 'terrain', label: 'Terrain Layer', icon: 'droplet', accent: '#60a5fa', container: false, sections: section(true, false) },
  encounters: { type: 'encounters', label: 'Encounters Layer', icon: 'leaf', accent: '#4ade80', container: false, sections: section(true, false) },
  objects: { type: 'objects', label: 'Objects Layer', icon: 'box', accent: '#fbbf24', container: false, sections: section(true, false) },
  entity: { type: 'entity', label: 'Entity', icon: 'user', accent: '#38bdf8', container: false, sections: section(false, false) },
}

/** Every node type, in the order the New menus list them. */
export const NODE_TYPE_LIST: readonly SceneNodeType[] = ['group', 'tile', 'image', 'collision', 'terrain', 'encounters', 'objects', 'entity', 'picture', 'collisionTiles', 'collisionShape']

// ── type guards ────────────────────────────────────────────────────────────────────────────────────

export const isContainer = (node: SceneNode): node is ContainerNode => node.type === 'group' || node.type === 'image' || node.type === 'collision'
export const isLayerNode = (node: SceneNode): node is LayerNode =>
  node.type === 'tile' || node.type === 'image' || node.type === 'collision' || node.type === 'terrain' || node.type === 'encounters' || node.type === 'objects'
export const isDataLayer = (node: SceneNode): node is DataLayerNode => isCellLayer(node) || node.type === 'collision'
export const isCellLayer = (node: SceneNode): node is CellLayerNode => node.type === 'tile' || node.type === 'terrain' || node.type === 'encounters' || node.type === 'objects'
export const isEntityNode = (node: SceneNode): node is EntityNode => node.type === 'entity'
export const isPictureNode = (node: SceneNode): node is PictureNode => node.type === 'picture'

/** The children of a node, in draw order (none for a leaf). */
export function childrenOf(node: SceneNode): readonly SceneNode[] {
  return isContainer(node) ? node.children : NO_NODES
}
const NO_NODES: readonly SceneNode[] = []

/** The children of a node as the panel lists them: last first, so the top row is drawn on top. */
export function panelChildren(node: SceneNode): SceneNode[] {
  return childrenOf(node).slice().reverse()
}

// ── walking and finding ────────────────────────────────────────────────────────────────────────────

export interface WalkEntry {
  node: SceneNode
  /** From the root down to the node's parent (empty at the root). */
  ancestors: readonly SceneNode[]
  /** Position among its siblings (draw order). */
  index: number
  depth: number
}

/**
 * Every node, depth first in draw order: a node, then its children (first child first). `ancestors` is the path above a
 * node. Pass `ancestors` to walk a subtree whose own ancestors are known.
 */
export function walk(nodes: readonly SceneNode[], ancestors: readonly SceneNode[] = NO_NODES): WalkEntry[] {
  const out: WalkEntry[] = []
  const visit = (list: readonly SceneNode[], above: readonly SceneNode[]) => {
    list.forEach((node, index) => {
      out.push({ node, ancestors: above, index, depth: above.length })
      if (isContainer(node)) visit(node.children, [...above, node])
    })
  }
  visit(nodes, ancestors)
  return out
}

/**
 * Every node in the order the panel lists them: a container's children last first (a node, then its children). With
 * `closed`, the children of a collapsed container are left out.
 */
export function walkPanel(nodes: readonly SceneNode[], options: { closed?: boolean } = {}): WalkEntry[] {
  const out: WalkEntry[] = []
  const visit = (list: readonly SceneNode[], above: readonly SceneNode[]) => {
    for (let index = list.length - 1; index >= 0; index--) {
      const node = list[index]
      out.push({ node, ancestors: above, index, depth: above.length })
      if (isContainer(node) && !(options.closed && node.collapsed)) visit(node.children, [...above, node])
    }
  }
  visit(nodes, NO_NODES)
  return out
}

/** Where a node is: its parent (null = the map root), its index among the parent's children and the path above it. */
export interface NodeLocation {
  node: SceneNode
  parent: ContainerNode | null
  index: number
  ancestors: readonly SceneNode[]
}

export function locate(nodes: readonly SceneNode[], id: string): NodeLocation | undefined {
  const search = (list: readonly SceneNode[], above: readonly SceneNode[]): NodeLocation | undefined => {
    for (let index = 0; index < list.length; index++) {
      const node = list[index]
      if (node.id === id) return { node, parent: (above[above.length - 1] as ContainerNode | undefined) ?? null, index, ancestors: above }
      if (isContainer(node)) {
        const found = search(node.children, [...above, node])
        if (found) return found
      }
    }
    return undefined
  }
  return search(nodes, NO_NODES)
}

export function findNode(nodes: readonly SceneNode[], id: string): SceneNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    if (isContainer(node)) {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return undefined
}

/** The path from the root to the node, the node last; undefined when there is no such node. */
export function findPath(nodes: readonly SceneNode[], id: string): SceneNode[] | undefined {
  const at = locate(nodes, id)
  return at ? [...at.ancestors, at.node] : undefined
}

/** The nodes above a node, from the root down (empty for a root node; undefined when there is no such node). */
export function ancestorsOf(nodes: readonly SceneNode[], id: string): readonly SceneNode[] | undefined {
  return locate(nodes, id)?.ancestors
}

/** The container a node sits in: null for a root node, undefined when there is no such node. */
export function parentOf(nodes: readonly SceneNode[], id: string): ContainerNode | null | undefined {
  const at = locate(nodes, id)
  return at ? at.parent : undefined
}

/** Whether `id` is `ancestorId` or one of its descendants. */
export function isWithin(nodes: readonly SceneNode[], id: string, ancestorId: string): boolean {
  const path = findPath(nodes, id)
  return path !== undefined && path.some((n) => n.id === ancestorId)
}

/** Every id in the tree. */
export function nodeIds(nodes: readonly SceneNode[]): Set<string> {
  return new Set(walk(nodes).map((e) => e.node.id))
}

// ── placement rules ────────────────────────────────────────────────────────────────────────────────

const PLAIN_CHILDREN: readonly SceneNodeType[] = ['group', 'tile', 'image', 'collision', 'terrain', 'encounters', 'objects', 'entity']
const IMAGE_CHILDREN: readonly SceneNodeType[] = ['picture', 'group']
const COLLISION_CHILDREN: readonly SceneNodeType[] = ['collisionTiles', 'collisionShape']
const SINGLETON_TYPES: readonly SceneNodeType[] = ['terrain', 'encounters']

/**
 * Whether a node of `childType` may sit directly under the node at the end of `parentPath` (the path from the root; empty
 * = the map root). The root and groups that are not inside an image or collision layer hold every type but `picture`,
 * `collisionTiles` and `collisionShape`; an image layer (and the groups below it) hold `picture` and `group`; a collision
 * layer holds `collisionTiles` and `collisionShape`; leaves hold nothing. With `nodes` given, a map also has at most one
 * `terrain` and one `encounters` node (`movingId` is a node that is being moved: it and what is below it do not count).
 */
export function canHold(parentPath: readonly SceneNode[], childType: SceneNodeType, nodes?: readonly SceneNode[], movingId?: string): boolean {
  const parent = parentPath[parentPath.length - 1]
  let allowed: readonly SceneNodeType[]
  if (!parent) allowed = PLAIN_CHILDREN
  else if (parent.type === 'collision') allowed = COLLISION_CHILDREN
  else if (parent.type === 'image') allowed = IMAGE_CHILDREN
  else if (parent.type === 'group') allowed = parentPath.some((n) => n.type === 'image') ? IMAGE_CHILDREN : PLAIN_CHILDREN
  else allowed = NO_TYPES
  if (!allowed.includes(childType)) return false
  if (nodes && SINGLETON_TYPES.includes(childType)) {
    // The moving node (and everything below it) is leaving its place, so it does not count against itself.
    return !walk(nodes).some((e) => e.node.type === childType && e.node.id !== movingId && !e.ancestors.some((a) => a.id === movingId))
  }
  return true
}
const NO_TYPES: readonly SceneNodeType[] = []

/** Whether a whole subtree (the node and everything below it) may be placed under `parentPath`. */
export function canPlace(parentPath: readonly SceneNode[], node: SceneNode, nodes?: readonly SceneNode[], movingId?: string): boolean {
  if (!canHold(parentPath, node.type, nodes, movingId)) return false
  if (!isContainer(node)) return true
  const here = [...parentPath, node]
  // The singleton rule counts the whole map; inside a subtree it is the subtree's own count that must stay within one.
  return node.children.every((child) => canPlace(here, child, nodes, movingId))
}

function subtreeHasTwo(node: SceneNode, type: SceneNodeType): boolean {
  return walk([node]).filter((e) => e.node.type === type).length > 1
}

function placeable(nodes: readonly SceneNode[], parentPath: readonly SceneNode[], node: SceneNode, movingId?: string): boolean {
  if (!canPlace(parentPath, node, nodes, movingId)) return false
  return !SINGLETON_TYPES.some((t) => subtreeHasTwo(node, t))
}

// ── changing the tree ──────────────────────────────────────────────────────────────────────────────

function withChildren<T extends ContainerNode>(node: T, children: SceneNode[]): T {
  return { ...node, children }
}

/** Rewrites the children list of the container `parentId` (null = the root); undefined from `fn` = no change. */
function editChildren(nodes: SceneNode[], parentId: string | null, fn: (children: SceneNode[]) => SceneNode[]): SceneNode[] {
  if (parentId === null) return fn(nodes)
  const go = (list: SceneNode[]): SceneNode[] => {
    let changed = false
    const next = list.map((node) => {
      if (!isContainer(node)) return node
      const children = node.id === parentId ? fn(node.children) : go(node.children)
      if (children === node.children) return node
      changed = true
      return withChildren(node, children)
    })
    return changed ? next : list
  }
  return go(nodes)
}

const clampIndex = (index: number | undefined, length: number) => (index === undefined || !Number.isFinite(index) ? length : Math.max(0, Math.min(length, Math.floor(index))))

/**
 * `node` put under the container `parentId` (null = the map root) at `index` (default: last = on top). Refused (the
 * same array comes back) when the parent is missing, the placement rules forbid it or the id is already in the tree.
 */
export function insertNode(nodes: SceneNode[], parentId: string | null, node: SceneNode, index?: number): SceneNode[] {
  const parentPath = parentId === null ? NO_NODES : findPath(nodes, parentId)
  if (!parentPath) return nodes
  if (walk([node]).some((e) => nodeIdTaken(nodes, e.node.id))) return nodes
  if (!placeable(nodes, parentPath, node)) return nodes
  return editChildren(nodes, parentId, (children) => {
    const next = children.slice()
    next.splice(clampIndex(index, children.length), 0, node)
    return next
  })
}

function nodeIdTaken(nodes: readonly SceneNode[], id: string): boolean {
  return findNode(nodes, id) !== undefined
}

/** The tiles item a cell belongs to in a collision layer node: its own group when the layer has it, else the first one. */
export function cellGroupOf(layer: CollisionLayerNode, cell: Pick<EditorTile, 'group'>): string | null {
  return cellGroupId({ tileGroups: collisionTileNodes(layer).map((t) => ({ id: t.id, name: t.name })) }, cell)
}

/** The tiles items of a collision layer, in list order. */
export const collisionTileNodes = (layer: CollisionLayerNode): CollisionTilesNode[] => layer.children.filter((c): c is CollisionTilesNode => c.type === 'collisionTiles')
/** The shapes of a collision layer, in list order. */
export const collisionShapeNodes = (layer: CollisionLayerNode): CollisionShapeNode[] => layer.children.filter((c): c is CollisionShapeNode => c.type === 'collisionShape')

/** A collision layer node as the layer shape the cell helpers of collisionLayers.ts work on (`tileGroups`, `shapes`). */
export function collisionLayerLike(layer: CollisionLayerNode): CollisionLayerLike & { id: string } {
  return { id: layer.id, type: 'collision', data: layer.data, tileGroups: collisionTileNodes(layer).map((t) => ({ id: t.id, name: t.name })), shapes: collisionShapeNodes(layer) }
}

/** The item list of a collision layer node: the tiles items (with their cell counts), then the shapes. */
export const collisionItemsOf = (layer: CollisionLayerNode): CollisionItem[] => collisionItems(collisionLayerLike(layer))

/**
 * The tree without the nodes `ids` (and everything below them). A `collisionTiles` node takes its cells with it. Ids
 * that are not in the tree are ignored; the same array comes back when nothing was removed.
 */
export function removeNodes(nodes: SceneNode[], ids: readonly string[]): SceneNode[] {
  const gone = new Set(ids)
  if (gone.size === 0) return nodes
  const go = (list: SceneNode[]): SceneNode[] => {
    let changed = false
    const out: SceneNode[] = []
    for (const node of list) {
      if (gone.has(node.id)) {
        changed = true
        continue
      }
      if (!isContainer(node)) {
        out.push(node)
        continue
      }
      const children = go(node.children)
      let next: SceneNode = children === node.children ? node : withChildren(node, children)
      // Cells go with the tiles item they belonged to (judged against the layer as it was, as removeCollisionItem does).
      if (node.type === 'collision') next = withoutCellsOfRemoved(node, next as CollisionLayerNode, gone)
      if (next !== node) changed = true
      out.push(next)
    }
    return changed ? out : list
  }
  return go(nodes)
}

// `after` without the cells that belonged (in `before`) to a tiles item that is gone.
function withoutCellsOfRemoved(before: CollisionLayerNode, after: CollisionLayerNode, gone: ReadonlySet<string>): CollisionLayerNode {
  const goneTiles = collisionTileNodes(before).filter((t) => gone.has(t.id))
  if (goneTiles.length === 0 || !before.data) return after
  const data: NodeCells = {}
  let dropped = false
  for (const [key, cell] of Object.entries(before.data)) {
    const owner = cellGroupOf(before, cell)
    if (owner !== null && gone.has(owner)) dropped = true
    else data[key] = cell
  }
  if (!dropped) return after
  return { ...after, data }
}

/** Replaces the node `id` with `fn(node)`; the same array comes back when `fn` returns the same node (or `id` is unknown). */
export function updateNode(nodes: SceneNode[], id: string, fn: (node: SceneNode) => SceneNode): SceneNode[] {
  const go = (list: SceneNode[]): SceneNode[] => {
    let changed = false
    const next = list.map((node) => {
      if (node.id === id) {
        const updated = fn(node)
        if (updated !== node) changed = true
        return updated
      }
      if (!isContainer(node)) return node
      const children = go(node.children)
      if (children === node.children) return node
      changed = true
      return withChildren(node, children)
    })
    return changed ? next : list
  }
  return go(nodes)
}

/** Every node (children first) through `fn`; the same tree comes back when `fn` changes nothing. */
export function mapTree(nodes: SceneNode[], fn: (node: SceneNode) => SceneNode): SceneNode[] {
  let changed = false
  const next = nodes.map((node) => {
    let current = node
    if (isContainer(node)) {
      const children = mapTree(node.children, fn)
      if (children !== node.children) current = withChildren(node, children)
    }
    const out = fn(current)
    if (out !== node) changed = true
    return out
  })
  return changed ? next : nodes
}

/**
 * The node `id` moved under `parentId` (null = the map root) at `index` among that container's children as they are once
 * the node has left its old place (default: last = on top). Refused (the same array comes back) when the move makes a
 * node a descendant of itself, the placement rules forbid it, or the node or the parent is unknown (a `collisionTiles` node only moves within its own layer). Moving a node to where
 * it already is changes nothing.
 */
export function moveNode(nodes: SceneNode[], id: string, parentId: string | null, index?: number): SceneNode[] {
  const from = locate(nodes, id)
  if (!from) return nodes
  const parentPath = parentId === null ? NO_NODES : findPath(nodes, parentId)
  if (!parentPath) return nodes
  if (parentPath.some((n) => n.id === id)) return nodes
  // A tiles item can be reordered but not taken to another layer: its cells are the layer's data and would stay behind.
  if (from.node.type === 'collisionTiles' && (from.parent?.id ?? null) !== parentId) return nodes
  if (!placeable(nodes, parentPath, from.node, id)) return nodes

  const without = removeNodesKeepCells(nodes, id)
  let siblings: readonly SceneNode[] | undefined = without
  if (parentId !== null) {
    const target = findNode(without, parentId)
    siblings = target && isContainer(target) ? target.children : undefined
  }
  if (!siblings) return nodes
  const at = clampIndex(index, siblings.length)
  const sameParent = (from.parent?.id ?? null) === parentId
  if (sameParent && at === from.index) return nodes
  return editChildren(without, parentId, (children) => {
    const next = children.slice()
    next.splice(at, 0, from.node)
    return next
  })
}

// A node leaves its place without its cells being touched (moving a collision item between layers is not allowed anyway).
function removeNodesKeepCells(nodes: SceneNode[], id: string): SceneNode[] {
  const go = (list: SceneNode[]): SceneNode[] => {
    let changed = false
    const out: SceneNode[] = []
    for (const node of list) {
      if (node.id === id) {
        changed = true
        continue
      }
      if (!isContainer(node)) {
        out.push(node)
        continue
      }
      const children = go(node.children)
      if (children !== node.children) changed = true
      out.push(children === node.children ? node : withChildren(node, children))
    }
    return changed ? out : list
  }
  return go(nodes)
}

// ── copies ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * A deep copy of a node with a new id for it and for everything below it (`newId()` is injected: tests make it
 * predictable). The `group` of a collision layer's cells follows the cloned `collisionTiles` ids.
 */
export function cloneWithNewIds<T extends SceneNode>(node: T, newId: () => string): T {
  const ids = new Map<string, string>()
  const copy = (n: SceneNode): SceneNode => {
    const id = newId()
    ids.set(n.id, id)
    if (!isContainer(n)) return cloneJson({ ...n, id })
    const children = n.children.map(copy)
    const cloned: SceneNode = { ...cloneJson({ ...n, children: [] as SceneNode[] }), id, children }
    if (cloned.type === 'collision' && cloned.data) {
      const data: NodeCells = {}
      for (const [key, cell] of Object.entries(cloned.data)) {
        const mapped = cell.group !== undefined ? ids.get(cell.group) : undefined
        data[key] = mapped !== undefined ? { ...cell, group: mapped } : cell
      }
      cloned.data = data
    }
    return cloned
  }
  return copy(node) as T
}


/**
 * A copy of the node `id` (new ids, `rename` applied to the copy's name when given) put right after the original, in the
 * same parent. Returns the new tree and the copy; the same tree and null when the node is unknown or the copy is refused.
 */
export function duplicateNode(nodes: SceneNode[], id: string, newId: () => string, rename?: (name: string) => string): { nodes: SceneNode[]; copy: SceneNode | null } {
  const at = locate(nodes, id)
  if (!at) return { nodes, copy: null }
  const base = cloneWithNewIds(at.node, newId)
  const copy = rename ? { ...base, name: rename(base.name) } : base
  const next = insertNode(nodes, at.parent?.id ?? null, copy, at.index + 1)
  return next === nodes ? { nodes, copy: null } : { nodes: next, copy }
}

// ── flat views ─────────────────────────────────────────────────────────────────────────────────────

/** Every entity, in tree order (draw order: the first one draws first among the entities). */
export function allEntities(nodes: readonly SceneNode[]): EntityNode[] {
  return walk(nodes).filter((e): e is WalkEntry & { node: EntityNode } => e.node.type === 'entity').map((e) => e.node)
}

/** Every layer node, in draw order (the first one is at the back). */
export function layerNodes(nodes: readonly SceneNode[]): LayerNode[] {
  return walk(nodes).filter((e) => isLayerNode(e.node)).map((e) => e.node as LayerNode)
}

/** Every layer node as the list shows them, top first. */
export function layerNodesInListOrder(nodes: readonly SceneNode[]): LayerNode[] {
  return walkPanel(nodes).filter((e) => isLayerNode(e.node)).map((e) => e.node as LayerNode)
}

/** The pictures of an image layer (or of a group of pictures), in tree order, groups looked into. */
export function picturesOf(node: SceneNode): PictureNode[] {
  return walk(childrenOf(node)).filter((e): e is WalkEntry & { node: PictureNode } => e.node.type === 'picture').map((e) => e.node)
}

/**
 * The pictures of an image layer in the order they draw: `z` first, tree order for ties (the order the exporter writes
 * them in). Groups are looked into.
 */
export function drawOrderPictures(node: SceneNode): PictureNode[] {
  return picturesOf(node)
    .map((picture, index) => ({ picture, index }))
    .sort((a, b) => (a.picture.z ?? 0) - (b.picture.z ?? 0) || a.index - b.index)
    .map((entry) => entry.picture)
}

/** Every picture of every image layer, in tree order. */
export function allPictures(nodes: readonly SceneNode[]): PictureNode[] {
  return walk(nodes).filter((e): e is WalkEntry & { node: PictureNode } => e.node.type === 'picture').map((e) => e.node)
}

/** Whether any node of the tree matches. */
export function someNode(nodes: readonly SceneNode[], test: (node: SceneNode) => boolean): boolean {
  return walk(nodes).some((e) => test(e.node))
}

// ── inherited properties ───────────────────────────────────────────────────────────────────────────

/** The nearest value `pick` gives, looking at the node first, then its parent, up to the root; undefined when none sets it. */
export function inheritedValue<T>(node: SceneNode | undefined, ancestors: readonly SceneNode[], pick: (node: SceneNode) => T | undefined): T | undefined {
  if (node) {
    const own = pick(node)
    if (own !== undefined) return own
  }
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const v = pick(ancestors[i])
    if (v !== undefined) return v
  }
  return undefined
}

/** Shown: the node and every ancestor are not hidden. */
export function isVisible(node: SceneNode, ancestors: readonly SceneNode[]): boolean {
  return node.visible !== false && ancestors.every((a) => a.visible !== false)
}

/** Locked: the node or any ancestor is locked. */
export function isLocked(node: SceneNode, ancestors: readonly SceneNode[]): boolean {
  return node.locked === true || ancestors.some((a) => a.locked === true)
}

const ySortOf = (node: SceneNode): boolean | undefined => (node.type === 'group' || node.type === 'image' || node.type === 'picture' ? node.ySort : undefined)

/**
 * Whether a node draws y-sorted among the characters: the nearest set value up the tree (a picture's own setting over its
 * group's, over its image layer's, over the groups above), off when nothing is set.
 */
export function effectiveYSort(node: SceneNode, ancestors: readonly SceneNode[]): boolean {
  return inheritedValue(node, ancestors, ySortOf) ?? false
}

/** What a node gets when it has no setting of its own (its ancestors', else off): shown as "follows the parent". */
export function inheritedYSort(ancestors: readonly SceneNode[]): boolean {
  return inheritedValue(undefined, ancestors, ySortOf) ?? false
}

const opacityOf = (node: SceneNode): number => (node.type === 'picture' && node.opacity !== undefined ? node.opacity : 1)

/** The node's opacity multiplied by every ancestor's (1 = opaque). */
export function effectiveOpacity(node: SceneNode, ancestors: readonly SceneNode[]): number {
  return ancestors.reduce((product, a) => product * opacityOf(a), opacityOf(node))
}
