// The folder browser of an asset library (graphics, tilesets): a tree or tiles, folders you can open, close,
// create in, rename and delete, and drag-and-drop to rearrange. It only reports what the user did; the table
// decides what that means (and rewrites references).

import { useMemo, useRef, useState } from 'react'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { ChevronDown, ChevronRight, FolderPlus, Pencil, Trash2, X } from 'lucide-react'
import { canMoveFolder } from '@/lib/assetOps'
import { isFileDrag, readDrop } from '@/lib/droppedFiles'
import { buildLibraryTree, type FolderNode, type LibraryItem } from '@/lib/libraryTree'
import { EMPTY_SELECTION, describeSelection, existingOnly, hasRow, rowRange, selectionOf, selectionSize, toggleRow, visibleRows, type LibrarySelection, type RowRef } from '@/lib/librarySelection'
import { Tile } from './browse'
import type { ViewMode } from './browse'
import type { LibraryControls } from './shared'

/** What is being dragged: one item, one folder, or everything picked (`many`). */
export type DragPayload = { kind: 'item'; key: string } | { kind: 'folder'; key: string } | { kind: 'many'; items: string[]; folders: string[] }

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
  /** Delete on the selected item, and Delete… in an item's right-click menu: the table opens its confirm dialog. */
  onDeleteItem?: (key: string) => void
  /** Several things picked (Ctrl/Cmd+click, Shift+click) and dragged onto a folder or deleted: the table does the work. */
  onDeleteMany?: (selection: LibrarySelection) => void
  /** "picture" / "tileset", for the selection bar. */
  noun?: string
  /** What to say when there is nothing at all. */
  emptyText: string
  /** Importing: the highlighted folder, and files dragged in from outside. */
  library?: LibraryControls
}

const readDrag = (e: React.DragEvent): DragPayload | null => {
  try {
    return JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as DragPayload
  } catch {
    return null
  }
}

