// The folder tree of a picture browser (the picker's left side): folders come from the ids themselves
// (`images/city/wall.png` sits in `images/city`, inside `images`), each with how many entries are inside it, its
// subfolders included. Pure, so the picker stays a thin view.

import { sanitizeSegment } from './importNames'

export interface PictureFolder {
  /** Path ('' = everything). */
  path: string
  name: string
  /** Entries in this folder and all below it. */
  count: number
  folders: PictureFolder[]
}

export const folderOfPath = (id: string): string => (id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '')

/** True when `id` is in `folder` or below it ('' holds everything). */
export const inFolder = (id: string, folder: string): boolean => folder === '' || id.startsWith(`${folder}/`)

export function pictureFolderTree(ids: readonly string[]): PictureFolder {
  const root: PictureFolder = { path: '', name: 'All', count: 0, folders: [] }
  const nodes = new Map<string, PictureFolder>([['', root]])
  const ensure = (path: string): PictureFolder => {
    const hit = nodes.get(path)
    if (hit) return hit
    const node: PictureFolder = { path, name: path.slice(path.lastIndexOf('/') + 1), count: 0, folders: [] }
    nodes.set(path, node)
    ensure(folderOfPath(path)).folders.push(node)
    return node
  }
  for (const id of ids) {
    let folder = folderOfPath(id)
    ensure(folder)
    for (;;) {
      ensure(folder).count++
      if (folder === '') break
      folder = folderOfPath(folder)
    }
  }
  const sort = (n: PictureFolder) => {
    n.folders.sort((a, b) => (a.path < b.path ? -1 : 1))
    n.folders.forEach(sort)
  }
  sort(root)
  return root
}

/** Where pictures added straight from the map editor (uploaded, dropped or pasted) are filed: `pasted/<map name>`. */
export function pastedFolder(mapName: string | null | undefined): string {
  return `pasted/${sanitizeSegment(mapName ?? '') || 'map'}`
}
