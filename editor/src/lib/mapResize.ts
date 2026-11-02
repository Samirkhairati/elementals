import type { EntityData, Layer, MapData } from '@/types/editor'
import { TILE_SIZE, anchorToTile } from '../../../shared/engine/constants'

/**
 * Pure model of "resize map". Each edge is a whole number of tiles: positive grows that side with empty
 * ground, negative crops it away. Tile (x, y) of the old map becomes (x + left, y + top) in the new one, and
 * every pixel position (entity anchors, image-layer items) moves with it.
 *
 * Kept free of React and of anything map-specific beyond width/height/layers/entities so future map
 * connections (which sit on the edges) can hook into one place.
 */

export interface ResizeEdges {
  left: number
  top: number
  right: number
  bottom: number
}

export type ResizableMap = Pick<MapData, 'width' | 'height' | 'layers'> & { entities?: EntityData[] }

export const NO_RESIZE: ResizeEdges = { left: 0, top: 0, right: 0, bottom: 0 }
export const MIN_MAP_SIZE = 1
export const MAX_MAP_SIZE = 500

export function isNoResize(e: ResizeEdges): boolean {
  return e.left === 0 && e.top === 0 && e.right === 0 && e.bottom === 0
}

export function resizedSize(map: Pick<MapData, 'width' | 'height'>, e: ResizeEdges): { width: number; height: number } {
  return { width: map.width + e.left + e.right, height: map.height + e.top + e.bottom }
}

/** Why `edges` cannot be applied, or null when they can. */
export function resizeProblem(map: Pick<MapData, 'width' | 'height'>, e: ResizeEdges): string | null {
  for (const v of [e.left, e.top, e.right, e.bottom]) {
    if (!Number.isInteger(v)) return 'Sizes must be whole numbers of tiles.'
  }
  const { width, height } = resizedSize(map, e)
  if (width < MIN_MAP_SIZE || height < MIN_MAP_SIZE) return 'The map must keep at least 1 × 1 tiles.'
  if (width > MAX_MAP_SIZE || height > MAX_MAP_SIZE) return `A map can be at most ${MAX_MAP_SIZE} × ${MAX_MAP_SIZE} tiles.`
  return null
}

const inside = (x: number, y: number, w: number, h: number) => x >= 0 && y >= 0 && x < w && y < h

/** Tile of an entity / image anchor, in old-map coordinates. */
function anchorCell(x: number, y: number): { col: number; row: number } {
  return anchorToTile(x, y)
}

/**
 * A picture is lost when its anchor was inside the map and ends up outside the new one. Pictures that already ran past
 * the map's edge (they can be dragged there) stay, moved along with the rest.
 */
function imageLost(map: ResizableMap, e: ResizeEdges, col: number, row: number, newW: number, newH: number): boolean {
  return inside(col, row, map.width, map.height) && !inside(col + e.left, row + e.top, newW, newH)
}

export interface ResizeLoss {
  /** Painted tiles that fall outside the new map, per layer (only layers that lose something). */
  layers: { layerId: string; name: string; type: Layer['type']; tiles: number; images: number }[]
  entities: { id: string; name: string }[]
  tiles: number
  images: number
}

/** What cropping throws away. Empty (all zero) when the map only grows or the cropped strip is empty. */
export function resizeLoss(map: ResizableMap, e: ResizeEdges): ResizeLoss {
  const { width: newW, height: newH } = resizedSize(map, e)
  const loss: ResizeLoss = { layers: [], entities: [], tiles: 0, images: 0 }

  for (const layer of map.layers) {
    let tiles = 0
    let images = 0
    for (const key of Object.keys(layer.data ?? {})) {
      const idx = Number(key)
      const x = (idx % map.width) + e.left
      const y = Math.floor(idx / map.width) + e.top
      if (!inside(x, y, newW, newH)) tiles++
    }
    for (const item of layer.images ?? []) {
      const { col, row } = anchorCell(item.x, item.y)
      if (imageLost(map, e, col, row, newW, newH)) images++
    }
    if (tiles || images) {
      loss.layers.push({ layerId: layer.id, name: layer.name, type: layer.type, tiles, images })
      loss.tiles += tiles
      loss.images += images
    }
  }

  for (const ent of map.entities ?? []) {
    const { col, row } = anchorCell(ent.x, ent.y)
    if (!inside(col + e.left, row + e.top, newW, newH)) loss.entities.push({ id: ent.id, name: ent.name })
  }
  return loss
}

