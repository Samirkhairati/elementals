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
import { isOffGrid } from './engine/placement.ts'

// ── node types ─────────────────────────────────────────────────────────────────────────────────────
//
// Scene nodes sit in the map root or a Node (`group`): Node, TileMap (`tile`), Terrain, Encounters, Objects, StaticBody
// (`collision`, the map's collision: painted tiles and shapes) and Entity; a Sprite (`picture`) sits in a Node.
// Modifier nodes change their parent: a Look grades it, a YSort (in a Node) makes the sprites below it draw sorted by
// their feet among the characters. An entity is an ECS entity whose components are its child nodes: AnimatedSprite
// (Sprite), StaticBody (`body`: a solid Collider) and Area (`area`: where its events trigger), each with a
// CollisionShape, a movement node (Wander, PlayerController or Mover: Movement) and an Event (Event); see
// shared/sceneEntity.ts. `canHold` says what may sit where.

export type SceneNodeType =
  | 'group'
  | 'ySort'
  | 'tile'
  | 'terrain'
  | 'encounters'
  | 'objects'
  | 'picture'
  | 'look'
  | 'collision'
  | 'collisionTiles'
  | 'collisionShape'
  | 'entity'
  | 'animatedSprite'
  | 'body'
  | 'area'
  | 'wander'
  | 'playerController'
  | 'mover'
  | 'event'

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

/** Drawing settings of a Node, passed down to what is below it. */
interface CanvasFields {
  /** Game depth of the sprites below it that have no nearer setting (nearest set value wins). */
  z?: number
  /** Multiplies the opacity of the sprites below it (1 = opaque). */
  opacity?: number
  /** A click on a sprite below it on the canvas picks every sprite below it (until it is opened from the list). */
  pickAsOne?: boolean
}

/**
 * The transform of a Node, like Godot's Node2D: its anchor (`x`, `y`, map pixels; absent = the map's origin) and its
 * rotation in degrees. Children are stored at their own map positions; moving or rotating a Node in the editor carries
 * what is below it along (`translateSubtree`, `rotateSubtree`).
 */
interface TransformFields {
  x?: number
  y?: number
  /** Degrees, clockwise (absent = 0). */
  rotation?: number
  /** The id of the prefab it was placed from (Save as Prefab offers to update that one). */
  prefab?: string
}

/**
 * Node: holds any scene node (the folders, picture groups, image layers and entity folders of old maps). A Node that is
 * given a component (AnimatedSprite, StaticBody, Area, a movement node, Event) becomes an Entity (`promoteNodes`): the
 * editor shows both as one kind of node.
 */
export interface GroupNode extends NodeBase, ContainerFields, CanvasFields, TransformFields {
  type: 'group'
}

/** YSort: a modifier of the Node it sits in; while shown, the sprites below that Node draw sorted by their feet among the characters. */
export interface YSortNode extends NodeBase {
  type: 'ySort'
}

/** TileMap: painted tiles. May hold a Look. */
export interface TileLayerNode extends NodeBase, ContainerFields {
  type: 'tile'
  data?: NodeCells
  z?: number
}

/**
 * Sprite: one freely placed picture, drawn at a pixel position (its anchor: bottom-centre of the picture). It is either
 * a sprite asset (`assetId`, its first frame) or a plain picture from the graphics library (`graphicId`), never both. May
 * hold a Look.
 */
export interface PictureNode extends NodeBase, ContainerFields {
  type: 'picture'
  /** Sprite (character) id, e.g. `objects/chest`. */
  assetId?: string
  /** Graphic id (a picture under project/graphics), e.g. `scenery/clouds.png`. */
  graphicId?: string
  crop?: EditorImageCrop
  x: number
  y: number
  /** Draw order among the sprites next to it (ties keep tree order). */
  z?: number
  scale?: number
  flipX?: boolean
  flipY?: boolean
  opacity?: number
  /** Degrees, clockwise, around the origin (absent = 0). */
  rotation?: number
  /** Where the anchor sits on the picture, as fractions of its size (absent = 0.5, 1: the bottom centre). */
  originX?: number
  originY?: number
}

