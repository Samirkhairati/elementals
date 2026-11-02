import type { Layer } from '@/types/editor'
import { ENTITIES_ID, moveInStack, stackIds } from './layerOrder'

// Folders are layers of type `folder` that sit in the layer list; the tile and image layers they hold follow them directly
// (`folderId` points at the folder). Everything stays one flat, ordered list, so history, autosave and reordering need
// nothing new, and the canvas and the exporter simply skip the folder rows.

/** Only these layer kinds can be put in a folder. */
export const canHoldInFolder = (layer: Pick<Layer, 'type'>): boolean => layer.type === 'tile' || layer.type === 'image'

export const isFolder = (layer: Pick<Layer, 'type'>): boolean => layer.type === 'folder'

/** The layers of a folder, in list order. */
export const membersOf = (layers: Layer[], folderId: string): Layer[] => layers.filter((l) => l.folderId === folderId)

/** The layers the canvas and the exporter see: everything but the folder rows. */
export const withoutFolders = (layers: Layer[]): Layer[] => (layers.some(isFolder) ? layers.filter((l) => !isFolder(l)) : layers)

/**
 * The list with every held layer directly below its folder (in its old relative order), and `folderId`s that cannot hold
 * (no such folder, a layer kind that is not allowed) dropped. The Entities row (`entitiesIndex`) is never inside a folder:
 * if it was, it ends up just below it. Returns the same arrays when nothing needed fixing.
 */
export function normalizeFolders(layers: Layer[], entitiesIndex: number): { layers: Layer[]; entitiesIndex: number } {
  const folders = new Set(layers.filter(isFolder).map((l) => l.id))
  const cleaned = layers.map((l) => {
    if (l.folderId === undefined) return l
    if (folders.has(l.folderId) && canHoldInFolder(l)) return l
    const { folderId: _gone, ...rest } = l
    return rest as Layer
  })
  const stack: (Layer | typeof ENTITIES_ID)[] = cleaned.slice()
  stack.splice(Math.max(0, Math.min(cleaned.length, entitiesIndex)), 0, ENTITIES_ID)

  const out: (Layer | typeof ENTITIES_ID)[] = []
  for (const item of stack) {
    if (item === ENTITIES_ID) out.push(item)
    else if (item.folderId === undefined) {
      out.push(item)
      if (isFolder(item)) out.push(...cleaned.filter((l) => l.folderId === item.id))
    }
  }
  const nextLayers = out.filter((i): i is Layer => i !== ENTITIES_ID)
  const same = nextLayers.length === layers.length && nextLayers.every((l, i) => l === layers[i])
  return { layers: same ? layers : nextLayers, entitiesIndex: out.indexOf(ENTITIES_ID) }
}

/**
 * A drag in the list. One stack item moves to just above or below `targetId` (layers and the Entities row, like
 * `moveInStack`); then the folders are put right:
 * - dropped onto a folder row (below it) or onto a layer of a folder: it joins that folder (if it is a tile or image layer);
 * - dropped onto the top half of a folder row, or onto any other row: it is outside every folder;
 * - a folder carries the layers it holds.
 */
export function moveInList(
  layers: Layer[],
  entitiesIndex: number,
  movedId: string,
  targetId: string,
  position: 'top' | 'bottom'
): { layers: Layer[]; entitiesIndex: number } {
  const moved = layers.find((l) => l.id === movedId)
  const target = layers.find((l) => l.id === targetId)
  let base = layers
  if (moved && !isFolder(moved)) {
    let folderId: string | undefined
    if (target && isFolder(target)) folderId = position === 'bottom' && target.id !== movedId ? target.id : undefined
    else if (target) folderId = target.folderId
    if (folderId !== undefined && !canHoldInFolder(moved)) folderId = undefined
    if (moved.folderId !== folderId) {
      base = layers.map((l) => {
        if (l.id !== movedId) return l
        const { folderId: _old, ...rest } = l
        return (folderId === undefined ? rest : { ...rest, folderId }) as Layer
      })
    }
  }
  const stacked = moveInStack(base, entitiesIndex, movedId, targetId, position)
  // A folder dragged on its own leaves its layers behind: they follow it.
  return normalizeFolders(stacked.layers, stacked.entitiesIndex)
}

/** The list with `layerId` put in `folderId` (just below its first layer) or, with null, taken out (just below the folder). */
export function setLayerFolder(layers: Layer[], entitiesIndex: number, layerId: string, folderId: string | null): { layers: Layer[]; entitiesIndex: number } {
  const layer = layers.find((l) => l.id === layerId)
  if (!layer || isFolder(layer)) return { layers, entitiesIndex }
  if (folderId === null) return layer.folderId === undefined ? { layers, entitiesIndex } : takeOut(layers, entitiesIndex, layer)
  if (!canHoldInFolder(layer) || layer.folderId === folderId) return { layers, entitiesIndex }
  return moveInList(layers, entitiesIndex, layerId, folderId, 'bottom')
}

// Out of its folder and onto the row just below the folder's last layer.
function takeOut(layers: Layer[], entitiesIndex: number, layer: Layer): { layers: Layer[]; entitiesIndex: number } {
  const from = layers.findIndex((l) => l.id === layer.id)
  const { folderId: _old, ...rest } = layer
  const without = layers.filter((l) => l.id !== layer.id)
  const lastHeld = without.reduce((at, l, i) => (l.folderId === layer.folderId ? i : at), without.findIndex((l) => l.id === layer.folderId))
  const to = lastHeld + 1
  const next = without.slice()
  next.splice(to, 0, rest as Layer)
  // Rows between the old and the new place shift up by one, the Entities row among them.
  const k = Math.max(0, Math.min(layers.length, entitiesIndex))
  const shifted = to > from && k > from && k <= to ? k - 1 : k
  return normalizeFolders(next, to > from ? shifted : k)
}

/** Layer ids shown in the list: the layers (plus the Entities row) except those inside a closed folder. */
export function visibleStack(layers: Layer[], entitiesIndex: number | undefined): string[] {
  const closed = new Set(layers.filter((l) => isFolder(l) && l.collapsed).map((l) => l.id))
  const byId = new Map(layers.map((l) => [l.id, l]))
  return stackIds(layers, entitiesIndex).filter((id) => {
    const layer = byId.get(id)
    return !(layer && layer.folderId !== undefined && closed.has(layer.folderId))
  })
}

/** Eye or lock of a folder applies to the layers it holds too: their own flag is set to the folder's new value. */
export function setFolderFlag(layers: Layer[], folderId: string, flag: 'visible' | 'locked', value: boolean): Layer[] {
  return layers.map((l) => (l.id === folderId || l.folderId === folderId ? (l[flag] === value ? l : { ...l, [flag]: value }) : l))
}
