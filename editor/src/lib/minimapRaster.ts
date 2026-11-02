import type { EntityData, Layer } from '@/types/editor'
import { TILE_SIZE, anchorToTile } from '../../../shared/engine/constants'

/** Colour of one tile of a tileset as seen from far away (average of its pixels), or null for a fully transparent tile. */
export type TileColor = readonly [r: number, g: number, b: number, a: number] | null
export type TileColorLookup = (tilesetId: string, tileX: number, tileY: number) => TileColor

export const MINIMAP_GROUND: readonly [number, number, number] = [34, 34, 34]
export const MINIMAP_ENTITY: readonly [number, number, number] = [251, 191, 36]

/**
 * One RGBA pixel per map tile for the minimap: the visible tile layers bottom-up (the layer list is top first) blended
 * over the dark ground, then an amber dot for every entity. Pure, so it is tested without a canvas.
 */
export function rasterizeMap(
  map: { width: number; height: number; layers: Layer[] },
  entities: EntityData[],
  colorOf: TileColorLookup
): Uint8ClampedArray<ArrayBuffer> {
  const { width, height } = map
  const px = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    px[i * 4] = MINIMAP_GROUND[0]
    px[i * 4 + 1] = MINIMAP_GROUND[1]
    px[i * 4 + 2] = MINIMAP_GROUND[2]
    px[i * 4 + 3] = 255
  }

  for (const layer of [...map.layers].reverse()) {
    if (layer.type !== 'tile' || !layer.visible) continue
    for (const [key, tile] of Object.entries(layer.data ?? {})) {
      const idx = Number(key)
      if (!(idx >= 0 && idx < width * height)) continue
      const c = colorOf(tile.tilesetId, tile.x, tile.y)
      if (!c) continue
      const a = c[3] / 255
      const o = idx * 4
      px[o] = c[0] * a + px[o] * (1 - a)
      px[o + 1] = c[1] * a + px[o + 1] * (1 - a)
      px[o + 2] = c[2] * a + px[o + 2] * (1 - a)
    }
  }

  for (const e of entities) {
    const { col, row } = anchorToTile(e.x, e.y)
    if (col < 0 || row < 0 || col >= width || row >= height) continue
    const o = (row * width + col) * 4
    px[o] = MINIMAP_ENTITY[0]
    px[o + 1] = MINIMAP_ENTITY[1]
    px[o + 2] = MINIMAP_ENTITY[2]
  }
  return px
}

/** Average colour per tile of a loaded tileset image, memoised per image. Needs a 2D canvas; returns null when there is none. */
const averages = new WeakMap<HTMLImageElement, { cols: number; rgba: Uint8ClampedArray } | null>()

export function tileColorsOf(img: HTMLImageElement): { cols: number; rgba: Uint8ClampedArray } | null {
  if (averages.has(img)) return averages.get(img) ?? null
  let result: { cols: number; rgba: Uint8ClampedArray } | null = null
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (img.complete && w >= TILE_SIZE && h >= TILE_SIZE) {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        ctx.drawImage(img, 0, 0)
        const data = ctx.getImageData(0, 0, w, h).data
        const cols = Math.floor(w / TILE_SIZE)
        const rows = Math.floor(h / TILE_SIZE)
        const rgba = new Uint8ClampedArray(cols * rows * 4)
        for (let ty = 0; ty < rows; ty++) {
          for (let tx = 0; tx < cols; tx++) {
            let r = 0, g = 0, b = 0, a = 0
            for (let y = 0; y < TILE_SIZE; y++) {
              for (let x = 0; x < TILE_SIZE; x++) {
                const o = ((ty * TILE_SIZE + y) * w + tx * TILE_SIZE + x) * 4
                const alpha = data[o + 3]
                r += data[o] * alpha
                g += data[o + 1] * alpha
                b += data[o + 2] * alpha
                a += alpha
              }
            }
            const o = (ty * cols + tx) * 4
            if (a > 0) {
              rgba[o] = r / a
              rgba[o + 1] = g / a
              rgba[o + 2] = b / a
              rgba[o + 3] = a / (TILE_SIZE * TILE_SIZE)
            }
          }
        }
        result = { cols, rgba }
      }
    } catch {
      result = null
    }
  }
  averages.set(img, result)
  return result
}

/** A lookup over the editor's loaded tileset images (unloaded or unreadable ones draw nothing). */
export function colorLookup(images: Record<string, HTMLImageElement>): TileColorLookup {
  return (tilesetId, x, y) => {
    const img = images[tilesetId]
    if (!img) return null
    const t = tileColorsOf(img)
    if (!t || x >= t.cols) return null
    const o = (y * t.cols + x) * 4
    if (o + 3 >= t.rgba.length || t.rgba[o + 3] === 0) return null
    return [t.rgba[o], t.rgba[o + 1], t.rgba[o + 2], t.rgba[o + 3]]
  }
}
