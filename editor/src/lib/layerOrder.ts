import type { Layer } from '@/types/editor'

/** Id of the Entities row in the layer stack (it is not a layer, but it sits between them and can be dragged). */
export const ENTITIES_ID = '__entities__'

/**
 * Layers bottom to top, exactly as the layer list shows them: the list is top first, so the bottom of the list
 * draws first. `z` is not used here: it is a separate property that the game reads, not the editor's draw order.
 */
export function renderOrder(layers: Layer[]): Layer[] {
  return layers.slice().reverse()
}

/** Items of an image layer in draw order: item `z` first, array order for ties. */
export function sortedImages<T extends { z?: number }>(images: T[] | undefined): T[] {
  if (!images || images.length === 0) return []
  return images
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (a.item.z ?? 0) - (b.item.z ?? 0) || a.index - b.index)
    .map((entry) => entry.item)
}

/** `entitiesIndex` as a usable position: how many layers are above the Entities row (0 = on top), within the list. */
export function clampEntitiesIndex(index: number | undefined, layerCount: number): number {
  if (typeof index !== 'number' || !Number.isFinite(index)) return 0
  return Math.max(0, Math.min(layerCount, Math.floor(index)))
}

/** Ids of the stack as the list shows it, top first: the layers with the Entities row at `entitiesIndex`. */
export function stackIds(layers: Layer[], entitiesIndex: number | undefined): string[] {
  const ids = layers.map((l) => l.id)
  ids.splice(clampEntitiesIndex(entitiesIndex, layers.length), 0, ENTITIES_ID)
  return ids
}

/**
 * Moves one stack item (a layer or the Entities row) to just above or just below another one and returns the new
 * layer order and Entities position. Nothing else changes: not `z`, not any layer property.
 */
export function moveInStack(
  layers: Layer[],
  entitiesIndex: number | undefined,
  movedId: string,
  targetId: string,
  position: 'top' | 'bottom'
): { layers: Layer[]; entitiesIndex: number } {
  const stack = stackIds(layers, entitiesIndex)
  const from = stack.indexOf(movedId)
  const to = stack.indexOf(targetId)
  const current = { layers, entitiesIndex: clampEntitiesIndex(entitiesIndex, layers.length) }
  if (from === -1 || to === -1 || from === to) return current

  let insertAt = position === 'bottom' ? to + 1 : to
  if (from < insertAt) insertAt--
  if (from === insertAt) return current

  const next = stack.slice()
  next.splice(from, 1)
  next.splice(insertAt, 0, movedId)
  const byId = new Map(layers.map((l) => [l.id, l]))
  const nextLayers = next.filter((id) => id !== ENTITIES_ID).map((id) => byId.get(id)!)
  // Only the Entities row moved: hand back the same array so callers can tell the layers did not change.
  const sameOrder = nextLayers.every((layer, i) => layer === layers[i])
  return { layers: sameOrder ? layers : nextLayers, entitiesIndex: next.indexOf(ENTITIES_ID) }
}

/** Entities position after a layer was inserted at list index `at`: layers above the row keep it where it was. */
export function entitiesIndexAfterInsert(entitiesIndex: number | undefined, at: number, layerCountBefore: number): number {
  const k = clampEntitiesIndex(entitiesIndex, layerCountBefore)
  return at < k ? k + 1 : k
}

/** Entities position after the layer at list index `at` was removed. */
export function entitiesIndexAfterRemove(entitiesIndex: number | undefined, at: number, layerCountBefore: number): number {
  const k = clampEntitiesIndex(entitiesIndex, layerCountBefore)
  return at < k ? k - 1 : k
}

/**
 * `images` with `id` moved one step toward the front (+1, drawn later) or the back (-1) of the draw order. Neighbours
 * with different `z` trade their `z`; neighbours with the same `z` trade places in the array (that is what breaks the tie).
 */
export function moveInDrawOrder<T extends { id: string; z?: number }>(images: T[], id: string, direction: 1 | -1): T[] {
  const sorted = sortedImages(images)
  const from = sorted.findIndex((img) => img.id === id)
  const to = from + direction
  if (from === -1 || to < 0 || to >= sorted.length) return images
  const a = sorted[from]
  const b = sorted[to]
  if ((a.z ?? 0) !== (b.z ?? 0)) return images.map((img) => (img.id === a.id ? { ...img, z: b.z ?? 0 } : img.id === b.id ? { ...img, z: a.z ?? 0 } : img))
  const ia = images.indexOf(a)
  const ib = images.indexOf(b)
  const next = [...images]
  next[ia] = b
  next[ib] = a
  return next
}
