// The Assets panel's folder tree: project/sprites on disk is `<folder>/<asset>/sprite.json`, so an asset id is
// its path. Folders come from the disk listing (empty ones too); the parents of every asset id are added so an
// asset whose folder is not listed yet still has a place in the tree.

import type { SpriteAssetInfo } from '../../../../../shared/engine/types'

export interface FolderNode {
  /** Path below project/sprites; '' is the root. */
  id: string
  /** Last path segment ('' for the root). */
  name: string
  folders: FolderNode[]
  assets: SpriteAssetInfo[]
}

/** `a/b/c` -> `a/b`; a top-level entry -> '' (the root). */
export function parentFolderOf(id: string): string {
  const i = id.lastIndexOf('/')
  return i < 0 ? '' : id.slice(0, i)
}

export function leafOf(id: string): string {
  return id.slice(id.lastIndexOf('/') + 1)
}

export function joinId(folder: string, leaf: string): string {
  return folder ? `${folder}/${leaf}` : leaf
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * Tree of `folders` + `assets`. With a non-empty `query` only assets whose id or name match are kept, and folders
 * that end up without any asset are left out (the root always stays).
 */
export function buildAssetTree(assets: readonly SpriteAssetInfo[], folders: readonly string[], query = ''): FolderNode {
  const q = query.trim().toLowerCase()
  const root: FolderNode = { id: '', name: '', folders: [], assets: [] }
  const nodes = new Map<string, FolderNode>([['', root]])

  const ensure = (id: string): FolderNode => {
    const hit = nodes.get(id)
    if (hit) return hit
    const node: FolderNode = { id, name: leafOf(id), folders: [], assets: [] }
    nodes.set(id, node)
    ensure(parentFolderOf(id)).folders.push(node)
    return node
  }

  if (!q) for (const f of folders) if (f) ensure(f)
  for (const a of assets) {
    if (q && !a.id.toLowerCase().includes(q) && !a.meta.name.toLowerCase().includes(q)) continue
    ensure(parentFolderOf(a.id)).assets.push(a)
  }

  const sort = (n: FolderNode) => {
    n.folders.sort(byId)
    n.assets.sort(byId)
    n.folders.forEach(sort)
  }
  sort(root)
  return root
}

/** Assets in `node` and everything below it. */
export function countAssets(node: FolderNode): number {
  return node.assets.length + node.folders.reduce((n, f) => n + countAssets(f), 0)
}

/** Ids of the assets in `node` and everything below it. */
export function assetIdsIn(node: FolderNode): string[] {
  return [...node.assets.map((a) => a.id), ...node.folders.flatMap(assetIdsIn)]
}

/** Folder `id` in the tree, or null. */
export function findFolder(root: FolderNode, id: string): FolderNode | null {
  if (root.id === id) return root
  for (const f of root.folders) {
    if (id === f.id || id.startsWith(`${f.id}/`)) return findFolder(f, id)
  }
  return null
}

/** True when `id` is `ancestor` or lies inside it. */
export function isInside(id: string, ancestor: string): boolean {
  return id === ancestor || id.startsWith(`${ancestor}/`)
}
