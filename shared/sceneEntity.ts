// An entity of the scene tree is an ECS entity whose components are nodes: the entity node keeps its position, its
// Transform and Tag (and any component this file does not know, untouched), and its children are the rest:
//
//   AnimatedSprite (`animatedSprite`)  -> Sprite      (props; `visible` is the node's eye)
//   StaticBody (`body`) + its shape    -> Collider    (solid; nothing without a shape)
//   Area (`area`) + its shape          -> Area        (where its events trigger; nothing without a shape), or the Collider (not solid) when the
//                                                        entity has no body
//   Wander / PlayerController / Mover    -> Movement    (controller wander / player / none)
//   Event (`event`)                      -> Event
//
// `componentsOfEntity` reads the bag of components the game and the editor's entity code work with; `entityWithComponents`
// writes a bag back into the children, keeping the nodes (ids, names, order) that did not change. Pure; type-strippable.

import type { AnimatedSpriteNode, AreaNode, BodyNode, CollisionShapeNode, EntityNode, EventNode, MovementNode, SceneNode, ShapeBox } from './sceneTree.ts'
import { NODE_TYPES, childrenOf } from './sceneTree.ts'
import { cloneJson, deepEqual, isRecord } from './engine/util.ts'
import { isOffGrid } from './engine/placement.ts'

type Bag = Record<string, unknown>
/** Component name -> props, as `EngineEntity.components`. */
export type ComponentBag = Record<string, Bag | undefined>

/** The components that are child nodes; every other one stays in the entity node's own `components`. */
export const NODE_COMPONENTS = ['Sprite', 'Collider', 'Area', 'Movement', 'Event'] as const

const CONTROLLER_OF: Record<MovementNode['type'], string> = { wander: 'wander', playerController: 'player', mover: 'none' }
const MOVEMENT_TYPE_OF: Record<string, MovementNode['type']> = { wander: 'wander', player: 'playerController', none: 'mover' }

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const firstOf = <T extends SceneNode>(list: readonly SceneNode[], test: (n: SceneNode) => boolean): T | undefined => list.find(test) as T | undefined
const shapeIn = (node: SceneNode | undefined): CollisionShapeNode | undefined =>
  node ? firstOf<CollisionShapeNode>(childrenOf(node), (c) => c.type === 'collisionShape') : undefined

/** The Collider geometry a shape gives (no `isSolid`): its box, or its polygon with the bounding box; nothing without a shape. */
export function shapeGeometry(shape: CollisionShapeNode | undefined): Bag {
  if (!shape) return {}
  if (shape.box) return { ...shape.box }
  const points = shape.points ?? []
  if (points.length === 0) return {}
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { width: maxX - minX, height: maxY - minY, offsetX: (minX + maxX) / 2, offsetY: maxY, shape: 'polygon', points: cloneJson(points), closed: shape.closed !== false }
}

/** The shape fields for some Collider or Area props: a polygon when it is one, else its box. */
function geometryToShape(props: Bag): Pick<CollisionShapeNode, 'points' | 'closed' | 'box'> {
  if (props.shape === 'polygon' && Array.isArray(props.points) && props.points.length > 0) {
    return { points: cloneJson(props.points) as CollisionShapeNode['points'], closed: props.closed !== false }
  }
  const box: ShapeBox = { width: num(props.width, 32), height: num(props.height, 32), offsetX: num(props.offsetX, 0), offsetY: num(props.offsetY, 0) }
  return { points: [], closed: true, box }
}

const boxOnly = (g: Bag): Bag => {
  const { shape: _s, points: _p, closed: _c, ...box } = g
  return box
}

const bags = new WeakMap<EntityNode, ComponentBag>()

/** The entity's components: its own (Transform, Tag, ...) and the ones its child nodes stand for. Cached per node. */
export function componentsOfEntity(node: EntityNode): ComponentBag {
  const hit = bags.get(node)
  if (hit) return hit
  const out: ComponentBag = { ...(isRecord(node.components) ? node.components : {}) }
  const children = childrenOf(node)
  const sprite = firstOf<AnimatedSpriteNode>(children, (c) => c.type === 'animatedSprite')
  // A StaticBody or Area without a CollisionShape does nothing (as in Godot): it needs a shape to collide or trigger.
  const body = firstOf<BodyNode>(children, (c) => c.type === 'body' && shapeIn(c) !== undefined)
  const area = firstOf<AreaNode>(children, (c) => c.type === 'area' && shapeIn(c) !== undefined)
  const movement = firstOf<MovementNode>(children, (c) => c.type === 'wander' || c.type === 'playerController' || c.type === 'mover')
  const event = firstOf<EventNode>(children, (c) => c.type === 'event')
  if (sprite) out.Sprite = { ...sprite.props, visible: sprite.visible !== false }
  if (body) {
    out.Collider = { ...shapeGeometry(shapeIn(body)), isSolid: true }
    if (area) out.Area = { width: 32, height: 32, offsetX: 0, offsetY: 0, ...boxOnly(shapeGeometry(shapeIn(area))) }
  } else if (area) {
    out.Collider = { ...shapeGeometry(shapeIn(area)), isSolid: false }
  }
  if (movement) out.Movement = { controller: CONTROLLER_OF[movement.type], ...movement.props }
  if (event) out.Event = event.props
  const ordered = inComponentOrder(out)
  bags.set(node, ordered)
  return ordered
}

