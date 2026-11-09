// Picking several pictures of an image layer (list rows or canvas), and copying them: the pure parts.

import type { ImageItem } from '@/types/editor'
import { nextImageName } from './imageItems'
import { imagePickName } from './graphicAssets'

export type SelectMode = 'replace' | 'toggle' | 'range'

export interface ImageSelection {
  /** Everything picked, in the order of `rowIds`. The `primary` one is among them. */
  ids: string[]
  /** The one the properties card shows and arrow keys move (the last one clicked). */
  primary: string | null
}

/**
 * Click on `clickedId`: a plain click picks only it, Ctrl/Cmd toggles it, Shift picks everything between the last
 * click (`primary`) and it. `rowIds` is the list in display order.
 */
export function selectImages(current: ImageSelection, rowIds: readonly string[], clickedId: string, mode: SelectMode): ImageSelection {
  if (!rowIds.includes(clickedId)) return current
  if (mode === 'replace') return { ids: [clickedId], primary: clickedId }
  if (mode === 'toggle') {
    const set = new Set(current.ids)
    if (set.has(clickedId)) set.delete(clickedId)
    else set.add(clickedId)
    const ids = rowIds.filter(id => set.has(id))
    const primary = set.has(clickedId) ? clickedId : ids.includes(current.primary ?? '') ? current.primary : ids[ids.length - 1] ?? null
    return { ids, primary }
  }
  const anchor = current.primary && rowIds.includes(current.primary) ? rowIds.indexOf(current.primary) : rowIds.indexOf(clickedId)
  const [from, to] = [Math.min(anchor, rowIds.indexOf(clickedId)), Math.max(anchor, rowIds.indexOf(clickedId))]
  return { ids: rowIds.slice(from, to + 1), primary: current.primary ?? clickedId }
}

/** The ids still present in `rowIds`, with a primary that is still picked (stale ids are dropped). */
export function pruneSelection(current: ImageSelection, rowIds: readonly string[]): ImageSelection {
  const present = new Set(rowIds)
  const ids = current.ids.filter(id => present.has(id))
  const primary = current.primary && ids.includes(current.primary) ? current.primary : ids[ids.length - 1] ?? null
  return ids.length === current.ids.length && primary === current.primary ? current : { ids, primary }
}

const nameOf = (img: ImageItem) => img.name || imagePickName(img)

/**
 * Copies of `items` for pasting into a layer holding `existing`: new ids, names free in that layer ("Tree 2"), and
 * moved so the first item lands on `at` (the cursor), or one tile down-right of the original when there is no cursor.
 */
export function pasteImageItems(items: readonly ImageItem[], existing: readonly ImageItem[], at: { x: number; y: number } | null, tile = 32): ImageItem[] {
  if (items.length === 0) return []
  const dx = at ? at.x - items[0].x : tile
  const dy = at ? at.y - items[0].y : tile
  const taken = existing.map(nameOf)
  return items.map(item => {
    const name = nextImageName(nameOf(item), taken)
    taken.push(name)
    return { ...item, id: crypto.randomUUID(), name, x: item.x + dx, y: item.y + dy, ...(item.crop ? { crop: { ...item.crop } } : {}) }
  })
}
