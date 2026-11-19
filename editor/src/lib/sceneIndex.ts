// Read-only views of a map's scene tree, computed once per tree identity: every lookup the editor needs (a node by id,
// where it sits, whether it is shown or locked once its ancestors are counted, the layers in draw and in list order,
// the entities, what the canvas draws and in which runs) comes from one walk that is cached on the `nodes` array itself.
// The tree is immutable, so a new array means a new index; an unchanged tree is never walked again.

import {
  isBranch,
  isLayerNode,
  isLocked,
  isVisible,
  walk,
  effectiveLook,
  type BranchNode,
  type EntityNode,
  type LayerNode,
  type PictureNode,
  type SceneNode,
  type WalkEntry,
} from '../../../shared/sceneTree'
import { componentsOfEntity } from '../../../shared/sceneEntity'
import { runDrawOrder, sceneLayers } from '../../../shared/sceneLayers'
import type { LookSet } from '../../../shared/look/types'

export interface SceneIndex {
  nodes: readonly SceneNode[]
  /** Every node, depth first in draw order. */
  entries: readonly WalkEntry[]
  byId: ReadonlyMap<string, WalkEntry>
  /** Every layer node in draw order (the first one is at the back). */
  layers: readonly LayerNode[]
  /** Every layer node as the list shows them: top first. */
  layersTopFirst: readonly LayerNode[]
  /** Every entity as the editor's entity code reads it: the node with its whole bag of components (`entityView`). */
  entities: readonly EntityNode[]
  pictures: readonly PictureNode[]
  /** Every Node2D and YSort that holds sprites itself, in draw order. */
  spriteHosts: readonly BranchNode[]
}

const cache = new WeakMap<readonly SceneNode[], SceneIndex>()
const views = new WeakMap<EntityNode, EntityNode>()

/**
 * An entity node with `components` holding all its components (its own and its child nodes', shared/sceneEntity.ts):
 * what the entity panels, the canvas and the entity manager read. Cached per node. Write it back with
 * `entityWithComponents` (useEntityManager does), never as a node.
 */
export function entityView(node: EntityNode): EntityNode {
  const hit = views.get(node)
  if (hit) return hit
  const view = { ...node, components: componentsOfEntity(node) }
  views.set(node, view)
  return view
}

/** The index of a tree (the same object for the same `nodes` array). */
export function sceneIndex(nodes: readonly SceneNode[]): SceneIndex {
  const hit = cache.get(nodes)
  if (hit) return hit
  const entries = walk(nodes)
  const byId = new Map<string, WalkEntry>()
  const layers: LayerNode[] = []
  const pictures: PictureNode[] = []
  const entities: EntityNode[] = []
  const hosts = new Set<BranchNode>()
  for (const entry of entries) {
    byId.set(entry.node.id, entry)
    if (isLayerNode(entry.node)) layers.push(entry.node)
    else if (entry.node.type === 'picture') {
      pictures.push(entry.node)
      const parent = entry.ancestors[entry.ancestors.length - 1]
      if (parent && isBranch(parent)) hosts.add(parent)
    } else if (entry.node.type === 'entity') entities.push(entityView(entry.node))
  }
  const spriteHosts = entries.map((e) => e.node).filter((n): n is BranchNode => hosts.has(n as BranchNode))
  const index: SceneIndex = { nodes, entries, byId, layers, layersTopFirst: layers.slice().reverse(), entities, pictures, spriteHosts }
  cache.set(nodes, index)
  return index
}

export const nodeOf = (index: SceneIndex, id: string | null | undefined): SceneNode | undefined => (id ? index.byId.get(id)?.node : undefined)

export const layerOf = (index: SceneIndex, id: string | null | undefined): LayerNode | undefined => {
  const node = nodeOf(index, id)
  return node && isLayerNode(node) ? node : undefined
}

/** Shown: the node and every node above it are not hidden. False for an unknown id. */
export function shown(index: SceneIndex, id: string): boolean {
  const entry = index.byId.get(id)
  return !!entry && isVisible(entry.node, entry.ancestors)
}

/** Locked: the node or any node above it is locked. False for an unknown id. */
export function lockedNode(index: SceneIndex, id: string): boolean {
  const entry = index.byId.get(id)
  return !!entry && isLocked(entry.node, entry.ancestors)
}

/** The nearest layer node at or above `id` (a collision item's StaticBody2D, a Look's TileMap; the node itself for a layer). */
export function layerAbove(index: SceneIndex, id: string | null | undefined): LayerNode | undefined {
  const entry = id ? index.byId.get(id) : undefined
  if (!entry) return undefined
  if (isLayerNode(entry.node)) return entry.node
  for (let i = entry.ancestors.length - 1; i >= 0; i--) {
    const a = entry.ancestors[i]
    if (isLayerNode(a)) return a
  }
  return undefined
}

