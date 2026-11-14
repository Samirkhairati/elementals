// Read-only views of a map's scene tree, computed once per tree identity: every lookup the editor needs (a node by id,
// where it sits, whether it is shown or locked once its ancestors are counted, the layers in draw and in list order,
// the entities, what the canvas draws and in which runs) comes from one walk that is cached on the `nodes` array itself.
// The tree is immutable, so a new array means a new index; an unchanged tree is never walked again.

import {
  allEntities,
  isContainer,
  isLayerNode,
  isLocked,
  isVisible,
  walk,
  type EntityNode,
  type LayerNode,
  type PictureNode,
  type SceneNode,
  type WalkEntry,
} from '../../../shared/sceneTree'

export interface SceneIndex {
  nodes: readonly SceneNode[]
  /** Every node, depth first in draw order. */
  entries: readonly WalkEntry[]
  byId: ReadonlyMap<string, WalkEntry>
  /** Every layer node in draw order (the first one is at the back). */
  layers: readonly LayerNode[]
  /** Every layer node as the list shows them: top first. */
  layersTopFirst: readonly LayerNode[]
  entities: readonly EntityNode[]
  pictures: readonly PictureNode[]
}

const cache = new WeakMap<readonly SceneNode[], SceneIndex>()

/** The index of a tree (the same object for the same `nodes` array). */
export function sceneIndex(nodes: readonly SceneNode[]): SceneIndex {
  const hit = cache.get(nodes)
  if (hit) return hit
  const entries = walk(nodes)
  const byId = new Map<string, WalkEntry>()
  const layers: LayerNode[] = []
  const pictures: PictureNode[] = []
  for (const entry of entries) {
    byId.set(entry.node.id, entry)
    if (isLayerNode(entry.node)) layers.push(entry.node)
    else if (entry.node.type === 'picture') pictures.push(entry.node)
  }
  const index: SceneIndex = { nodes, entries, byId, layers, layersTopFirst: layers.slice().reverse(), entities: allEntities(nodes), pictures }
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

/** The nearest layer node at or above `id` (a picture's image layer, a collision item's collision layer; the node itself for a layer). */
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

/**
 * Locked for editing a picture: its image layer (or a group above that layer), or the picture itself, is locked. A locked
 * group inside the image layer is not counted: it only makes a click on one of its pictures pick the whole group.
 */
export function pictureLocked(index: SceneIndex, id: string): boolean {
  const entry = index.byId.get(id)
  if (!entry) return false
  if (entry.node.locked === true) return true
  for (let i = entry.ancestors.length - 1; i >= 0; i--) {
    const a = entry.ancestors[i]
    if (a.locked === true && a.type !== 'group') return true
    if (a.type === 'image') return entry.ancestors.slice(0, i).some((n) => n.locked === true)
  }
  return false
}

const shownPictures = new WeakMap<SceneNode, PictureNode[]>()

/** The pictures of an image layer that are shown (not hidden themselves or by a group), in the order they draw: `z`, then tree order. */
export function visiblePictures(layer: SceneNode): PictureNode[] {
  const hit = shownPictures.get(layer)
  if (hit) return hit
  const found: PictureNode[] = []
  const visit = (list: readonly SceneNode[]) => {
    for (const n of list) {
      if (n.visible === false) continue
      if (n.type === 'picture') found.push(n)
      else if (isContainer(n)) visit(n.children)
    }
  }
  visit(isContainer(layer) ? layer.children : [])
  const sorted = found
    .map((picture, order) => ({ picture, order }))
    .sort((a, b) => (a.picture.z ?? 0) - (b.picture.z ?? 0) || a.order - b.order)
    .map((e) => e.picture)
  shownPictures.set(layer, sorted)
  return sorted
}

// ── what the canvas draws ──────────────────────────────────────────────────────────────────────────

/** One stretch of the draw order: neighbouring shown layers, or neighbouring shown entities (they sort among themselves). */
export type DrawSegment = { kind: 'layers'; key: string; layers: LayerNode[] } | { kind: 'entities'; key: string; entities: EntityNode[] }

export interface DrawPlan {
  segments: DrawSegment[]
  /** Every shown entity, in tree order (the picking handles and overlays are not part of the draw order). */
  entities: EntityNode[]
}

const plans = new WeakMap<readonly SceneNode[], DrawPlan>()

/**
 * What the canvas draws, bottom to top: the tree's nodes in draw order with everything hidden (the node or an ancestor)
 * left out, neighbouring layers in one segment and neighbouring entities in another. Groups themselves draw nothing.
 */
export function drawPlan(index: SceneIndex): DrawPlan {
  const hit = plans.get(index.nodes)
  if (hit) return hit
  const segments: DrawSegment[] = []
  const entities: EntityNode[] = []
  for (const { node, ancestors } of index.entries) {
    if (node.type === 'entity') {
      if (!isVisible(node, ancestors)) continue
      entities.push(node)
      const last = segments[segments.length - 1]
      if (last?.kind === 'entities') last.entities.push(node)
      else segments.push({ kind: 'entities', key: `e:${node.id}`, entities: [node] })
    } else if (isLayerNode(node)) {
      if (!isVisible(node, ancestors)) continue
      const last = segments[segments.length - 1]
      if (last?.kind === 'layers') last.layers.push(node)
      else segments.push({ kind: 'layers', key: `l:${node.id}`, layers: [node] })
    }
  }
  const plan = { segments, entities }
  plans.set(index.nodes, plan)
  return plan
}
