// Editing one image layer inside the layer list without touching the others: every picture operation (add, move,
// group, delete...) is "find the image layer, compute its new pictures and groups, put it back". Returning the same
// array when nothing changed lets the caller skip the history step.

import type { ImageGroup, ImageItem, Layer } from '@/types/editor'

export interface ImageLayerState {
  images: ImageItem[]
  groups: ImageGroup[]
}

/**
 * `layers` with the image layer `layerId` replaced by what `edit` returns. The same array back when there is no such
 * layer, when it is locked and `skipLocked` is set, or when `edit` returns null or the layer itself.
 */
export function editImageLayer(layers: Layer[], layerId: string, edit: (layer: Layer, images: ImageItem[]) => Layer | null, opts: { skipLocked?: boolean } = {}): Layer[] {
  const index = layers.findIndex((l) => l.id === layerId && l.type === 'image')
  if (index === -1 || (opts.skipLocked && layers[index].locked)) return layers
  const layer = layers[index]
  const edited = edit(layer, layer.images || [])
  if (!edited || edited === layer) return layers
  const next = [...layers]
  next[index] = edited
  return next
}

/** The layer with these pictures and groups; `groups` is left out when there are none, so untouched layers stay as they were. */
export function withImagesAndGroups(layer: Layer, images: ImageItem[], groups: readonly ImageGroup[]): Layer {
  const { groups: _old, ...rest } = layer
  return { ...rest, images, ...(groups.length > 0 ? { groups: [...groups] } : {}) }
}

/** The image layer's pictures and groups (both lists, never undefined). */
export function imageLayerState(layer: Layer): ImageLayerState {
  return { images: layer.images ?? [], groups: layer.groups ?? [] }
}