/** Look: the colour grading (and drop shadow) of its parent and, for a Node, of what is below it. */
export interface LookNode extends NodeBase {
  type: 'look'
  look: LookSet
}

/** StaticBody of the map: its collision, as sets of painted tiles and single shapes. The painted cells are this node's `data`. */
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

/** A box bottom-centred on an entity's anchor, then shifted (the Collider box). */
export interface ShapeBox {
  width: number
  height: number
  offsetX: number
  offsetY: number
}

/**
 * CollisionShape: a closed polygon or an open line (`points`, in map pixels in the map's StaticBody, relative to the
 * anchor in an entity), or, in an entity, a `box`. `name` is '' when it has none.
 */
export interface CollisionShapeNode extends NodeBase {
  type: 'collisionShape'
  points: ShapePoint[]
  closed: boolean
  /** In an entity's body or area: a box instead of the points. */
  box?: ShapeBox
}

/**
 * An entity: a Node with components (shown as a Node in the editor). The node id is the entity id. Its own `components`
 * are Transform and Tag; the others are its children, next to any scene node a Node may hold.
 */
export interface EntityNode extends NodeBase, ContainerFields, CanvasFields {
  type: 'entity'
  x: number
  y: number
  /** Degrees, clockwise: turns its AnimatedSprite (absent = 0). */
  rotation?: number
  /** The id of the prefab it was placed from. */
  prefab?: string
  components: Record<string, Record<string, unknown> | undefined>
}

/** AnimatedSprite: the entity's Sprite component (`props`, without `visible`: that is the node's eye). */
export interface AnimatedSpriteNode extends NodeBase {
  type: 'animatedSprite'
  props: Record<string, unknown>
}

/** StaticBody of an entity: its solid Collider, the shape of its CollisionShape (a one-tile box without one). */
export interface BodyNode extends NodeBase, ContainerFields {
  type: 'body'
}

/** Area of an entity: where its events trigger (non-solid), the shape of its CollisionShape. */
export interface AreaNode extends NodeBase, ContainerFields {
  type: 'area'
}

/** Movement of an entity: the controller is the type (wander, player, or `mover` = moved by events only); `props` the rest. */
export interface MovementNode extends NodeBase {
  type: 'wander' | 'playerController' | 'mover'
  props: Record<string, unknown>
}

/** Event: the entity's Event component (its states and graphs). */
export interface EventNode extends NodeBase {
  type: 'event'
  props: Record<string, unknown>
}

export type SceneNode =
  | GroupNode
  | YSortNode
  | TileLayerNode
  | PictureNode
  | LookNode
  | CollisionLayerNode
  | CollisionTilesNode
  | CollisionShapeNode
  | TerrainNode
  | EncountersNode
  | ObjectsLayerNode
  | EntityNode
  | AnimatedSpriteNode
  | BodyNode
  | AreaNode
  | MovementNode
  | EventNode

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

export type ContainerNode = GroupNode | TileLayerNode | PictureNode | CollisionLayerNode | EntityNode | BodyNode | AreaNode
/** Node: what holds scene nodes (and the map root): a plain Node or one with components (an entity). */
export type BranchNode = GroupNode | EntityNode
/** The nodes that are layers of the exported map: a tile layer, the map's static body or one of the gameplay layers. */
export type LayerNode = TileLayerNode | CollisionLayerNode | TerrainNode | EncountersNode | ObjectsLayerNode
/** Layers that hold painted cells of a tileset (everything but the static body). */
export type CellLayerNode = TileLayerNode | TerrainNode | EncountersNode | ObjectsLayerNode
/** Layers that hold painted cells (`data`): the cell layers and the static body. */
export type DataLayerNode = CellLayerNode | CollisionLayerNode
/** The nodes that are components of an entity. */
export type ComponentNode = AnimatedSpriteNode | BodyNode | AreaNode | MovementNode | EventNode

