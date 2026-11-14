import type { MapData } from '@/types/editor'
import { isDataLayer, mapTree, type DataLayerNode, type EntityNode, type SceneNode } from '../../../shared/sceneTree'
import { sceneIndex } from './sceneIndex'
import { TILE_SIZE } from '../../../shared/engine/constants'
import { mapPixelSize } from '../../../shared/mapSize'
import { translatePoints } from '../../../shared/collisionShapes'

/**
 * Pure model of "resize map", in pixels. A map is a size in pixels (any size: `pixelWidth` / `pixelHeight`, or whole
 * tiles when those are absent) over a grid of 32 px tiles that covers it. Each edge grows (positive) or crops
 * (negative) that side, by any whole number of pixels. Every pixel position (entity anchors, image-layer items,
 * collision shapes) moves by (left, top). Painted tiles cannot sit between grid lines, so tile (x, y) of the old map
 * becomes (x + round(left/32), y + round(top/32)): with an edge on a whole tile (the usual case) they move exactly,
 * otherwise they land on the nearest tile.
 *
 * Nothing placed is ever removed: pictures and entities that end up outside the map stay where they are (outside).
 * Only painted tiles that fall off the new tile grid are cropped.
 */

export interface ResizeEdges {
  /** Pixels. */
  left: number
  /** Pixels. */
  top: number
  /** Pixels. */
  right: number
  /** Pixels. */
  bottom: number
}

export type ResizableMap = Pick<MapData, 'width' | 'height' | 'nodes' | 'pixelWidth' | 'pixelHeight'>

/** The layers of the map that hold painted cells (tile, terrain, encounters, objects and collision layers). */
const cellLayers = (map: Pick<MapData, 'nodes'>): DataLayerNode[] => sceneIndex(map.nodes).layers.filter(isDataLayer)

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

/** How many whole tiles painted tiles move for an edge shift in pixels (exact when it is a multiple of the tile size). */
export const tileShift = (px: number): number => Math.round(px / TILE_SIZE)

/** Tiles needed to cover a pixel size. */
export const tilesFor = (px: number): number => Math.max(1, Math.ceil(px / TILE_SIZE))

/** Why `edges` cannot be applied, or null when they can. */
export function resizeProblem(map: Pick<MapData, 'width' | 'height' | 'pixelWidth' | 'pixelHeight'>, e: ResizeEdges): string | null {
  for (const v of [e.left, e.top, e.right, e.bottom]) {
    if (!Number.isInteger(v)) return 'Sizes must be whole pixels.'
  }
  const { width, height } = resizedSize(map, e)
  if (width < 1 || height < 1) return 'The map must keep at least 1 × 1 pixels.'
  if (tilesFor(width) > MAX_MAP_SIZE || tilesFor(height) > MAX_MAP_SIZE) return `A map can be at most ${MAX_MAP_SIZE * TILE_SIZE} × ${MAX_MAP_SIZE * TILE_SIZE} pixels (${MAX_MAP_SIZE} × ${MAX_MAP_SIZE} tiles).`
  return null
}

const inside = (x: number, y: number, w: number, h: number) => x >= 0 && y >= 0 && x < w && y < h

export interface ResizeLoss {
  /** Painted tiles that fall off the new tile grid, per layer (only layers that lose some). */
  layers: { layerId: string; name: string; type: DataLayerNode['type']; tiles: number }[]
  tiles: number
}

/** What cropping throws away: painted tiles only (pictures and entities are always kept). */
export function resizeLoss(map: ResizableMap, e: ResizeEdges): ResizeLoss {
  const size = resizedSize(map, e)
  const newW = tilesFor(size.width)
  const newH = tilesFor(size.height)
  const dc = tileShift(e.left)
  const dr = tileShift(e.top)
  const loss: ResizeLoss = { layers: [], tiles: 0 }
  for (const layer of cellLayers(map)) {
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
  for (const layer of cellLayers(map)) {
    for (const key of Object.keys(layer.data ?? {})) {
      const idx = Number(key)
      if (idx >= 0 && idx < cells.length) cells[idx] = 1
    }
  }
  return cells
}

/** One node moved by the resize: painted cells to their new place (cropped off the grid), pixel positions by (left, top). */
function shiftNode(node: SceneNode, map: ResizableMap, e: ResizeEdges, newW: number, newH: number): SceneNode {
  const dc = tileShift(e.left)
  const dr = tileShift(e.top)
  if (isDataLayer(node)) {
    if (!node.data) return node
    const data: NonNullable<DataLayerNode['data']> = {}
    for (const [key, tile] of Object.entries(node.data)) {
      const idx = Number(key)
      const x = (idx % map.width) + dc
      const y = Math.floor(idx / map.width) + dr
      if (inside(x, y, newW, newH)) data[y * newW + x] = tile
    }
    return { ...node, data }
  }
  if (node.type === 'picture') return { ...node, x: node.x + e.left, y: node.y + e.top }
  if (node.type === 'collisionShape') return { ...node, points: translatePoints(node.points, e.left, e.top) }
  if (node.type === 'entity') return shiftEntity(node, e)
  return node
}

function shiftEntity(ent: EntityNode, e: ResizeEdges): EntityNode {
  const next: EntityNode = { ...ent, x: ent.x + e.left, y: ent.y + e.top }
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
  const nodes = mapTree(map.nodes, (n) => shiftNode(n, map, e, width, height))
  const { pixelWidth: _w, pixelHeight: _h, ...rest } = map
  const wholeTiles = size.width === width * TILE_SIZE && size.height === height * TILE_SIZE
  const result = { ...rest, width, height, nodes, ...(wholeTiles ? {} : { pixelWidth: size.width, pixelHeight: size.height }) } as T
  return result
}

/** "214 painted tiles" for the warning box. */
export function describeLoss(loss: ResizeLoss): string {
  return `${loss.tiles} painted ${loss.tiles === 1 ? 'tile' : 'tiles'}`
}

/** Edges given in tiles, as pixels. */
export const tileEdges = (e: ResizeEdges): ResizeEdges => ({ left: e.left * TILE_SIZE, top: e.top * TILE_SIZE, right: e.right * TILE_SIZE, bottom: e.bottom * TILE_SIZE })
