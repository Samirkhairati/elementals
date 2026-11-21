// The layers a scene tree draws as, in draw order (bottom first): its layer nodes (TileMap, Terrain, Encounters,
// Objects, the map's StaticBody) and its sprites, a run of neighbouring Sprite nodes of one parent being one layer
// (the game's image object group; the editor draws them the same way; a Node that only organises sprites stays in its
// parent's run, see `hostIndex`). Entities are not layers. Shared by the exporter and the editor canvas so both see the
// same layers. Pure; type-strippable.

import type { LayerNode, PictureNode, SceneNode } from './sceneTree.ts'
import { childrenOf, isBranch, isLayerNode, isModifier, isVisible, lookNodeOf, walk } from './sceneTree.ts'

export interface PlacedNode<T extends SceneNode = SceneNode> {
  node: T
  /** From the root down to its parent. */
  ancestors: readonly SceneNode[]
}

/** A run of sprites of one parent: `host` is that parent (undefined = the map root), `hostAncestors` the path above it. */
export interface SpriteRun {
  kind: 'sprites'
  /** Stable while the run starts with the same sprite: `s:<first sprite id>`. */
  key: string
  host: SceneNode | undefined
  hostAncestors: readonly SceneNode[]
  /** In tree order. */
  sprites: PlacedNode<PictureNode>[]
}

export type SceneLayer = ({ kind: 'layer'; key: string } & PlacedNode<LayerNode>) | SpriteRun

/**
 * The layers of a tree in draw order (an entity draws its own sprite apart, see the editor's drawPlan). With `shownOnly`, hidden nodes (or nodes below
 * a hidden one) are left out, and a run is made of the shown sprites only.
 */
export function sceneLayers(nodes: readonly SceneNode[], options: { shownOnly?: boolean } = {}): SceneLayer[] {
  const out: SceneLayer[] = []
  let run: SpriteRun | null = null
  for (const { node, ancestors } of walk(nodes)) {
    // An entity is a Node with components: what sits inside it draws like inside a Node; its own sprite is not a layer.
    if (ancestors.some((a) => a.type === 'picture' || a.type === 'body' || a.type === 'area')) continue
    if (options.shownOnly && !isVisible(node, ancestors)) continue
    if (node.type === 'picture') {
      const at = hostIndex(ancestors)
      const host = ancestors[at]
      if (!run || run.host !== host) {
        run = { kind: 'sprites', key: `s:${node.id}`, host, hostAncestors: ancestors.slice(0, Math.max(0, at)), sprites: [] }
        out.push(run)
      }
      run.sprites.push({ node, ancestors })
    } else if (isLayerNode(node)) {
      run = null
      out.push({ kind: 'layer', key: `l:${node.id}`, node, ancestors })
    } else if (!isModifier(node) && node.type !== 'collisionTiles' && node.type !== 'collisionShape') {
      // A Node between two sprites of the same parent ends the run only when it draws something itself.
      if (node.type !== 'group') run = null
    }
  }
  return out
}

// A Node that only organises sprites (no z or Look of its own: what else it passes down is resolved per sprite)
// shares the run of a parent branch that holds sprites itself, as a picture group shared its image layer's object group.
// A parent holding only other nodes is like a folder: each branch in it is its own run. Returns the index in `ancestors`
// of the run's host (-1 = the map root).
function hostIndex(ancestors: readonly SceneNode[]): number {
  let at = ancestors.length - 1
  while (at > 0 && isBranch(ancestors[at]) && passesThrough(ancestors[at]) && holdsSprites(ancestors[at - 1])) at--
  return at
}

const passesThrough = (branch: SceneNode): boolean => (branch as { z?: number }).z === undefined && !lookNodeOf(branch)
// A y-sorted Node around one sprite (what a y-sorted picture became) counts as that sprite.
function isSprite(node: SceneNode): boolean {
  if (node.type === 'picture') return true
  if (!isBranch(node) || !passesThrough(node) || !childrenOf(node).some((c) => c.type === 'ySort')) return false
  const inside = childrenOf(node).filter((c) => !isModifier(c))
  return inside.length === 1 && inside[0].type === 'picture'
}
const holdsSprites = (node: SceneNode): boolean => isBranch(node) && childrenOf(node).some(isSprite)

/** The sprites of a run in the order they draw: `z` first, tree order for ties. */
export function runDrawOrder(run: SpriteRun): PlacedNode<PictureNode>[] {
  return run.sprites
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (a.entry.node.z ?? 0) - (b.entry.node.z ?? 0) || a.index - b.index)
    .map((e) => e.entry)
}
