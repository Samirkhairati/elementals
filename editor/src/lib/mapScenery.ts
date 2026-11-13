// The one way a small preview of a map (the resize dialog, the warp destination picker) paints what the map looks like:
// the visible tile layers and the pictures of the visible image layers, bottom layer first, like the editor canvas.
// Previews used to carry their own copy of this and each missed a kind of layer (pictures, in two different dialogs),
// which showed up as a blank preview. Anything that draws a map preview calls this, and LAYER_SCENERY forces a decision
// for every layer type, so a new type cannot be forgotten silently.

import type { SpriteAssetInfo } from '../../../shared/engine/types'
import { TILE_SIZE } from '../../../shared/engine/constants'
import type { Layer, LayerType, MapData } from '@/types/editor'
import { resolveImageItem } from './imageItems'
import { sortedImages } from './layerOrder'
import { drawResolvedSprite } from './spriteImages'

/** What a layer type contributes to how the map looks: painted tiles, placed pictures, or nothing a preview should draw. */
export const LAYER_SCENERY: Record<LayerType, 'tiles' | 'images' | 'none'> = {
  tile: 'tiles',
  image: 'images',
  // gameplay data and editor-only structure: not scenery
  collision: 'none',
  terrain: 'none',
  encounters: 'none',
  objects: 'none',
  folder: 'none',
}

/** The part of a map the preview needs. */
export type SceneryMap = Pick<MapData, 'width'> & { layers: Pick<Layer, 'type' | 'visible' | 'data' | 'images'>[] }

export interface SceneryOptions {
  /** Loaded tileset images by tileset id (a missing or unfinished one is skipped; draw again when it arrives). */
  tileImages: { get(id: string): HTMLImageElement | undefined }
  /** Sprites and pictures by `imagePickKey`; without them (or while one loads) a picture is reported as unresolved. */
  assets?: Record<string, SpriteAssetInfo>
  /** Extra size added to each tile (in map pixels) so scaled tiles do not leave hairline seams. */
  bleed?: number
  /** Smooth pictures when they are drawn smaller than they are (default: crisp). */
  smooth?: boolean
}

export interface ItemPoint {
  x: number
  y: number
}

/** Tilesets the visible tile layers use, so a preview can load just those. */
export function usedTilesetIds(layers: Pick<Layer, 'data'>[]): Set<string> {
  const used = new Set<string>()
  for (const l of layers) for (const t of Object.values(l.data ?? {})) used.add(t.tilesetId)
  used.delete('__collision__')
  return used
}

/**
 * Paints the map's scenery onto `ctx`, whose transform must already map one map pixel to one unit (the caller
 * translates and scales). Returns the anchors of pictures that could not be drawn (no asset yet, or still loading),
 * so the caller can mark them.
 */
export function drawMapScenery(ctx: CanvasRenderingContext2D, map: SceneryMap, opts: SceneryOptions): ItemPoint[] {
  const unresolved: ItemPoint[] = []
  const bleed = opts.bleed ?? 0
  // The layer list is top first; paint from the bottom up.
  for (const layer of [...map.layers].reverse()) {
    if (!layer.visible) continue
    const kind = LAYER_SCENERY[layer.type]
    if (kind === 'images') {
      for (const it of sortedImages(layer.images)) {
        const resolved = opts.assets ? resolveImageItem(it, opts.assets) : null
        if (!resolved) {
          unresolved.push(it)
          continue
        }
        drawResolvedSprite(ctx, resolved, { anchorX: it.x, anchorY: it.y, opacity: it.opacity, mirrorX: it.flipX, mirrorY: it.flipY, smooth: opts.smooth })
      }
    } else if (kind === 'tiles') {
      for (const [key, tile] of Object.entries(layer.data ?? {})) {
        if (tile.tilesetId === '__collision__') continue
        const img = opts.tileImages.get(tile.tilesetId)
        if (!img || !img.complete || img.naturalWidth === 0) continue
        const idx = Number(key)
        ctx.drawImage(img, tile.x * TILE_SIZE, tile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE, (idx % map.width) * TILE_SIZE, Math.floor(idx / map.width) * TILE_SIZE, TILE_SIZE + bleed, TILE_SIZE + bleed)
      }
    }
  }
  return unresolved
}
