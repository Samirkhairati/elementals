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

/** What copying (or duplicating) `ids` takes, in list order: the tile and image layers picked, and each folder picked with every layer it holds. */
export function layersToCopy(layers: Layer[], ids: readonly string[]): Layer[] {
  const picked = new Set(ids)
  return layers.filter((l) => (picked.has(l.id) && (canHoldInFolder(l) || isFolder(l))) || (l.folderId !== undefined && picked.has(l.folderId) && canHoldInFolder(l)))
}

/**
 * Copies of `source` (new ids, "Name Copy", tiles and pictures cloned) put in the list next to `afterId`, at its depth:
 * - only layers, `afterId` a layer: right below it, in its folder (or at the top level when it has none);
 * - only layers, `afterId` a folder: inside that folder, at its top;
 * - folders among them (folders do not nest): below the whole folder of `afterId` (or below `afterId`), at the top level.
 * A copied folder keeps its copied layers. Without `afterId` the copies go to the bottom of the list.
 * Returns the new list, where the copies start and how many there are, and the id of the last copy.
 */
export function placeLayerCopies(
  layers: Layer[],
  source: readonly Layer[],
  afterId: string | null,
  newId: () => string
): { layers: Layer[]; at: number; count: number; lastId: string | null } {
  if (source.length === 0) return { layers, at: -1, count: 0, lastId: null }
  const target = afterId ? layers.find((l) => l.id === afterId) : undefined
  const withFolders = source.some(isFolder)
  // the folder the copies go into (undefined = top level), and the row they go below
  let folderId: string | undefined
  let below = target ? layers.indexOf(target) : layers.length - 1
  if (target && !withFolders) folderId = isFolder(target) ? target.id : target.folderId
  else if (target) {
    const block = isFolder(target) ? target.id : target.folderId
    if (block !== undefined) below = layers.reduce((at, l, i) => (l.id === block || l.folderId === block ? i : at), below)
  }

  const ids = new Map(source.map((l) => [l.id, newId()]))
  const taken = new Set(layers.map((l) => l.name))
  const copies = source.map((layer) => {
    let name = `${layer.name} Copy`
    for (let n = 2; taken.has(name); n++) name = `${layer.name} Copy ${n}`
    taken.add(name)
    const { folderId: own, ...rest } = layer
    const inFolder = own !== undefined && ids.has(own) && !isFolder(layer) ? (ids.get(own) as string) : canHoldInFolder(layer) && !withFolders ? folderId : undefined
    return {
      ...rest,
      id: ids.get(layer.id) as string,
      name,
      ...(inFolder !== undefined ? { folderId: inFolder } : {}),
      data: layer.data ? JSON.parse(JSON.stringify(layer.data)) : undefined,
      images: layer.images?.map((img) => ({ ...img, id: newId() })),
    } as Layer
  })
  const at = below + 1
  const next = layers.slice()
  next.splice(at, 0, ...copies)
  return { layers: next, at, count: copies.length, lastId: copies[copies.length - 1].id }
}