export function hasLoss(loss: ResizeLoss): boolean {
  return loss.tiles > 0 || loss.images > 0 || loss.entities.length > 0
}

/** One flag per old cell (`y * width + x`): does anything live there (a painted tile, an image anchor, an entity)? */
export function occupiedCells(map: ResizableMap): Uint8Array {
  const cells = new Uint8Array(map.width * map.height)
  for (const layer of map.layers) {
    for (const key of Object.keys(layer.data ?? {})) {
      const idx = Number(key)
      if (idx >= 0 && idx < cells.length) cells[idx] = 1
    }
    for (const item of layer.images ?? []) mark(cells, map.width, map.height, item.x, item.y)
  }
  for (const ent of map.entities ?? []) mark(cells, map.width, map.height, ent.x, ent.y)
  return cells
}

function mark(cells: Uint8Array, w: number, h: number, x: number, y: number) {
  const { col, row } = anchorCell(x, y)
  if (inside(col, row, w, h)) cells[row * w + col] = 1
}

function shiftLayer(layer: Layer, map: ResizableMap, e: ResizeEdges, newW: number, newH: number): Layer {
  const next: Layer = { ...layer }
  if (layer.data) {
    const data: NonNullable<Layer['data']> = {}
    for (const [key, tile] of Object.entries(layer.data)) {
      const idx = Number(key)
      const x = (idx % map.width) + e.left
      const y = Math.floor(idx / map.width) + e.top
      if (inside(x, y, newW, newH)) data[y * newW + x] = tile
    }
    next.data = data
  }
  if (layer.images) {
    next.images = layer.images
      .filter((item) => {
        const { col, row } = anchorCell(item.x, item.y)
        return !imageLost(map, e, col, row, newW, newH)
      })
      .map((item) => ({ ...item, x: item.x + e.left * TILE_SIZE, y: item.y + e.top * TILE_SIZE }))
  }
  return next
}

function shiftEntity(ent: EntityData, e: ResizeEdges): EntityData {
  const dx = e.left * TILE_SIZE
  const dy = e.top * TILE_SIZE
  const next: EntityData = { ...ent, x: ent.x + dx, y: ent.y + dy }
  const transform = ent.components?.Transform
  if (transform && typeof transform.x === 'number' && typeof transform.y === 'number') {
    next.components = { ...ent.components, Transform: { ...transform, x: transform.x + dx, y: transform.y + dy } }
  }
  return next
}

/** The map after the resize. Returns `map` itself when nothing changes. */
export function applyResize<T extends ResizableMap>(map: T, e: ResizeEdges): T {
  const problem = resizeProblem(map, e)
  if (problem) throw new Error(problem)
  if (isNoResize(e)) return map

  const { width, height } = resizedSize(map, e)
  const layers = map.layers.map((l) => shiftLayer(l, map, e, width, height))
  const result: T = { ...map, width, height, layers }
  if (map.entities) {
    result.entities = map.entities
      .filter((ent) => {
        const { col, row } = anchorCell(ent.x, ent.y)
        return inside(col + e.left, row + e.top, width, height)
      })
      .map((ent) => shiftEntity(ent, e))
  }
  return result
}

/** "3 layers lose 214 tiles, 2 pictures and 1 entity" for the warning box. */
export function describeLoss(loss: ResizeLoss): string {
  const parts: string[] = []
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
  if (loss.tiles) parts.push(plural(loss.tiles, 'painted tile'))
  if (loss.images) parts.push(plural(loss.images, 'placed picture'))
  if (loss.entities.length) parts.push(plural(loss.entities.length, 'entity', 'entities'))
  return parts.join(', ')
}