// ── the type table ─────────────────────────────────────────────────────────────────────────────────

/** Where a type is offered in the Add Node menu. */
export type NodeCategory = 'scene' | 'drawing' | 'collision' | 'entity' | 'component'

export interface NodeTypeInfo {
  type: SceneNodeType
  label: string
  /** What the Add Node menu says about it. */
  description: string
  /** lucide icon name (kebab-case). */
  icon: string
  /** Hex colour of the icon. */
  accent: string
  /** Holds children. */
  container: boolean
  category: NodeCategory
  /** Which common inspector sections apply: the node section (name, visible, locked), drawing (opacity, z) and look. */
  sections: { node: boolean; drawing: boolean; look: boolean }
}

const section = (drawing: boolean, look: boolean) => ({ node: true, drawing, look })
const info = (type: SceneNodeType, label: string, description: string, icon: string, accent: string, container: boolean, category: NodeCategory, drawing = false, look = false): NodeTypeInfo => ({
  type,
  label,
  description,
  icon,
  accent,
  container,
  category,
  sections: section(drawing, look),
})

/** One entry per node type; data only. */
export const NODE_TYPES: Record<SceneNodeType, NodeTypeInfo> = {
  group: info('group', 'Node', 'An anchor you place on the map; holds other nodes and components (add an Area with a CollisionShape to make it trigger events). Its z, opacity, look and y-sort pass down to what is inside', 'circle-dot', '#60a5fa', true, 'scene', true, true),
  ySort: info('ySort', 'YSort', 'Makes the sprites inside its Node draw sorted by their feet among the characters (hide it to switch it off)', 'arrow-down-wide-narrow', '#38bdf8', false, 'drawing'),
  tile: info('tile', 'TileMap', 'Tiles painted from a tileset', 'grid-2x2', '#cbd5e1', true, 'drawing', true, true),
  terrain: info('terrain', 'Terrain', 'Water, ice and other ground kinds the game reads (one per map)', 'droplet', '#60a5fa', false, 'drawing', true),
  encounters: info('encounters', 'Encounters', 'Where wild encounters happen (one per map)', 'leaf', '#4ade80', false, 'drawing', true),
  objects: info('objects', 'Objects Layer', 'Kept for old maps', 'box', '#fbbf24', false, 'drawing', true),
  picture: info('picture', 'Sprite', 'A picture or the first frame of a sprite, placed anywhere', 'image', '#a78bfa', true, 'drawing', true, true),
  look: info('look', 'Look', 'Colour grading and drop shadow of its parent (and of what is inside a Node)', 'palette', '#f472b6', false, 'drawing'),
  collision: info('collision', 'StaticBody', 'The map\'s collision: painted tiles and shapes the player cannot cross', 'brick-wall', '#f87171', true, 'collision', true),
  collisionTiles: info('collisionTiles', 'Collision Tiles', 'A named set of the painted collision tiles', 'grid-3x3', '#fca5a5', false, 'collision'),
  collisionShape: info('collisionShape', 'CollisionShape', 'A polygon, a line or a box', 'pentagon', '#fca5a5', false, 'collision'),
  entity: info('entity', 'Node', 'A Node with components: a character, object or trigger', 'circle-dot', '#60a5fa', true, 'entity', true, true),
  animatedSprite: info('animatedSprite', 'AnimatedSprite', 'What the entity looks like: a sprite asset and its animations', 'clapperboard', '#c084fc', false, 'component'),
  body: info('body', 'StaticBody', 'Makes the entity solid: nothing walks through its shape', 'brick-wall', '#f87171', true, 'component'),
  area: info('area', 'Area', 'Where the entity\'s events trigger (stepping on it, touching it)', 'scan', '#34d399', true, 'component'),
  wander: info('wander', 'Wander', 'Walks around on its own near where it starts', 'footprints', '#4ade80', false, 'component'),
  playerController: info('playerController', 'PlayerController', 'The player drives it with the keys', 'gamepad-2', '#4ade80', false, 'component'),
  mover: info('mover', 'Mover', 'Moves only when an event moves it (its speed)', 'move', '#4ade80', false, 'component'),
  event: info('event', 'Event', 'States and graphs: what happens when it is triggered', 'zap', '#fbbf24', false, 'component'),
}