const ORDER = ['Transform', 'Sprite', 'Collider', 'Area', 'Movement', 'Event', 'Tag']

// The bag with its keys in the engine's component order (then any others as they came), so exports stay stable.
function inComponentOrder(bag: ComponentBag): ComponentBag {
  const out: ComponentBag = {}
  for (const key of ORDER) if (bag[key] !== undefined) out[key] = bag[key]
  for (const [key, value] of Object.entries(bag)) if (!ORDER.includes(key)) out[key] = value
  return out
}

/** Hands out child ids: `<entity id>:<what>`, with a number when that one is taken. */
function idMaker(entityId: string, taken: (id: string) => boolean) {
  const used = new Set<string>()
  return (what: string) => {
    let id = `${entityId}:${what}`
    for (let n = 2; used.has(id) || taken(id); n++) id = `${entityId}:${what}${n}`
    used.add(id)
    return id
  }
}

type IdFor = (what: string) => string

function withoutVisible(props: Bag): Bag {
  const { visible: _v, ...rest } = props
  return rest
}

// Replaces, adds or removes the one child that `test` finds; `make(existing)` gives the child wanted (or null for none).
function setChild(children: SceneNode[], test: (n: SceneNode) => boolean, make: (existing: SceneNode | undefined) => SceneNode | null): SceneNode[] {
  const index = children.findIndex(test)
  const existing = index >= 0 ? children[index] : undefined
  const next = make(existing)
  if (next === existing) return children
  if (!next) return index < 0 ? children : children.filter((_, i) => i !== index)
  if (index < 0) return [...children, next]
  return children.map((c, i) => (i === index ? next : c))
}

function spriteChild(existing: SceneNode | undefined, props: Bag | undefined, idFor: IdFor): SceneNode | null {
  if (!props) return null
  const wanted = withoutVisible(props)
  const hidden = props.visible === false
  if (existing?.type === 'animatedSprite' && deepEqual(existing.props, wanted) && (existing.visible === false) === hidden) return existing
  const base: AnimatedSpriteNode = existing?.type === 'animatedSprite' ? existing : { id: idFor('sprite'), type: 'animatedSprite', name: NODE_TYPES.animatedSprite.label, props: {} }
  const { visible: _v, ...rest } = base
  return { ...rest, props: cloneJson(wanted), ...(hidden ? { visible: false } : {}) }
}

// A body or area child holding one shape with `geometry`; kept as it is when its shape already gives that geometry.
function shapedChild(type: 'body' | 'area', existing: SceneNode | undefined, geometry: Bag | undefined, compare: (g: Bag) => Bag, idFor: IdFor): SceneNode | null {
  const node = existing?.type === type ? existing : undefined
  const shape = shapeIn(node)
  // A body or area still waiting for its shape stands for no component: it stays until it is given one or deleted.
  if (!geometry) return node && !shape ? node : null
  if (node && deepEqual(compare(shapeGeometry(shape)), compare(geometry))) return node
  const base = node ?? ({ id: idFor(type), type, name: NODE_TYPES[type].label, children: [] } as BodyNode | AreaNode)
  const fields = geometryToShape(geometry)
  const nextShape: CollisionShapeNode = shape
    ? { ...shape, points: fields.points, closed: fields.closed, ...(fields.box ? { box: fields.box } : {}) }
    : { id: idFor(`${type}-shape`), type: 'collisionShape', name: '', ...fields }
  if (!fields.box) delete nextShape.box
  const others = childrenOf(base).filter((c) => c !== shape)
  return { ...base, children: [...others, nextShape] } as BodyNode | AreaNode
}

const geometryOf = (props: Bag): Bag => {
  const { isSolid: _s, ...g } = props
  return g
}

