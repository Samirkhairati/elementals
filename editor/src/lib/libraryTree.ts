// Folder tree of an asset library (graphics, tilesets): items with a folder path, plus the folders that exist on
// disk even when empty. Pure, so the Database tables and their tests share it.

export interface LibraryItem {
  /** What selects it: the graphic id, or the tileset file name. */
  key: string
  /** Shown name. */
  name: string
  /** "/"-separated folder path; '' at the top level. */
  folder: string
}

export interface FolderNode {
  /** Full folder path; '' for the root. */
  path: string
  name: string
  folders: FolderNode[]
  items: LibraryItem[]
}

const byName = <T extends { name: string }>(a: T, b: T) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0)

/** Whether an item matches a search (case-insensitive, name or key). */
export const matchesQuery = (item: LibraryItem, query: string): boolean => {
  const q = query.trim().toLowerCase()
  return !q || item.name.toLowerCase().includes(q) || item.key.toLowerCase().includes(q)
}

/**
 * The tree for `items` and `folders`. Without a query every folder shows (empty ones too); with one only the
 * matching items and the folders leading to them stay.
 */
export function buildLibraryTree(items: readonly LibraryItem[], folders: readonly string[], query = ''): FolderNode {
  const searching = query.trim() !== ''
  const root: FolderNode = { path: '', name: '', folders: [], items: [] }
  const nodes = new Map<string, FolderNode>([['', root]])
  const ensure = (path: string): FolderNode => {
    const hit = nodes.get(path)
    if (hit) return hit
    const parent = ensure(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')
    const node: FolderNode = { path, name: path.slice(path.lastIndexOf('/') + 1), folders: [], items: [] }
    parent.folders.push(node)
    nodes.set(path, node)
    return node
  }
  if (!searching) for (const f of folders) if (f) ensure(f)
  for (const item of items) if (matchesQuery(item, query)) ensure(item.folder).items.push(item)
  const sort = (n: FolderNode) => {
    n.folders.sort(byName)
    n.items.sort(byName)
    n.folders.forEach(sort)
  }
  sort(root)
  return root
}

/** Every item below a node, in tree order. */
export function itemsIn(node: FolderNode): LibraryItem[] {
  return [...node.items, ...node.folders.flatMap(itemsIn)]
}