export function LibraryBrowser({ items, folders, query, mode, selected, onSelect, thumb, badge, hint, onMove, folderActions, onDeleteItem, onDeleteMany, noun = 'item', emptyText, library }: Props) {
  const tree = useMemo(() => buildLibraryTree(items, folders, query), [items, folders, query])
  const searching = query.trim() !== ''
  const [closed, setClosed] = useState<Set<string>>(new Set())
  // What is being dragged lives in a ref too: dragover must know it at once, and the browser forbids reading
  // dataTransfer there. The state only drives the highlight, and is set after the drag has started (changing the DOM
  // inside dragstart makes Chromium cancel the drag).
  const dragRef = useRef<DragPayload | null>(null)
  // The action picked in a right-click menu; it runs once the menu has closed.
  const chosen = useRef<(() => void) | null>(null)
  const [picked, setPicked] = useState<LibrarySelection>(EMPTY_SELECTION)
  const anchor = useRef<RowRef | null>(null)
  const [dragging, setDragging] = useState<DragPayload | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const toggle = (path: string) => setClosed((s) => { const n = new Set(s); if (n.has(path)) n.delete(path); else n.add(path); return n })
  const isOpen = (path: string) => searching || !closed.has(path)

  // What is picked, minus whatever has gone since (deleted, moved, filtered away by a rename).
  const known = useMemo(() => {
    const folderSet = new Set<string>()
    for (const path of [...folders, ...items.map((i) => i.folder)]) {
      const parts = path.split('/').filter(Boolean)
      parts.forEach((_, i) => folderSet.add(parts.slice(0, i + 1).join('/')))
    }
    return { items: new Set(items.map((i) => i.key)), folders: folderSet }
  }, [items, folders])
  const multi = useMemo(() => existingOnly(picked, known.items, known.folders), [picked, known])
  const many = selectionSize(multi) > 1
  const isPicked = (row: RowRef) => hasRow(multi, row)
  const clearPicked = () => { setPicked(EMPTY_SELECTION); anchor.current = null }

  // Plain click: one thing, as before. Ctrl/Cmd+click adds or removes it; Shift+click takes everything from the last click to this one.
  // Returns whether the click was a selection gesture (so a folder does not also open or close).
  const pick = (row: RowRef, e: React.MouseEvent): boolean => {
    if (e.shiftKey) {
      const from = anchor.current ?? (selected ? ({ kind: 'item', key: selected } as RowRef) : null)
      setPicked(selectionOf(rowRange(visibleRows(tree, isOpen), from, row)))
      return true
    }
    if (e.ctrlKey || e.metaKey) {
      // From the latest state, not this render's: two quick clicks must both count.
      setPicked((cur) => {
        const live = existingOnly(cur, known.items, known.folders)
        const base = selectionSize(live) === 0 && selected && row.key !== selected ? toggleRow(EMPTY_SELECTION, { kind: 'item', key: selected }) : live
        return toggleRow(base, row)
      })
      anchor.current = row
      return true
    }
    if (selectionSize(multi) > 0) setPicked(EMPTY_SELECTION)
    anchor.current = row
    return false
  }

  const accepts = (target: string): boolean => {
    const d = dragRef.current
    if (!d) return false
    if (d.kind === 'item') return true
    if (d.kind === 'many') return d.folders.every((f) => target !== f && !target.startsWith(`${f}/`))
    return canMoveFolder(d.key, target)
  }
  // Handlers stop at the innermost folder, so dropping into a nested folder does not also count for its parents.
  // Files from outside (Finder / Explorer) are imported into the folder they land on; on empty space that is the
  // folder last clicked.
  const dropProps = (target: string) => ({
    onDragOver: (e: React.DragEvent) => {
      const files = !!library && isFileDrag(e.dataTransfer)
      if (!files && !accepts(target)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = files ? 'copy' : 'move'
      setDropTarget(target)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDropTarget(null)
      if (library && isFileDrag(e.dataTransfer)) {
        // The entries of a dropped folder can only be read right now; the walk itself continues after the event.
        library.dropFiles(readDrop(e.dataTransfer), target === '' ? library.folder : target)
        return
      }
      const drag = dragRef.current ?? readDrag(e)
      const ok = !!drag && accepts(target)
      dragRef.current = null
      setDragging(null)
      if (drag && ok) {
        if (drag.kind === 'many') clearPicked()
        onMove(drag, target)
      }
    },
  })
  const dragProps = (single: DragPayload) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      // Dragging one of several picked rows takes all of them.
      const drag: DragPayload = many && single.kind !== 'many' && isPicked(single) ? { kind: 'many', items: multi.items, folders: multi.folders } : single
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
  const isDragged = (kind: 'item' | 'folder', key: string) => !!dragging && (dragging.kind === 'many' ? (kind === 'item' ? dragging.items : dragging.folders).includes(key) : dragging.kind === kind && dragging.key === key)

  const folderRow = (node: FolderNode) => {
    const open = isOpen(node.path)
    return (
      <div className="ed-row group" data-selected={isPicked({ kind: 'folder', key: node.path }) ? 'true' : undefined} data-dim={isDragged('folder', node.path) ? 'true' : undefined} data-current={library?.folder === node.path ? 'true' : undefined} {...dragProps({ kind: 'folder', key: node.path })}>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-ed-label font-medium text-foreground" aria-expanded={open} aria-current={library?.folder === node.path ? 'true' : undefined} onClick={(e) => { if (pick({ kind: 'folder', key: node.path }, e)) return; library?.setFolder(node.path); toggle(node.path) }}>
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

  // Right-click: pick the item (unless it is one of the picked ones), then offer Delete… (the same confirm as the Delete button).
  const withItemMenu = (item: LibraryItem, child: React.ReactElement) => {
    if (!onDeleteItem) return child
    const row: RowRef = { kind: 'item', key: item.key }
    const all = many && isPicked(row) && !!onDeleteMany
    return (
      <ContextMenu key={item.key}>
        <ContextMenuTrigger asChild onContextMenu={() => { if (!(many && isPicked(row))) { clearPicked(); onSelect(item.key) } }}>{child}</ContextMenuTrigger>
        {/* Delete… opens its dialog once the menu has closed: opened earlier, the menu's focus trap pulls focus back from the dialog. */}
        <ContextMenuContent className="w-52" onCloseAutoFocus={(e) => { const run = chosen.current; if (run) { e.preventDefault(); chosen.current = null; run() } }}>
          <ContextMenuItem className="text-red-400 focus:text-red-400 focus:bg-red-500/10" onClick={() => { chosen.current = all ? () => onDeleteMany?.(multi) : () => onDeleteItem(item.key) }}>
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            {all ? `Delete ${describeSelection(multi, noun)}…` : 'Delete…'}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  const itemRow = (item: LibraryItem) => withItemMenu(item, (
    <button
      key={item.key}
      type="button"
      data-selected={selected === item.key || isPicked({ kind: 'item', key: item.key }) ? 'true' : undefined}
      data-dim={isDragged('item', item.key) ? 'true' : undefined}
      className="ed-row flex h-auto w-full items-center gap-2 py-1 text-left text-ed-label"
      onClick={(e) => { if (!pick({ kind: 'item', key: item.key }, e)) onSelect(item.key) }}
      {...dragProps({ kind: 'item', key: item.key })}
    >
      {thumb(item, 26)}
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      {badge?.(item)}
    </button>
  ))

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
            <button
              type="button"
              className="ed-section-title min-w-0 flex-1 truncate rounded-sm px-1 text-left data-[current=true]:bg-primary/20 data-[current=true]:text-foreground data-[selected=true]:ring-1 data-[selected=true]:ring-primary"
              data-current={library?.folder === node.path ? 'true' : undefined}
              data-selected={isPicked({ kind: 'folder', key: node.path }) ? 'true' : undefined}
              aria-current={library?.folder === node.path ? 'true' : undefined}
              title="Imports and dropped files go into this folder"
              onClick={(e) => { if (!pick({ kind: 'folder', key: node.path }, e)) library?.setFolder(node.path) }}
              {...dragProps({ kind: 'folder', key: node.path })}
            >{node.path}</button>
            <span className="flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <button type="button" className="ed-iconbtn" title="New folder inside" aria-label={`New folder in ${node.path}`} onClick={() => folderActions.onCreate(node.path)}><FolderPlus /></button>
              <button type="button" className="ed-iconbtn" title="Rename or move folder" aria-label={`Rename folder ${node.path}`} onClick={() => folderActions.onRename(node.path)}><Pencil /></button>
              <button type="button" className="ed-iconbtn" data-tone="danger" title="Delete folder" aria-label={`Delete folder ${node.path}`} onClick={() => folderActions.onDelete(node.path)}><Trash2 /></button>
            </span>
          </div>
        )}
        {node.items.length === 0 && node.path ? <p className="ed-hint mb-1">Empty</p> : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-1.5">
            {node.items.map((i) => withItemMenu(i, <Tile key={i.key} selected={selected === i.key || isPicked({ kind: 'item', key: i.key })} name={i.name} title={i.key} hint={hint?.(i)} thumb={thumb(i, 56)} badge={badge?.(i)} onClick={(e) => { if (!pick({ kind: 'item', key: i.key }, e)) onSelect(i.key) }} dragProps={dragProps({ kind: 'item', key: i.key })} />))}
          </div>
        )}
      </section>
    )] : []),
    ...node.folders.flatMap(renderTiles),
  ]

  const nothing = items.length === 0 && folders.length === 0
  const nothingFound = searching && tree.items.length === 0 && tree.folders.length === 0
  return (
    <div
      className="relative flex min-h-[50vh] flex-col gap-1 rounded-md data-[drop=true]:ring-1 data-[drop=true]:ring-primary/60"
      data-drop={dropTarget === '' ? 'true' : undefined}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null) }}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) return
        if (e.key === 'Escape' && selectionSize(multi) > 0) { e.preventDefault(); clearPicked(); return }
        if ((e.key === 'a' || e.key === 'A') && (e.ctrlKey || e.metaKey) && onDeleteMany) {
          e.preventDefault()
          setPicked(selectionOf(visibleRows(tree, isOpen)))
          return
        }
        // Delete on the selected picture asks first, exactly like the Delete button. Typing in a field is left alone.
        if (e.key !== 'Delete' && e.key !== 'Backspace') return
        if (many && onDeleteMany) { e.preventDefault(); onDeleteMany(multi); return }
        if (!onDeleteItem) return
        if (!selected || !items.some((i) => i.key === selected)) return
        e.preventDefault()
        onDeleteItem(selected)
      }}
      {...dropProps('')}
    >
      {many && (
        <div role="status" className="sticky top-0 z-10 flex items-center gap-2 rounded-md border border-primary/60 bg-card px-2 py-1 text-ed-label" data-testid="library-selection">
          <span className="min-w-0 flex-1 truncate">{describeSelection(multi, noun)} selected</span>
          {onDeleteMany && <button type="button" className="ed-iconbtn" data-tone="danger" title="Delete everything picked" aria-label="Delete selected" onClick={() => onDeleteMany(multi)}><Trash2 /></button>}
          <button type="button" className="ed-iconbtn" title="Clear the selection (Esc)" aria-label="Clear selection" onClick={clearPicked}><X /></button>
        </div>
      )}
      {nothing ? <p className="ed-hint p-3">{emptyText}</p> : nothingFound ? <p className="ed-hint p-3">Nothing matches “{query}”.</p> : mode === 'tiles' ? <div className="flex flex-col gap-3">{renderTiles(tree)}</div> : renderList(tree, true)}
      {dragging && <p className="ed-hint pointer-events-none absolute inset-x-0 bottom-1 text-center">Drop on a folder, or on empty space for the top level</p>}
      {dropTarget !== null && !dragging && library && <p className="ed-hint pointer-events-none absolute inset-x-0 bottom-1 text-center">Drop to import into {dropTarget || library.folder || 'the top level'}</p>}
    </div>
  )
}

const countIn = (node: FolderNode): number => node.items.length + node.folders.reduce((n, f) => n + countIn(f), 0)