function movementChild(existing: SceneNode | undefined, props: Bag | undefined, idFor: IdFor): SceneNode | null {
  if (!props) return null
  const type = MOVEMENT_TYPE_OF[typeof props.controller === 'string' ? props.controller : 'none'] ?? 'mover'
  const { controller: _c, ...wanted } = props
  const node = existing && (existing.type === 'wander' || existing.type === 'playerController' || existing.type === 'mover') ? existing : undefined
  if (node && node.type === type && deepEqual(node.props, wanted)) return node
  // A node still called after its old type takes the new type's name.
  const name = !node || node.name === NODE_TYPES[node.type].label ? NODE_TYPES[type].label : node.name
  return { ...(node ?? { id: idFor('movement') }), type, name, props: cloneJson(wanted) } as MovementNode
}

function eventChild(existing: SceneNode | undefined, props: Bag | undefined, idFor: IdFor): SceneNode | null {
  if (!props) return null
  if (existing?.type === 'event' && (existing.props === props || deepEqual(existing.props, props))) return existing
  const base: EventNode = existing?.type === 'event' ? existing : { id: idFor('event'), type: 'event', name: NODE_TYPES.event.label, props: {} }
  return { ...base, props: cloneJson(props) }
}

/**
 * The entity with `components` as its components: the ones that are nodes (`NODE_COMPONENTS`) go into its children (a
 * child that already stands for the same props is kept as it is), the others into its own `components`. The same node
 * comes back when nothing changed. `taken` says whether an id is in use elsewhere in the tree (new children get
 * `<entity id>:<what>` ids).
 */
export function entityWithComponents(node: EntityNode, components: ComponentBag, taken: (id: string) => boolean = () => false): EntityNode {
  const own: ComponentBag = {}
  for (const [key, value] of Object.entries(components)) if (!(NODE_COMPONENTS as readonly string[]).includes(key) && value !== undefined) own[key] = value
  const before = childrenOf(node) as SceneNode[]
  const existingIds = new Set(before.flatMap((c) => [c.id, ...childrenOf(c).map((g) => g.id)]))
  const idFor = idMaker(node.id, (id) => existingIds.has(id) || taken(id))
  const collider = components.Collider
  const solid = collider !== undefined && collider.isSolid !== false
  const bodyGeometry = solid ? geometryOf(collider) : undefined
  const areaGeometry = collider !== undefined && !solid ? geometryOf(collider) : solid && components.Area ? components.Area : !collider ? components.Area : undefined

  let children = before
  children = setChild(children, (c) => c.type === 'animatedSprite', (e) => spriteChild(e, components.Sprite, idFor))
  children = setChild(children, (c) => c.type === 'body', (e) => shapedChild('body', e, bodyGeometry, (g) => g, idFor))
  children = setChild(children, (c) => c.type === 'area', (e) => shapedChild('area', e, areaGeometry, boxOnly, idFor))
  children = setChild(children, (c) => c.type === 'wander' || c.type === 'playerController' || c.type === 'mover', (e) => movementChild(e, components.Movement, idFor))
  children = setChild(children, (c) => c.type === 'event', (e) => eventChild(e, components.Event, idFor))

  const sameOwn = deepEqual(own, isRecord(node.components) ? node.components : {})
  if (sameOwn && children === before && Array.isArray(node.children)) return node
  return { ...node, components: sameOwn ? node.components : own, children }
}

/** A new entity node with these fields (id, name, x, y, ...) and components. */
export function entityNodeFrom(fields: { id: string; name: string; x: number; y: number }, components: ComponentBag, taken?: (id: string) => boolean): EntityNode {
  const { components: _c, children: _ch, type: _t, ...rest } = fields as typeof fields & Record<string, unknown>
  return entityWithComponents({ ...rest, type: 'entity', components: {}, children: [] } as EntityNode, components, taken)
}

/** An entity node as the game's entity (`EngineEntity`): its fields and its whole bag of components; no node-only fields. */
export function engineEntityOf(node: EntityNode): Record<string, unknown> & { id: string; name: string; components: ComponentBag } {
  const { type: _type, locked: _locked, children: _children, collapsed: _collapsed, prefab: _prefab, z: _z, opacity: _opacity, pickAsOne: _pick, ...entity } = node
  const components = componentsOfEntity(node)
  // An entity made from a Node before promotion gave it a Transform stands at its anchor (what the game reads).
  if (!components.Transform) {
    const free = isOffGrid(node.x, node.y)
    return { ...entity, components: { Transform: { x: node.x, y: node.y, depth: 20, ...(free ? { free } : {}) }, ...components } }
  }
  return { ...entity, components }
}