/** The Node2D or YSort a sprite (or a node below a sprite) sits in: its sprite host. The node itself for a Node2D / YSort. */
export function hostOf(index: SceneIndex, id: string | null | undefined): BranchNode | undefined {
  const entry = id ? index.byId.get(id) : undefined
  if (!entry) return undefined
  if (isBranch(entry.node)) return entry.node
  for (let i = entry.ancestors.length - 1; i >= 0; i--) {
    const a = entry.ancestors[i]
    if (isBranch(a)) return a
  }
  return undefined
}

/** The entity a node belongs to: the entity itself, or the entity above a component node. */
export function entityOf(index: SceneIndex, id: string | null | undefined): EntityNode | undefined {
  const entry = id ? index.byId.get(id) : undefined
  if (!entry) return undefined
  if (entry.node.type === 'entity') return entry.node
  return entry.ancestors.find((a): a is EntityNode => a.type === 'entity')
}

/** Locked for editing a sprite: it or a node above it is locked. */
export function pictureLocked(index: SceneIndex, id: string): boolean {
  return lockedNode(index, id)
}

const shownPictures = new WeakMap<SceneNode, PictureNode[]>()

/**
 * The shown sprites of a Node2D or YSort and of the Node2Ds and YSorts inside it (not hidden themselves or by a node in
 * between), in the order they draw: `z`, then tree order.
 */
export function visiblePictures(host: SceneNode): PictureNode[] {
  const hit = shownPictures.get(host)
  if (hit) return hit
  const found: PictureNode[] = []
  const visit = (list: readonly SceneNode[]) => {
    for (const n of list) {
      if (n.visible === false) continue
      if (n.type === 'picture') found.push(n)
      else if (isBranch(n)) visit(n.children)
    }
  }
  visit(isBranch(host) ? host.children : [])
  const sorted = found
    .map((picture, order) => ({ picture, order }))
    .sort((a, b) => (a.picture.z ?? 0) - (b.picture.z ?? 0) || a.order - b.order)
    .map((e) => e.picture)
  shownPictures.set(host, sorted)
  return sorted
}

// ── what the canvas draws ──────────────────────────────────────────────────────────────────────────

/** One layer of the canvas: a layer node with the look it is graded with, or a run of sprites of one host. */
export type DrawLayer =
  | { kind: 'layer'; key: string; node: LayerNode; look: LookSet | undefined }
  | { kind: 'sprites'; key: string; host: BranchNode; look: LookSet | undefined; pictures: PictureNode[] }

/** One stretch of the draw order: neighbouring shown layers, or neighbouring shown entities (they sort among themselves). */
export type DrawSegment = { kind: 'layers'; key: string; layers: DrawLayer[] } | { kind: 'entities'; key: string; entities: EntityNode[] }

export interface DrawPlan {
  segments: DrawSegment[]
  /** Every shown entity, in tree order (the picking handles and overlays are not part of the draw order). */
  entities: EntityNode[]
}

const plans = new WeakMap<readonly SceneNode[], DrawPlan>()

/**
 * What the canvas draws, bottom to top: the tree's layers (`sceneLayers`: layer nodes and runs of sprites) and its
 * entities in draw order, everything hidden (the node or an ancestor) left out, neighbouring layers in one segment and
 * neighbouring entities in another. Node2Ds themselves draw nothing.
 */
export function drawPlan(index: SceneIndex): DrawPlan {
  const hit = plans.get(index.nodes)
  if (hit) return hit
  const layerAt = new Map<string, DrawLayer>()
  for (const layer of sceneLayers(index.nodes, { shownOnly: true })) {
    if (layer.kind === 'layer') {
      layerAt.set(layer.node.id, { kind: 'layer', key: layer.key, node: layer.node, look: layer.node.type === 'tile' ? effectiveLook(layer.node, layer.ancestors) : undefined })
    } else if (layer.host && isBranch(layer.host)) {
      const pictures = runDrawOrder(layer).map((s) => s.node)
      layerAt.set(layer.sprites[0].node.id, { kind: 'sprites', key: layer.key, host: layer.host, look: effectiveLook(layer.host, layer.hostAncestors), pictures })
    }
  }
  const segments: DrawSegment[] = []
  const entities: EntityNode[] = []
  for (const { node, ancestors } of index.entries) {
    if (node.type === 'entity') {
      if (!isVisible(node, ancestors)) continue
      const view = entityView(node)
      entities.push(view)
      const last = segments[segments.length - 1]
      if (last?.kind === 'entities') last.entities.push(view)
      else segments.push({ kind: 'entities', key: `e:${node.id}`, entities: [view] })
      continue
    }
    const layer = layerAt.get(node.id)
    if (!layer) continue
    const last = segments[segments.length - 1]
    if (last?.kind === 'layers') last.layers.push(layer)
    else segments.push({ kind: 'layers', key: layer.key, layers: [layer] })
  }
  const plan = { segments, entities }
  plans.set(index.nodes, plan)
  return plan
}
