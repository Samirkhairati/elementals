// Picking several things at once in a library browser (graphics, tilesets): items and folders together. Pure, so the
// browser and the two tables share it; the browser only reports a selection and the tables decide what it means.

import type { FolderNode } from './libraryTree'

/** What is picked: item keys (graphic ids / tileset file names) and folder paths. */
export interface LibrarySelection {
  items: string[]
  folders: string[]
}

export const EMPTY_SELECTION: LibrarySelection = { items: [], folders: [] }

export const selectionSize = (s: LibrarySelection): number => s.items.length + s.folders.length

/** A row of the browser in the order it is drawn. */
export type RowRef = { kind: 'item'; key: string } | { kind: 'folder'; key: string }

const sameRow = (a: RowRef, b: RowRef) => a.kind === b.kind && a.key === b.key

/** The rows of the tree top to bottom (folders first, then items, depth first); closed folders hide what is inside. */
export function visibleRows(tree: FolderNode, isOpen: (folder: string) => boolean): RowRef[] {
  const out: RowRef[] = []
  const walk = (node: FolderNode) => {
    for (const f of node.folders) {
      out.push({ kind: 'folder', key: f.path })
      if (isOpen(f.path)) walk(f)
    }
    for (const i of node.items) out.push({ kind: 'item', key: i.key })
  }
  walk(tree)
  return out
}

/** Every row between `anchor` and `to` (both included), in either direction; just `to` when `anchor` is not shown. */
export function rowRange(rows: readonly RowRef[], anchor: RowRef | null, to: RowRef): RowRef[] {
  const a = anchor ? rows.findIndex((r) => sameRow(r, anchor)) : -1
  const b = rows.findIndex((r) => sameRow(r, to))
  if (b < 0) return []
  if (a < 0) return [to]
  return rows.slice(Math.min(a, b), Math.max(a, b) + 1)
}

export const selectionOf = (rows: readonly RowRef[]): LibrarySelection => ({
  items: rows.filter((r) => r.kind === 'item').map((r) => r.key),
  folders: rows.filter((r) => r.kind === 'folder').map((r) => r.key),
})

/** Adds or removes one row. */
export function toggleRow(sel: LibrarySelection, row: RowRef): LibrarySelection {
  const list = row.kind === 'item' ? sel.items : sel.folders
  const next = list.includes(row.key) ? list.filter((k) => k !== row.key) : [...list, row.key]
  return row.kind === 'item' ? { items: next, folders: sel.folders } : { items: sel.items, folders: next }
}

export const hasRow = (sel: LibrarySelection, row: RowRef): boolean => (row.kind === 'item' ? sel.items : sel.folders).includes(row.key)

const within = (path: string, folder: string): boolean => path === folder || path.startsWith(`${folder}/`)

/**
 * What an action should work on: a folder inside another picked folder and an item inside a picked folder go along with
 * that folder anyway, so they are dropped (moving or deleting them twice would fail the second time).
 */
export function topLevelOnly(sel: LibrarySelection, folderOfItem: (key: string) => string): LibrarySelection {
  const folders = sel.folders.filter((f) => !sel.folders.some((o) => o !== f && within(f, o)))
  const items = sel.items.filter((k) => !folders.some((f) => within(folderOfItem(k), f)))
  return { items, folders }
}

/** Selection with whatever no longer exists taken out (after a delete or a move). */
export function existingOnly(sel: LibrarySelection, itemKeys: ReadonlySet<string>, folders: ReadonlySet<string>): LibrarySelection {
  return { items: sel.items.filter((k) => itemKeys.has(k)), folders: sel.folders.filter((f) => folders.has(f)) }
}

/** "3 pictures and 2 folders" */
export function describeSelection(sel: LibrarySelection, noun: string): string {
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
  const parts = [sel.items.length ? n(sel.items.length, noun) : '', sel.folders.length ? n(sel.folders.length, 'folder') : ''].filter(Boolean)
  return parts.join(' and ') || 'nothing'
}
