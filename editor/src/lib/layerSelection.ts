import type { CopiedTile, Layer, SelectionLayerPart, TileSelection } from '@/types/editor'

/** Layers that hold tile cells and so can be sampled into / painted from a selection (image layers cannot). */
export const isSampleableLayer = (layer: Pick<Layer, 'type'>) => layer.type !== 'image' && layer.type !== 'objects'

/**
 * The layers a pinned right-drag samples: the active layer plus every multi-selected one, in list order
 * (topmost first), without image layers.
 */
export function sampledLayers(layers: Layer[], activeLayerId: string | null, selectedLayerIds: readonly string[]): Layer[] {
  const wanted = new Set(selectedLayerIds)
  if (activeLayerId) wanted.add(activeLayerId)
  return layers.filter((layer) => wanted.has(layer.id) && isSampleableLayer(layer))
}

const COLLISION = '__collision__'

/**
 * Builds a selection from the rectangle (`minX`, `minY`, `width`, `height`) of the given layers.
 * With one layer this is the plain single-layer selection; with several it also carries one part per layer
 * and a composite `tiles` (the topmost real tile of each cell, collision markers only where nothing else is).
 */
export function sampleSelection(
  layers: Layer[],
  mapWidth: number,
  box: { minX: number; minY: number; width: number; height: number }
): TileSelection {
  const parts: SelectionLayerPart[] = layers.map((layer) => {
    const tiles: (CopiedTile | null)[] = []
    for (let dy = 0; dy < box.height; dy++) {
      for (let dx = 0; dx < box.width; dx++) {
        const existing = layer.data?.[(box.minY + dy) * mapWidth + box.minX + dx]
        tiles.push(existing ? { tilesetId: existing.tilesetId, x: existing.x, y: existing.y } : null)
      }
    }
    return { layerId: layer.id, layerType: layer.type, name: layer.name, tiles }
  })

  if (parts.length <= 1) {
    return { width: box.width, height: box.height, tiles: parts[0]?.tiles ?? new Array(box.width * box.height).fill(null) }
  }
  return { width: box.width, height: box.height, tiles: compositeTiles(parts, box.width * box.height), layers: parts }
}

/** Topmost-first parts flattened to one cell list. */
export function compositeTiles(parts: SelectionLayerPart[], cellCount: number): (CopiedTile | null)[] {
  const out: (CopiedTile | null)[] = []
  for (let i = 0; i < cellCount; i++) {
    let pick: CopiedTile | null = null
    for (const part of parts) {
      const tile = part.tiles[i]
      if (!tile) continue
      if (tile.tilesetId !== COLLISION) {
        pick = tile
        break
      }
      pick ??= tile
    }
    out.push(pick)
  }
  return out
}

/** The layer a part writes back to: the layer it was sampled from, else the first layer of the same type. */
export function targetLayerIndex(layers: Layer[], part: SelectionLayerPart): number {
  const byId = layers.findIndex((l) => l.id === part.layerId)
  if (byId !== -1) return byId
  return layers.findIndex((l) => l.type === part.layerType)
}

/** One single-layer selection per part, for running the ordinary paint operations on each layer. */
export function partSelection(selection: TileSelection, part: SelectionLayerPart): TileSelection {
  return { width: selection.width, height: selection.height, tiles: part.tiles }
}

const COLLISION_MARKER: CopiedTile = { tilesetId: COLLISION, x: 0, y: 0 }

/**
 * The selection as a layer of that type can take it: a collision layer only holds the collision marker
 * (a selection of tileset tiles paints the marker; an all-empty sampled area is kept and so erases), every other layer never receives it. Returns the same
 * object when nothing has to change, and null when a collision-only selection meets a non-collision layer.
 */
export function fitSelectionToLayer(layerType: Layer['type'], selection: TileSelection): TileSelection | null {
  const hasCollision = selection.tiles.some((t) => t?.tilesetId === COLLISION)
  if (layerType === 'collision') {
    if (!hasCollision) {
      // A sampled empty area stays as it is, so stamping it erases (as on a tile layer); only real tileset tiles become the marker.
      if (selection.tiles.every((t) => t === null)) return selection
      return { width: 1, height: 1, tiles: [COLLISION_MARKER] }
    }
    if (selection.tiles.every((t) => !t || t.tilesetId === COLLISION)) return selection
    return { ...selection, tiles: selection.tiles.map((t) => (t?.tilesetId === COLLISION ? t : null)) }
  }
  if (!hasCollision) return selection
  const tiles = selection.tiles.map((t) => (t?.tilesetId === COLLISION ? null : t))
  return tiles.every((t) => t === null) ? null : { ...selection, tiles }
}
