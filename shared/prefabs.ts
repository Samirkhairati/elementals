// Prefabs: saved node trees the author places again and again (an NPC, a sign, a door...). A prefab is a Node (with or
// without components) and everything inside it, stored with its anchor at (0, 0) so placing it is a move. The project's
// prefabs live in project/prefabs.json (the editor's Save as Prefab); a project without that file starts from the
// built-in ones (shared/engine/prefabs.ts, turned into node trees here). Pure; no DOM or Node imports; type-strippable.

import type { EntityNode, SceneNode } from './sceneTree.ts'
import { cloneWithNewIds, isBranch, nodeAnchor, translateSubtree } from './sceneTree.ts'
import { entityNodeFrom, type ComponentBag } from './sceneEntity.ts'
import { PREFABS as ENGINE_PREFABS } from './engine/prefabs.ts'
import { cloneJson, isRecord } from './engine/util.ts'

export interface NodePrefab {
  id: string
  name: string
  /** What the Add Node menu says about it. */
  description?: string
  /** lucide icon name (kebab-case). */
  icon?: string
  /** The tree, its anchor at (0, 0). */
  node: SceneNode
}

export interface PrefabsFile {
  prefabs: NodePrefab[]
}

/** The built-in prefabs as node trees: an entity whose collider became a StaticBody or Area with a CollisionShape. */
export function builtInPrefabs(): NodePrefab[] {
  return ENGINE_PREFABS.map((p) => {
    const components = cloneJson(p.components) as ComponentBag
    if (isRecord(components.Transform)) components.Transform = { ...components.Transform, x: 0, y: 0 }
    const node: EntityNode = entityNodeFrom({ id: `prefab-${p.id}`, name: p.name, x: 0, y: 0 }, components)
    return { id: p.id, name: p.name, description: p.description, icon: p.icon, node }
  })
}

/** A prefabs file read from disk, cleaned: unusable entries are left out. */
export function cleanPrefabsFile(raw: unknown): PrefabsFile {
  const list = isRecord(raw) && Array.isArray(raw.prefabs) ? raw.prefabs : []
  const seen = new Set<string>()
  const prefabs: NodePrefab[] = []
  for (const p of list) {
    if (!isRecord(p) || typeof p.id !== 'string' || !p.id || seen.has(p.id) || !isRecord(p.node) || typeof p.node.type !== 'string') continue
    seen.add(p.id)
    prefabs.push({
      id: p.id,
      name: typeof p.name === 'string' && p.name ? p.name : p.id,
      ...(typeof p.description === 'string' ? { description: p.description } : {}),
      ...(typeof p.icon === 'string' ? { icon: p.icon } : {}),
      node: p.node as unknown as SceneNode,
    })
  }
  return { prefabs }
}

/** A prefab id from a name: lower case, runs of other characters as `-`, made free among `taken`. */
export function prefabId(name: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'prefab'
  if (!used.has(base)) return base
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`
}

/**
 * A node tree as a prefab: a copy moved so its anchor is at (0, 0), without the link to the prefab it was placed from
 * and without its lock or open / closed state.
 */
export function prefabFromNode(node: SceneNode, id: string, name: string, extra: { description?: string; icon?: string } = {}): NodePrefab {
  const at = nodeAnchor(node) ?? { x: 0, y: 0 }
  const moved = translateSubtree(cloneJson(node), -at.x, -at.y) as SceneNode & { prefab?: string }
  const { prefab: _link, locked: _locked, collapsed: _collapsed, ...root } = moved as SceneNode & { prefab?: string; collapsed?: boolean }
  return { id, name, ...extra, node: { ...root, name } as SceneNode }
}

/**
 * A copy of a prefab's tree placed with its anchor at (x, y): new ids everywhere (`newId` is injected), named after the
 * prefab, and remembering which prefab it came from (`prefab`) so Save as Prefab can update it.
 */
export function placePrefab(prefab: NodePrefab, x: number, y: number, newId: () => string, name?: string): SceneNode {
  const copy = translateSubtree(cloneWithNewIds(cloneJson(prefab.node), newId), x, y)
  const out = { ...copy, name: name ?? prefab.name } as SceneNode
  if (isBranch(out)) (out as SceneNode & { prefab?: string }).prefab = prefab.id
  return out
}