/** Every node type, in the order the Add Node menu lists them. */
export const NODE_TYPE_LIST: readonly SceneNodeType[] = [
  'group',
  'tile',
  'picture',
  'look',
  'ySort',
  'terrain',
  'encounters',
  'objects',
  'collision',
  'collisionTiles',
  'collisionShape',
  'entity',
  'animatedSprite',
  'body',
  'area',
  'wander',
  'playerController',
  'mover',
  'event',
]

// ── type guards ────────────────────────────────────────────────────────────────────────────────────

const CONTAINER_TYPES: ReadonlySet<SceneNodeType> = new Set(Object.values(NODE_TYPES).filter((t) => t.container).map((t) => t.type))
const MOVEMENT_TYPES: readonly SceneNodeType[] = ['wander', 'playerController', 'mover']
const COMPONENT_TYPES: readonly SceneNodeType[] = ['animatedSprite', 'body', 'area', ...MOVEMENT_TYPES, 'event']

export const isContainer = (node: SceneNode): node is ContainerNode => CONTAINER_TYPES.has(node.type)
export const isBranch = (node: SceneNode): node is BranchNode => node.type === 'group' || node.type === 'entity'
/** A Node of the scene (with or without components): what the editor shows as "Node". */
export const isSceneNode = isBranch
export const isLayerNode = (node: SceneNode): node is LayerNode =>
  node.type === 'tile' || node.type === 'collision' || node.type === 'terrain' || node.type === 'encounters' || node.type === 'objects'
export const isDataLayer = (node: SceneNode): node is DataLayerNode => isCellLayer(node) || node.type === 'collision'
export const isCellLayer = (node: SceneNode): node is CellLayerNode => node.type === 'tile' || node.type === 'terrain' || node.type === 'encounters' || node.type === 'objects'
export const isEntityNode = (node: SceneNode): node is EntityNode => node.type === 'entity'
export const isPictureNode = (node: SceneNode): node is PictureNode => node.type === 'picture'
export const isMovementNode = (node: SceneNode): node is MovementNode => MOVEMENT_TYPES.includes(node.type)
export const isComponentNode = (node: SceneNode): node is ComponentNode => COMPONENT_TYPES.includes(node.type)

