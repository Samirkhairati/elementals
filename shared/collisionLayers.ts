// Collision layers: one layer type for everything that blocks movement. A collision layer holds a list of items, each
// either a set of painted tiles (a "tiles" item) or one shape (a closed polygon or an open line, shared/collisionShapes.ts).
// A map can have several collision layers; the game blocks with all of them.
//
// Storage (kept so painting, undo, resizing and the exporter work on it unchanged):
//  * the painted cells are the layer's `data`, each a `__collision__` marker tile; `tile.group` says which tiles item it
//    belongs to (a cell with no group, or an unknown one, belongs to the first tiles item);
//  * the tiles items are `tileGroups` (id + name), in list order;
//  * the shapes are `shapes`, each one item.
// Maps written before collision layers held shapes had a separate `polygons` layer type: `migrateCollisionLayers` turns
// those into collision layers when a map is loaded or exported. Pure, no DOM or Node imports.

import type { CollisionShape } from './collisionShapes.ts'

export const COLLISION_MARKER_ID = '__collision__'

/** A named set of the painted tiles of a collision layer. */
export interface CollisionTileGroup {
  id: string
  name: string
}

interface CollisionCell {
  tilesetId: string
  x: number
  y: number
  group?: string
}

/** The fields of a layer this module reads and writes. */
export interface CollisionLayerLike {
  type: string
  data?: Record<number | string, CollisionCell>
  tileGroups?: CollisionTileGroup[]
  shapes?: CollisionShape[]
}

/** One row of a collision layer's item list. */
export type CollisionItem =
  | { kind: 'tiles'; id: string; name: string; count: number }
  | { kind: 'shape'; id: string; name: string; closed: boolean; count: number }

/** The id of the tiles item a migrated layer's existing cells belong to. */
export const DEFAULT_TILE_GROUP_ID = 'tiles'

/** The tiles item a cell belongs to: its own group when the layer has it, else the first one (null without any). */
export function cellGroupId(layer: Pick<CollisionLayerLike, 'tileGroups'>, cell: Pick<CollisionCell, 'group'>): string | null {
  const groups = layer.tileGroups ?? []
  if (cell.group && groups.some((g) => g.id === cell.group)) return cell.group
  return groups[0]?.id ?? null
}

/** The shown name of a shape: its own, else "Polygon n" / "Line n" by its place among the layer's shapes of that kind. */
export function shapeLabel(shapes: readonly CollisionShape[], shape: CollisionShape): string {
  if (shape.name) return shape.name
  const sameKind = shapes.filter((s) => s.closed === shape.closed)
  return `${shape.closed ? 'Polygon' : 'Line'} ${sameKind.indexOf(shape) + 1}`
}

/** The item list of a collision layer: the tiles items (with how many cells each has), then the shapes. */
export function collisionItems(layer: CollisionLayerLike): CollisionItem[] {
  const counts = new Map<string, number>()
  for (const cell of Object.values(layer.data ?? {})) {
    const id = cellGroupId(layer, cell)
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const shapes = layer.shapes ?? []
  return [
    ...(layer.tileGroups ?? []).map((g): CollisionItem => ({ kind: 'tiles', id: g.id, name: g.name, count: counts.get(g.id) ?? 0 })),
    ...shapes.map((s): CollisionItem => ({ kind: 'shape', id: s.id, name: shapeLabel(shapes, s), closed: s.closed, count: s.points.length })),
  ]
}

/** The cell indexes of one tiles item. */
export function tileGroupCells(layer: CollisionLayerLike, groupId: string): number[] {
  const out: number[] = []
  for (const [key, cell] of Object.entries(layer.data ?? {})) if (cellGroupId(layer, cell) === groupId) out.push(Number(key))
  return out
}

/**
 * After painting: the cells that were not in the layer before (`layer.data`) join `groupId`; every other cell keeps the
 * item it had. Returns the same `data` object when nothing changes.
 */
export function assignNewCells<D extends Record<number | string, CollisionCell>>(layer: Pick<CollisionLayerLike, 'data'>, data: D, groupId: string): D {
  const before = layer.data ?? {}
  let out: D | null = null
  for (const [key, cell] of Object.entries(data)) {
    if (before[key] || cell.group === groupId) continue
    out ??= { ...data }
    ;(out as Record<string, CollisionCell>)[key] = { ...cell, group: groupId }
  }
  return out ?? data
}

/** Whether painting added cells to the layer (cells that `layer.data` did not have). */
export function hasNewCells(layer: Pick<CollisionLayerLike, 'data'>, data: Record<number | string, unknown>): boolean {
  const before = layer.data ?? {}
  return Object.keys(data).some((key) => !before[key])
}

/** The layer without one item: a tiles item takes its cells with it; a shape is removed. */
export function removeCollisionItem<L extends CollisionLayerLike>(layer: L, itemId: string): L {
  if (layer.tileGroups?.some((g) => g.id === itemId)) {
    const data: Record<string, CollisionCell> = {}
    for (const [key, cell] of Object.entries(layer.data ?? {})) if (cellGroupId(layer, cell) !== itemId) data[key] = cell
    return { ...layer, tileGroups: layer.tileGroups.filter((g) => g.id !== itemId), data }
  }
  if (layer.shapes?.some((s) => s.id === itemId)) return { ...layer, shapes: layer.shapes.filter((s) => s.id !== itemId) }
  return layer
}

/** The layer with one item renamed (a blank name is ignored). */
export function renameCollisionItem<L extends CollisionLayerLike>(layer: L, itemId: string, name: string): L {
  const trimmed = name.trim()
  if (!trimmed) return layer
  if (layer.tileGroups?.some((g) => g.id === itemId)) {
    return { ...layer, tileGroups: layer.tileGroups.map((g) => (g.id === itemId ? { ...g, name: trimmed } : g)) }
  }
  if (layer.shapes?.some((s) => s.id === itemId)) return { ...layer, shapes: layer.shapes.map((s) => (s.id === itemId ? { ...s, name: trimmed } : s)) }
  return layer
}

/** A name for a new tiles item: "Tiles", "Tiles 2", ... (the first free one). */
export function nextTileGroupName(layer: Pick<CollisionLayerLike, 'tileGroups'>): string {
  const names = new Set((layer.tileGroups ?? []).map((g) => g.name))
  if (!names.has('Tiles')) return 'Tiles'
  let n = 2
  while (names.has(`Tiles ${n}`)) n++
  return `Tiles ${n}`
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Old layers as today's collision layers: a `polygons` layer (shapes only) becomes a `collision` layer, and a collision
 * layer with painted cells but no tiles items gets one ("Tiles") that holds them. Pure and idempotent; returns the same
 * array when nothing changes.
 */
export function migrateCollisionLayers<T>(layers: readonly T[]): { value: T[]; changed: boolean } {
  let changed = false
  const value = layers.map((layer) => {
    if (!isObject(layer)) return layer
    let next = layer
    if (next.type === 'polygons') next = { ...next, type: 'collision', shapes: Array.isArray(next.shapes) ? next.shapes : [] }
    if (next.type === 'collision') {
      const hasCells = isObject(next.data) && Object.keys(next.data).length > 0
      const groups = Array.isArray(next.tileGroups) ? next.tileGroups : []
      if (hasCells && groups.length === 0) next = { ...next, tileGroups: [{ id: DEFAULT_TILE_GROUP_ID, name: 'Tiles' }] }
    }
    if (next !== layer) changed = true
    return next as T
  })
  return { value: changed ? value : (layers as T[]), changed }
}
