// The folder browser of an asset library (graphics, tilesets): a tree or tiles, folders you can open, close,
// create in, rename and delete, and drag-and-drop to rearrange. It only reports what the user did; the table
// decides what that means (and rewrites references).

import { useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, FolderPlus, Pencil, Trash2 } from 'lucide-react'
import { canMoveFolder } from '@/lib/assetOps'
import { buildLibraryTree, type FolderNode, type LibraryItem } from '@/lib/libraryTree'
import { Tile } from './browse'
import type { ViewMode } from './browse'

export type DragPayload = { kind: 'item'; key: string } | { kind: 'folder'; key: string }

const DRAG_TYPE = 'application/x-elementals-library'

export interface FolderActions {
  onCreate: (parent: string) => void
  onRename: (folder: string) => void
  onDelete: (folder: string) => void
}

interface Props {
  items: LibraryItem[]
  /** Folders on disk, empty ones included. */
  folders: string[]
  query: string
  mode: ViewMode
  selected: string
  onSelect: (key: string) => void
  thumb: (item: LibraryItem, size: number) => React.ReactNode
  /** Small text under a tile / badge in a row (e.g. "unused"). */
  badge?: (item: LibraryItem) => React.ReactNode
  hint?: (item: LibraryItem) => React.ReactNode
  /** Dropping an item or a folder on a folder ('' = the top level). */
  onMove: (drag: DragPayload, targetFolder: string) => void
  folderActions: FolderActions
  /** What to say when there is nothing at all. */
  emptyText: string
}

const readDrag = (e: React.DragEvent): DragPayload | null => {
  try {
    return JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as DragPayload
  } catch {
    return null
  }
}