/** The children of a node, in draw order (none for a leaf). */
export function childrenOf(node: SceneNode): readonly SceneNode[] {
  return isContainer(node) ? (node.children ?? NO_NODES) : NO_NODES
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
      if (isContainer(node)) visit(childrenOf(node), [...above, node])
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
      if (isContainer(node) && !(options.closed && node.collapsed)) visit(childrenOf(node), [...above, node])
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
        const found = search(childrenOf(node), [...above, node])
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
      const found = findNode(childrenOf(node), id)
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

const ROOT_CHILDREN: readonly SceneNodeType[] = ['group', 'tile', 'terrain', 'encounters', 'objects', 'collision', 'entity']
const BRANCH_CHILDREN: readonly SceneNodeType[] = [...ROOT_CHILDREN, 'picture', 'look', 'ySort', ...COMPONENT_TYPES]
const HOLDS: Partial<Record<SceneNodeType, readonly SceneNodeType[]>> = {
  group: BRANCH_CHILDREN,
  tile: ['look'],
  picture: ['look'],
  collision: ['collisionTiles', 'collisionShape'],
  entity: BRANCH_CHILDREN,
  body: ['collisionShape'],
  area: ['collisionShape'],
}
const SINGLETON_TYPES: readonly SceneNodeType[] = ['terrain', 'encounters']

/** The slot a child takes in its parent when a parent holds at most one of it (one look, one sprite, one movement...). */
function slotOf(parent: SceneNode | undefined, type: SceneNodeType): string | null {
  if (type === 'look' || type === 'ySort') return type
  if (!parent) return null
  if (isBranch(parent) && COMPONENT_TYPES.includes(type)) return isMovementType(type) ? 'movement' : type
  if ((parent.type === 'body' || parent.type === 'area') && type === 'collisionShape') return 'shape'
  return null
}
const isMovementType = (type: SceneNodeType) => MOVEMENT_TYPES.includes(type)

/** The types a node at the end of `parentPath` may hold at all (the map root when it is empty), in Add Node menu order. */
export function childTypesOf(parentPath: readonly SceneNode[]): SceneNodeType[] {
  const parent = parentPath[parentPath.length - 1]
  const allowed = parent ? (HOLDS[parent.type] ?? NO_TYPES) : ROOT_CHILDREN
  return NODE_TYPE_LIST.filter((t) => allowed.includes(t))
}

/**
 * Whether a node of `childType` may sit directly under the node at the end of `parentPath` (the path from the root; empty
 * = the map root):
 *
 *  - the root holds the scene nodes (Node, YSort, TileMap, Terrain, Encounters, Objects, the map's StaticBody,
 *    Entity); a Node hold them too, and Sprites (every sprite sits in one: its z, look and y-sort come
 *    from there) and a Look;
 *  - a TileMap and a Sprite hold only a Look (a sprite inside a sprite makes no sense);
 *  - the map's StaticBody holds collision tiles and shapes;
 *  - a Node (with or without components) also holds components: AnimatedSprite, StaticBody, Area, one movement
 *    node and Event (a Node given one becomes an entity, see `promoteNodes`);
 *  - an entity's StaticBody and Area hold a CollisionShape;
 *  - every other node holds nothing.
 *
 * A parent holds at most one Look, and an entity at most one of each component (one movement node) and its body or area
 * one shape. With `nodes` given, a map also has at most one `terrain` and one `encounters` node. `movingId` is a node
 * that is being moved: it (and what is below it) does not count against itself.
 */
export function canHold(parentPath: readonly SceneNode[], childType: SceneNodeType, nodes?: readonly SceneNode[], movingId?: string): boolean {
  return holds(parentPath, childType, nodes, movingId, true)
}

function holds(parentPath: readonly SceneNode[], childType: SceneNodeType, nodes: readonly SceneNode[] | undefined, movingId: string | undefined, checkSlot: boolean): boolean {
  if (!childTypesOf(parentPath).includes(childType)) return false
  const parent = parentPath[parentPath.length - 1]
  const slot = checkSlot ? slotOf(parent, childType) : null
  if (slot !== null) {
    const siblings = parent ? childrenOf(parent) : (nodes ?? NO_NODES)
    if (siblings.some((c) => c.id !== movingId && slotOf(parent, c.type) === slot)) return false
  }
  if (nodes && SINGLETON_TYPES.includes(childType)) {
    // The moving node (and everything below it) is leaving its place, so it does not count against itself.
    return !walk(nodes).some((e) => e.node.type === childType && e.node.id !== movingId && !e.ancestors.some((a) => a.id === movingId))
  }
  return true
}
const NO_TYPES: readonly SceneNodeType[] = []

/** The types that may be added under the node at the end of `parentPath` right now (the slots and singletons counted). */
export function addableChildTypes(parentPath: readonly SceneNode[], nodes: readonly SceneNode[]): SceneNodeType[] {
  return childTypesOf(parentPath).filter((t) => canHold(parentPath, t, nodes))
}

/** Whether a whole subtree (the node and everything below it) may be placed under `parentPath`. */
export function canPlace(parentPath: readonly SceneNode[], node: SceneNode, nodes?: readonly SceneNode[], movingId?: string): boolean {
  return placesUnder(parentPath, node, nodes, movingId, true)
}

function placesUnder(parentPath: readonly SceneNode[], node: SceneNode, nodes: readonly SceneNode[] | undefined, movingId: string | undefined, checkSlot: boolean): boolean {
  if (!holds(parentPath, node.type, nodes, movingId, checkSlot)) return false
  if (!isContainer(node)) return true
  const here = [...parentPath, node]
  // The singleton rule counts the whole map; inside a subtree it is the subtree's own count that must stay within one.
  // Inside the subtree the slot rule is checked among the children as they are.
  return childrenOf(node).every((child) => placesUnder(here, child, nodes, movingId, false) && slotFree(node, child))
}

// No other child of `parent` takes the slot `child` takes.
function slotFree(parent: SceneNode, child: SceneNode): boolean {
  const slot = slotOf(parent, child.type)
  return slot === null || !childrenOf(parent).some((c) => c !== child && slotOf(parent, c.type) === slot)
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

const NO_CHILDREN: SceneNode[] = []
// The children list of a container, an empty one (always the same array) when a hand-made node has none.
const kids = (node: ContainerNode): SceneNode[] => node.children ?? NO_CHILDREN

/** Rewrites the children list of the container `parentId` (null = the root); undefined from `fn` = no change. */
function editChildren(nodes: SceneNode[], parentId: string | null, fn: (children: SceneNode[]) => SceneNode[]): SceneNode[] {
  if (parentId === null) return fn(nodes)
  const go = (list: SceneNode[]): SceneNode[] => {
    let changed = false
    const next = list.map((node) => {
      if (!isContainer(node)) return node
      const children = node.id === parentId ? fn(kids(node)) : go(kids(node))
      if (children === kids(node)) return node
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
export const collisionTileNodes = (layer: CollisionLayerNode): CollisionTilesNode[] => kids(layer).filter((c): c is CollisionTilesNode => c.type === 'collisionTiles')
/** The shapes of a collision layer, in list order. */
export const collisionShapeNodes = (layer: CollisionLayerNode): CollisionShapeNode[] => kids(layer).filter((c): c is CollisionShapeNode => c.type === 'collisionShape')

/** A collision layer node as the layer shape the cell helpers of collisionLayers.ts work on (`tileGroups`, `shapes`). */
export function collisionLayerLike(layer: CollisionLayerNode): CollisionLayerLike & { id: string } {
  return { id: layer.id, type: 'collision', data: layer.data, tileGroups: collisionTileNodes(layer).map((t) => ({ id: t.id, name: t.name })), shapes: collisionShapeNodes(layer) }
}

const shownCellsCache = new WeakMap<CollisionLayerNode, NodeCells | undefined>()

/**
 * The cells of a collision layer the editor draws: without those of a hidden tiles item (hiding an item is a view
 * setting, like Godot's: the game still collides with it). The layer's own `data` when no item is hidden; cached per node.
 */
export function shownCollisionCells(layer: CollisionLayerNode): NodeCells | undefined {
  if (shownCellsCache.has(layer)) return shownCellsCache.get(layer)
  const hidden = new Set(collisionTileNodes(layer).filter((t) => t.visible === false).map((t) => t.id))
  let out = layer.data
  if (hidden.size > 0 && layer.data) {
    const data: NodeCells = {}
    for (const [key, cell] of Object.entries(layer.data)) {
      const owner = cellGroupOf(layer, cell)
      if (owner === null || !hidden.has(owner)) data[key] = cell
    }
    out = data
  }
  shownCellsCache.set(layer, out)
  return out
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
      const children = go(kids(node))
      let next: SceneNode = children === kids(node) ? node : withChildren(node, children)
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
      const children = go(kids(node))
      if (children === kids(node)) return node
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
      const children = mapTree(kids(node), fn)
      if (children !== kids(node)) current = withChildren(node, children)
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
    siblings = target && isContainer(target) ? kids(target) : undefined
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
      const children = go(kids(node))
      if (children !== kids(node)) changed = true
      out.push(children === kids(node) ? node : withChildren(node, children))
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
    const children = kids(n).map(copy)
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
/** The entity a node sits in (its nearest entity ancestor), or undefined. What the game attaches it to. */
export function owningEntity(ancestors: readonly SceneNode[]): EntityNode | undefined {
  for (let i = ancestors.length - 1; i >= 0; i--) if (ancestors[i].type === 'entity') return ancestors[i] as EntityNode
  return undefined
}

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

/** The YSort modifier a node holds (its first one), if any. */
export function ySortNodeOf(node: SceneNode | undefined): YSortNode | undefined {
  return node ? (childrenOf(node).find((c) => c.type === 'ySort') as YSortNode | undefined) : undefined
}

/** A Node that y-sorts what is below it: it holds a shown YSort. */
export function sortsBelow(node: SceneNode): boolean {
  const y = isBranch(node) ? ySortNodeOf(node) : undefined
  return y !== undefined && y.visible !== false
}

/** Whether a node draws y-sorted among the characters: it is a Node holding a shown YSort, or sits below one. */
export function effectiveYSort(node: SceneNode, ancestors: readonly SceneNode[]): boolean {
  return sortsBelow(node) || inheritedYSort(ancestors)
}

/** Whether what sits below `ancestors` is y-sorted (one of them holds a shown YSort). */
export function inheritedYSort(ancestors: readonly SceneNode[]): boolean {
  return ancestors.some(sortsBelow)
}

/** Modifier nodes change their parent instead of drawing: Look and YSort. */
export const isModifier = (node: SceneNode): boolean => node.type === 'look' || node.type === 'ySort'

const opacityOf = (node: SceneNode): number => ((node.type === 'picture' || node.type === 'group') && node.opacity !== undefined ? node.opacity : 1)

/** The node's opacity multiplied by every ancestor's (1 = opaque). */
export function effectiveOpacity(node: SceneNode, ancestors: readonly SceneNode[]): number {
  return ancestors.reduce((product, a) => product * opacityOf(a), opacityOf(node))
}

/** The Look node a node holds (its first one), if any. */
export function lookNodeOf(node: SceneNode | undefined): LookNode | undefined {
  return node ? (childrenOf(node).find((c) => c.type === 'look') as LookNode | undefined) : undefined
}

/** The look a node's own Look child gives (a hidden Look gives none). */
export function ownLook(node: SceneNode | undefined): LookSet | undefined {
  const look = lookNodeOf(node)
  return look && look.visible !== false ? look.look : undefined
}

/**
 * The look that grades a node as a layer: its own Look, else the nearest one of a Node above it. For a run of
 * sprites pass their parent as `node` (the sprites' own Looks grade each sprite).
 */
export function effectiveLook(node: SceneNode | undefined, ancestors: readonly SceneNode[]): LookSet | undefined {
  const own = ownLook(node)
  if (own) return own
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const look = isBranch(ancestors[i]) ? ownLook(ancestors[i]) : undefined
    if (look) return look
  }
  return undefined
}

const zOf = (node: SceneNode): number | undefined => (isBranch(node) ? node.z : undefined)

/** The game depth of the sprites directly under `parent` (path `ancestors` above it): the nearest z of a Node. */
export function inheritedZ(parent: SceneNode | undefined, ancestors: readonly SceneNode[]): number | undefined {
  return inheritedValue(parent, ancestors, zOf)
}

// ── one kind of Node: promotion and transforms ─────────────────────────────────────────────────────

/**
 * The tree with every plain Node that holds a component node turned into an entity (same id, name, children, anchor;
 * empty own components), so a Node given an AnimatedSprite, StaticBody, Area, movement node or Event is an entity of the
 * game. The same array comes back when there is nothing to promote. Pure and idempotent; the editor runs it on every
 * change of the tree.
 */
export function promoteNodes(nodes: SceneNode[]): SceneNode[] {
  return mapTree(nodes, (node) => {
    if (node.type !== 'group' || !kids(node).some(isComponentNode)) return node
    const { type: _t, x, y, rotation, ...rest } = node
    // Its anchor is where the entity stands: the Transform says so (depth: the default one).
    const at = { x: x ?? 0, y: y ?? 0 }
    const entity: EntityNode = { ...rest, type: 'entity', ...at, components: { Transform: { ...at, depth: 20, ...(isOffGrid(at.x, at.y) ? { free: true } : {}) } } }
    if (rotation) entity.rotation = rotation
    return entity
  })
}

/** Where a node's anchor is: a Node's or entity's position (a Node without one is at the map's origin), a sprite's anchor. */
export function nodeAnchor(node: SceneNode): { x: number; y: number } | null {
  if (node.type === 'entity' || node.type === 'picture') return { x: node.x, y: node.y }
  if (node.type === 'group') return { x: node.x ?? 0, y: node.y ?? 0 }
  return null
}

/** Whether a node has an anchor that can be placed (a Node, an entity, a sprite). */
export const hasAnchor = (node: SceneNode): boolean => nodeAnchor(node) !== null

const round3 = (v: number) => Math.round(v * 1000) / 1000

/**
 * A node and everything below it moved by (dx, dy): Nodes, entities and sprites move their anchors, the shapes of the
 * map's StaticBody their points; painted layers stay on their grid and an entity's own shapes are already relative to
 * it. The same node comes back for a zero move.
 */
export function translateSubtree<T extends SceneNode>(node: T, dx: number, dy: number): T {
  if (dx === 0 && dy === 0) return node
  const go = (n: SceneNode, inBody: boolean): SceneNode => {
    let out: SceneNode = n
    if (n.type === 'entity' || n.type === 'picture') out = { ...n, x: round3(n.x + dx), y: round3(n.y + dy) }
    else if (n.type === 'group') out = { ...n, x: round3((n.x ?? 0) + dx), y: round3((n.y ?? 0) + dy) }
    else if (n.type === 'collisionShape' && !inBody) out = { ...n, points: n.points.map((p) => ({ ...p, x: round3(p.x + dx), y: round3(p.y + dy) })) }
    if (!isContainer(out)) return out
    const body = inBody || n.type === 'body' || n.type === 'area'
    const children = kids(out).map((c) => go(c, body))
    return children.some((c, i) => c !== kids(out as ContainerNode)[i]) ? withChildren(out as ContainerNode, children) : out
  }
  return go(node, false) as T
}

/**
 * A Node (or entity) and everything below it turned by `degrees` around its anchor: the anchors of what is below it
 * turn around it and every Node, entity and sprite adds the angle to its own rotation. Painted layers and shapes stay
 * as they are. The same node comes back for a zero turn.
 */
export function rotateSubtree<T extends SceneNode>(node: T, degrees: number): T {
  const anchor = nodeAnchor(node)
  if (!anchor || !degrees) return node
  const rad = (degrees * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const turnPoint = (x: number, y: number) => ({ x: round3(anchor.x + (x - anchor.x) * cos - (y - anchor.y) * sin), y: round3(anchor.y + (x - anchor.x) * sin + (y - anchor.y) * cos) })
  const angle = (r: number | undefined) => {
    const v = round3((((r ?? 0) + degrees) % 360 + 360) % 360)
    return v === 0 ? undefined : v > 180 ? round3(v - 360) : v
  }
  const go = (n: SceneNode, top: boolean): SceneNode => {
    let out: SceneNode = n
    if (n.type === 'entity' || n.type === 'picture' || n.type === 'group') {
      const a = nodeAnchor(n)!
      const p = top ? a : turnPoint(a.x, a.y)
      const r = angle(n.rotation)
      const next = { ...n, x: p.x, y: p.y } as typeof n
      if (r === undefined) delete next.rotation
      else next.rotation = r
      out = next
    }
    if (!isContainer(out) || out.type === 'body' || out.type === 'area' || out.type === 'collision' || out.type === 'tile') return out
    const children = kids(out).map((c) => go(c, false))
    return children.some((c, i) => c !== kids(out as ContainerNode)[i]) ? withChildren(out as ContainerNode, children) : out
  }
  return go(node, true) as T
}
