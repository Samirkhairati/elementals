// The folder browser of an asset library (graphics, tilesets): a tree or tiles, folders you can open, close,
// create in, rename and delete, and drag-and-drop to rearrange. It only reports what the user did; the table
// decides what that means (and rewrites references).

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderPlus, Pencil, Trash2 } from 'lucide-react'
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
  const [dragging, setDragging] = useState<DragPayload | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const toggle = (path: string) => setClosed((s) => { const n = new Set(s); if (n.has(path)) n.delete(path); else n.add(path); return n })
  const isOpen = (path: string) => searching || !closed.has(path)

  if (items.length === 0 && folders.length === 0) return <p className="ed-hint p-3">{emptyText}</p>
  if (searching && tree.items.length === 0 && tree.folders.length === 0) return <p className="ed-hint p-3">Nothing matches “{query}”.</p>

  const accepts = (target: string): boolean => {
    if (!dragging) return false
    if (dragging.kind === 'item') return true
    return canMoveFolder(dragging.key, target)
  }
  const dropProps = (target: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!accepts(target)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDropTarget(target)
    },
    onDragLeave: () => setDropTarget((t) => (t === target ? null : t)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      const drag = readDrag(e) ?? dragging
      setDropTarget(null)
      setDragging(null)
      if (drag && accepts(target)) onMove(drag, target)
    },
  })
  const dragProps = (drag: DragPayload) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(drag))
      e.dataTransfer.effectAllowed = 'move'
      setDragging(drag)
    },
    onDragEnd: () => {
      setDragging(null)
      setDropTarget(null)
    },
  })

  const folderRow = (node: FolderNode, depth: number) => {
    const open = isOpen(node.path)
    return (
      <div
        className="ed-row group"
        data-drop={dropTarget === node.path ? 'true' : undefined}
        style={{ paddingLeft: 8 + depth * 14 }}
        {...dropProps(node.path)}
        {...dragProps({ kind: 'folder', key: node.path })}
      >
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-ed-label" aria-expanded={open} onClick={() => toggle(node.path)}>
          {open ? <ChevronDown className="text-muted-foreground" /> : <ChevronRight className="text-muted-foreground" />}
          <Folder className="text-primary" />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
        </button>
        <span className="ed-row-actions opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button type="button" className="ed-iconbtn" title="New folder inside" aria-label={`New folder in ${node.path}`} onClick={() => folderActions.onCreate(node.path)}><FolderPlus /></button>
          <button type="button" className="ed-iconbtn" title="Rename or move folder" aria-label={`Rename folder ${node.path}`} onClick={() => folderActions.onRename(node.path)}><Pencil /></button>
          <button type="button" className="ed-iconbtn" data-tone="danger" title="Delete folder" aria-label={`Delete folder ${node.path}`} onClick={() => folderActions.onDelete(node.path)}><Trash2 /></button>
        </span>
      </div>
    )
  }

  const itemRow = (item: LibraryItem, depth: number) => (
    <button
      key={item.key}
      type="button"
      data-selected={selected === item.key ? 'true' : undefined}
      className="ed-row flex h-auto w-full items-center gap-2 py-0.5 text-left text-ed-label"
      style={{ paddingLeft: 8 + depth * 14 + 16 }}
      onClick={() => onSelect(item.key)}
      {...dragProps({ kind: 'item', key: item.key })}
    >
      {thumb(item, 24)}
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      {badge?.(item)}
    </button>
  )

  const renderList = (node: FolderNode, depth: number): React.ReactNode => (
    <>
      {node.folders.map((f) => (
        <li key={f.path} role="treeitem" aria-expanded={isOpen(f.path)} aria-label={f.path}>
          {folderRow(f, depth)}
          {isOpen(f.path) && <ul role="group">{renderList(f, depth + 1)}</ul>}
        </li>
      ))}
      {node.items.map((i) => <li key={i.key} role="treeitem" aria-selected={selected === i.key}>{itemRow(i, depth)}</li>)}
    </>
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
    <div className="flex flex-col gap-1">
      {dragging && (
        <div className="ed-row text-ed-label text-muted-foreground" data-drop={dropTarget === '' ? 'true' : undefined} {...dropProps('')}>
          Drop here for the top level
        </div>
      )}
      {mode === 'tiles' ? <div className="flex flex-col gap-3">{renderTiles(tree)}</div> : <ul role="tree" className="flex flex-col gap-0.5">{renderList(tree, 0)}</ul>}
    </div>
  )
}
