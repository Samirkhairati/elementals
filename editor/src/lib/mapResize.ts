import type { EntityData, Layer, MapData } from '@/types/editor'
import { TILE_SIZE } from '../../../shared/engine/constants'
import { mapPixelSize } from '../../../shared/mapSize'

/**
 * Pure model of "resize map", in pixels. A map is a size in pixels (any size: `pixelWidth` / `pixelHeight`, or whole
 * tiles when those are absent) over a grid of 32 px tiles that covers it. Each edge grows (positive) or crops
 * (negative) that side. The left and top edges move in whole tiles so painted tiles stay on the grid; the right and
 * bottom edges can stop on any pixel. Tile (x, y) of the old map becomes (x + left/32, y + top/32), and every pixel
 * position (entity anchors, image-layer items) moves by (left, top).
 *
 * Nothing placed is ever removed: pictures and entities that end up outside the map stay where they are (outside).
 * Only painted tiles that fall off the new tile grid are cropped.
 */

export interface ResizeEdges {
  /** Pixels; a multiple of the tile size. */
  left: number
  /** Pixels; a multiple of the tile size. */
  top: number
  /** Pixels. */
  right: number
  /** Pixels. */
  bottom: number
}

export type ResizableMap = Pick<MapData, 'width' | 'height' | 'layers' | 'pixelWidth' | 'pixelHeight'> & { entities?: EntityData[] }

export const NO_RESIZE: ResizeEdges = { left: 0, top: 0, right: 0, bottom: 0 }
/** At most this many tiles on each side. */
export const MAX_MAP_SIZE = 500

export { mapPixelSize }

export function isNoResize(e: ResizeEdges): boolean {
  return e.left === 0 && e.top === 0 && e.right === 0 && e.bottom === 0
}

/** The new size in pixels. */
export function resizedSize(map: Pick<MapData, 'width' | 'height' | 'pixelWidth' | 'pixelHeight'>, e: ResizeEdges): { width: number; height: number } {
  const px = mapPixelSize(map)
  return { width: px.width + e.left + e.right, height: px.height + e.top + e.bottom }
}

/** Tiles needed to cover a pixel size. */
export const tilesFor = (px: number): number => Math.max(1, Math.ceil(px / TILE_SIZE))

/** Why `edges` cannot be applied, or null when they can. */
export function resizeProblem(map: Pick<MapData, 'width' | 'height' | 'pixelWidth' | 'pixelHeight'>, e: ResizeEdges): string | null {
  for (const v of [e.left, e.top, e.right, e.bottom]) {
    if (!Number.isInteger(v)) return 'Sizes must be whole pixels.'
  }
  if (e.left % TILE_SIZE !== 0 || e.top % TILE_SIZE !== 0) return `The left and top edges move in whole tiles (${TILE_SIZE} px), so painted tiles stay on the grid.`
  const { width, height } = resizedSize(map, e)
  if (width < 1 || height < 1) return 'The map must keep at least 1 × 1 pixels.'
  if (tilesFor(width) > MAX_MAP_SIZE || tilesFor(height) > MAX_MAP_SIZE) return `A map can be at most ${MAX_MAP_SIZE * TILE_SIZE} × ${MAX_MAP_SIZE * TILE_SIZE} pixels (${MAX_MAP_SIZE} × ${MAX_MAP_SIZE} tiles).`
  return null
}

const inside = (x: number, y: number, w: number, h: number) => x >= 0 && y >= 0 && x < w && y < h

export interface ResizeLoss {
  /** Painted tiles that fall off the new tile grid, per layer (only layers that lose some). */
  layers: { layerId: string; name: string; type: Layer['type']; tiles: number }[]
  tiles: number
}

/** What cropping throws away: painted tiles only (pictures and entities are always kept). */
export function resizeLoss(map: ResizableMap, e: ResizeEdges): ResizeLoss {
  const size = resizedSize(map, e)
  const newW = tilesFor(size.width)
  const newH = tilesFor(size.height)
  const dc = e.left / TILE_SIZE
  const dr = e.top / TILE_SIZE
  const loss: ResizeLoss = { layers: [], tiles: 0 }
  for (const layer of map.layers) {
    let tiles = 0
    for (const key of Object.keys(layer.data ?? {})) {
      const idx = Number(key)
      if (!inside((idx % map.width) + dc, Math.floor(idx / map.width) + dr, newW, newH)) tiles++
    }
    if (tiles) {
      loss.layers.push({ layerId: layer.id, name: layer.name, type: layer.type, tiles })
      loss.tiles += tiles
    }
  }
  return loss
}

export function hasLoss(loss: ResizeLoss): boolean {
  return loss.tiles > 0
}

/** One flag per old tile cell (`y * width + x`): is a tile painted there (on any layer)? */
export function occupiedCells(map: ResizableMap): Uint8Array {
  const cells = new Uint8Array(map.width * map.height)
  for (const layer of map.layers) {
    for (const key of Object.keys(layer.data ?? {})) {
      const idx = Number(key)
      if (idx >= 0 && idx < cells.length) cells[idx] = 1
    }
  }
  return cells
}

function shiftLayer(layer: Layer, map: ResizableMap, e: ResizeEdges, newW: number, newH: number): Layer {
  const next: Layer = { ...layer }
  const dc = e.left / TILE_SIZE
  const dr = e.top / TILE_SIZE
  if (layer.data) {
    const data: NonNullable<Layer['data']> = {}
    for (const [key, tile] of Object.entries(layer.data)) {
      const idx = Number(key)
      const x = (idx % map.width) + dc
      const y = Math.floor(idx / map.width) + dr
      if (inside(x, y, newW, newH)) data[y * newW + x] = tile
    }
    next.data = data
  }
  if (layer.images) next.images = layer.images.map((item) => ({ ...item, x: item.x + e.left, y: item.y + e.top }))
  return next
}

function shiftEntity(ent: EntityData, e: ResizeEdges): EntityData {
  const next: EntityData = { ...ent, x: ent.x + e.left, y: ent.y + e.top }
  const transform = ent.components?.Transform
  if (transform && typeof transform.x === 'number' && typeof transform.y === 'number') {
    next.components = { ...ent.components, Transform: { ...transform, x: transform.x + e.left, y: transform.y + e.top } }
  }
  return next
}

/** The map after the resize. Returns `map` itself when nothing changes. */
export function applyResize<T extends ResizableMap>(map: T, e: ResizeEdges): T {
  const problem = resizeProblem(map, e)
  if (problem) throw new Error(problem)
  if (isNoResize(e)) return map

  const size = resizedSize(map, e)
  const width = tilesFor(size.width)
  const height = tilesFor(size.height)
  const layers = map.layers.map((l) => shiftLayer(l, map, e, width, height))
  const { pixelWidth: _w, pixelHeight: _h, ...rest } = map
  const wholeTiles = size.width === width * TILE_SIZE && size.height === height * TILE_SIZE
  const result = { ...rest, width, height, layers, ...(wholeTiles ? {} : { pixelWidth: size.width, pixelHeight: size.height }) } as T
  if (map.entities) result.entities = map.entities.map((ent) => shiftEntity(ent, e))
  return result
}

/** "214 painted tiles" for the warning box. */
export function describeLoss(loss: ResizeLoss): string {
  return `${loss.tiles} painted ${loss.tiles === 1 ? 'tile' : 'tiles'}`
}

/** Edges given in tiles, as pixels. */
export const tileEdges = (e: ResizeEdges): ResizeEdges => ({ left: e.left * TILE_SIZE, top: e.top * TILE_SIZE, right: e.right * TILE_SIZE, bottom: e.bottom * TILE_SIZE })