export function LibraryBrowser({ items, folders, query, mode, selected, onSelect, thumb, badge, hint, onMove, folderActions, emptyText }: Props) {
  const tree = useMemo(() => buildLibraryTree(items, folders, query), [items, folders, query])
  const searching = query.trim() !== ''
  const [closed, setClosed] = useState<Set<string>>(new Set())
  // What is being dragged lives in a ref too: dragover must know it at once, and the browser forbids reading
  // dataTransfer there. The state only drives the highlight, and is set after the drag has started (changing the DOM
  // inside dragstart makes Chromium cancel the drag).
  const dragRef = useRef<DragPayload | null>(null)
  const [dragging, setDragging] = useState<DragPayload | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const toggle = (path: string) => setClosed((s) => { const n = new Set(s); if (n.has(path)) n.delete(path); else n.add(path); return n })
  const isOpen = (path: string) => searching || !closed.has(path)

  if (items.length === 0 && folders.length === 0) return <p className="ed-hint p-3">{emptyText}</p>
  if (searching && tree.items.length === 0 && tree.folders.length === 0) return <p className="ed-hint p-3">Nothing matches “{query}”.</p>

  const accepts = (target: string): boolean => {
    const d = dragRef.current
    if (!d) return false
    if (d.kind === 'item') return true
    return canMoveFolder(d.key, target)
  }
  // Handlers stop at the innermost folder, so dropping into a nested folder does not also count for its parents.
  const dropProps = (target: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!accepts(target)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      setDropTarget(target)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const drag = dragRef.current ?? readDrag(e)
      const ok = !!drag && accepts(target)
      dragRef.current = null
      setDropTarget(null)
      setDragging(null)
      if (drag && ok) onMove(drag, target)
    },
  })
  const dragProps = (drag: DragPayload) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.stopPropagation()
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(drag))
      e.dataTransfer.effectAllowed = 'move'
      dragRef.current = drag
      setTimeout(() => setDragging(drag), 0)
    },
    onDragEnd: () => {
      dragRef.current = null
      setDragging(null)
      setDropTarget(null)
    },
  })
  const isDragged = (kind: DragPayload['kind'], key: string) => dragging?.kind === kind && dragging.key === key

  const folderRow = (node: FolderNode) => {
    const open = isOpen(node.path)
    return (
      <div className="ed-row group" data-dim={isDragged('folder', node.path) ? 'true' : undefined} {...dragProps({ kind: 'folder', key: node.path })}>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-ed-label font-medium text-foreground" aria-expanded={open} onClick={() => toggle(node.path)}>
          {open ? <ChevronDown className="text-muted-foreground" /> : <ChevronRight className="text-muted-foreground" />}
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          <span className="ed-hint tabular-nums opacity-70 group-hover:hidden">{countIn(node)}</span>
        </button>
        <span className="ed-row-actions hidden group-hover:flex group-focus-within:flex">
          <button type="button" className="ed-iconbtn" title="New folder inside" aria-label={`New folder in ${node.path}`} onClick={() => folderActions.onCreate(node.path)}><FolderPlus /></button>
          <button type="button" className="ed-iconbtn" title="Rename folder" aria-label={`Rename folder ${node.path}`} onClick={() => folderActions.onRename(node.path)}><Pencil /></button>
          <button type="button" className="ed-iconbtn" data-tone="danger" title="Delete folder" aria-label={`Delete folder ${node.path}`} onClick={() => folderActions.onDelete(node.path)}><Trash2 /></button>
        </span>
      </div>
    )
  }

  const itemRow = (item: LibraryItem) => (
    <button
      key={item.key}
      type="button"
      data-selected={selected === item.key ? 'true' : undefined}
      data-dim={isDragged('item', item.key) ? 'true' : undefined}
      className="ed-row flex h-auto w-full items-center gap-2 py-1 text-left text-ed-label"
      onClick={() => onSelect(item.key)}
      {...dragProps({ kind: 'item', key: item.key })}
    >
      {thumb(item, 26)}
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      {badge?.(item)}
    </button>
  )

  // Each level sits in a list with a guide line under its parent's arrow, so depth reads at a glance.
  const renderList = (node: FolderNode, root = false): React.ReactNode => (
    <ul role={root ? 'tree' : 'group'} className={root ? 'flex flex-col gap-0.5' : 'ml-[15px] flex flex-col gap-0.5 border-l border-border pl-1'}>
      {node.folders.map((f) => (
        <li
          key={f.path}
          role="treeitem"
          aria-expanded={isOpen(f.path)}
          aria-label={f.path}
          data-drop={dropTarget === f.path ? 'true' : undefined}
          className="rounded-md data-[drop=true]:bg-primary/10 data-[drop=true]:ring-1 data-[drop=true]:ring-primary/60"
          {...dropProps(f.path)}
        >
          {folderRow(f)}
          {isOpen(f.path) && (f.folders.length > 0 || f.items.length > 0 ? renderList(f) : <p className="ed-hint ml-[15px] border-l border-border py-1 pl-3">Empty. Drop pictures here.</p>)}
        </li>
      ))}
      {node.items.map((i) => <li key={i.key} role="treeitem" aria-selected={selected === i.key}>{itemRow(i)}</li>)}
    </ul>
  )

  const renderTiles = (node: FolderNode): React.ReactNode[] => [
    ...(node.path !== '' || node.items.length > 0 ? [(
      <section key={node.path || '(root)'} {...dropProps(node.path)} data-drop={dropTarget === node.path ? 'true' : undefined} className="rounded-md data-[drop=true]:bg-primary/15">
        {node.path && (
          <div className="mb-1 flex items-center gap-1 group">
            <span className="ed-section-title flex-1 truncate" {...dragProps({ kind: 'folder', key: node.path })}>{node.path}</span>
            <span className="flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <button type="button" className="ed-iconbtn" title="New folder inside" aria-label={`New folder in ${node.path}`} onClick={() => folderActions.onCreate(node.path)}><FolderPlus /></button>
              <button type="button" className="ed-iconbtn" title="Rename or move folder" aria-label={`Rename folder ${node.path}`} onClick={() => folderActions.onRename(node.path)}><Pencil /></button>
              <button type="button" className="ed-iconbtn" data-tone="danger" title="Delete folder" aria-label={`Delete folder ${node.path}`} onClick={() => folderActions.onDelete(node.path)}><Trash2 /></button>
            </span>
          </div>
        )}
        {node.items.length === 0 && node.path ? <p className="ed-hint mb-1">Empty</p> : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-1.5">
            {node.items.map((i) => <Tile key={i.key} selected={selected === i.key} name={i.name} title={i.key} hint={hint?.(i)} thumb={thumb(i, 56)} badge={badge?.(i)} onClick={() => onSelect(i.key)} dragProps={dragProps({ kind: 'item', key: i.key })} />)}
          </div>
        )}
      </section>
    )] : []),
    ...node.folders.flatMap(renderTiles),
  ]

  return (
    <div
      className="relative flex min-h-[50vh] flex-col gap-1 rounded-md data-[drop=true]:ring-1 data-[drop=true]:ring-primary/60"
      data-drop={dropTarget === '' ? 'true' : undefined}
      {...dropProps('')}
    >
      {mode === 'tiles' ? <div className="flex flex-col gap-3">{renderTiles(tree)}</div> : renderList(tree, true)}
      {dragging && <p className="ed-hint pointer-events-none absolute inset-x-0 bottom-1 text-center">Drop on a folder, or on empty space for the top level</p>}
    </div>
  )
}

const countIn = (node: FolderNode): number => node.items.length + node.folders.reduce((n, f) => n + countIn(f), 0)
