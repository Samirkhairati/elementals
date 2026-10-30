import type { CopiedTile, Layer, PaintMode, Pos, TileSelection } from '@/types/editor'

/**
 * Pure tile-painting operations. They take plain layer data and return a *new*
 * data object, or `null` when the operation would not change anything.
 * Nothing here touches React, IPC or global state (other than `Math.random`).
 */

export type TileMap = NonNullable<Layer['data']>

export interface GridSize {
  width: number
  height: number
}

const inBounds = (size: GridSize, x: number, y: number) => x >= 0 && x < size.width && y >= 0 && y < size.height

const cellIndex = (size: GridSize, x: number, y: number) => y * size.width + x

/** Pick the tile of `selection` that tiles (modulo) onto (x, y) when the pattern is anchored at `anchor`. */
export function anchoredTile(selection: TileSelection, x: number, y: number, anchor: Pos): CopiedTile | null {
  const offsetX = (x - anchor.x) % selection.width
  const offsetY = (y - anchor.y) % selection.height
  const srcX = offsetX >= 0 ? offsetX : selection.width + offsetX
  const srcY = offsetY >= 0 ? offsetY : selection.height + offsetY
  return selection.tiles[srcY * selection.width + srcX] ?? null
}

/** A uniformly random tile of the selection (may be null for empty stamp cells). */
export function randomTile(selection: TileSelection): CopiedTile | null {
  return selection.tiles[Math.floor(Math.random() * selection.tiles.length)] ?? null
}

/**
 * Shared source-tile resolution.
 *  - `random`: random tile of the selection.
 *  - otherwise (continuous / discontinuous): the pattern tiled from `anchor`.
 * Callers that need a different fallback (e.g. brush discontinuous = stamp-relative) handle that case themselves.
 */
export function resolveSourceTile(
  selection: TileSelection,
  mode: PaintMode,
  x: number,
  y: number,
  anchor: Pos
): CopiedTile | null {
  if (mode === 'random') return randomTile(selection)
  return anchoredTile(selection, x, y, anchor)
}

/** Mutable working copy that remembers whether any cell really changed. */
class Draft {
  readonly data: TileMap
  changed = false

  constructor(source: TileMap | undefined) {
    this.data = { ...(source || {}) }
  }

  set(index: number, tile: CopiedTile | null) {
    const existing = this.data[index]
    if (tile === null) {
      if (existing !== undefined) {
        delete this.data[index]
        this.changed = true
      }
      return
    }
    if (!existing || existing.tilesetId !== tile.tilesetId || existing.x !== tile.x || existing.y !== tile.y) {
      this.data[index] = { tilesetId: tile.tilesetId, x: tile.x, y: tile.y }
      this.changed = true
    }
  }

  result(): TileMap | null {
    return this.changed ? this.data : null
  }
}

/**
 * Stamp the selection with its top-left corner at (gridX, gridY).
 * `anchor` is the stroke start (only used by `continuous` mode; without it continuous behaves like discontinuous).
 */
export function brushPaint(
  data: TileMap | undefined,
  size: GridSize,
  gridX: number,
  gridY: number,
  selection: TileSelection,
  mode: PaintMode,
  anchor: Pos | null
): TileMap | null {
  const draft = new Draft(data)
  for (let dy = 0; dy < selection.height; dy++) {
    for (let dx = 0; dx < selection.width; dx++) {
      const targetX = gridX + dx
      const targetY = gridY + dy
      if (!inBounds(size, targetX, targetY)) continue

      let tile: CopiedTile | null
      if (mode === 'continuous' && anchor) {
        tile = anchoredTile(selection, targetX, targetY, anchor)
      } else if (mode === 'random') {
        tile = randomTile(selection)
      } else {
        tile = selection.tiles[dy * selection.width + dx] ?? null
      }
      draft.set(cellIndex(size, targetX, targetY), tile)
    }
  }
  return draft.result()
}

/** Erase the single cell at (gridX, gridY). Returns null if it is already empty or out of bounds. */
export function erase(data: TileMap | undefined, size: GridSize, gridX: number, gridY: number): TileMap | null {
  if (!inBounds(size, gridX, gridY)) return null
  const index = cellIndex(size, gridX, gridY)
  if (!data || !data[index]) return null
  const next = { ...data }
  delete next[index]
  return next
}

const tileKey = (t: CopiedTile | undefined) => (t ? `${t.tilesetId}_${t.x}_${t.y}` : 'empty')

/**
 * 4-connected flood fill starting at (gridX, gridY) over cells that currently hold the same tile (or are all empty).
 * `anchor` is the stroke start; falls back to the click position when absent.
 */
export function bucketFill(
  data: TileMap | undefined,
  size: GridSize,
  gridX: number,
  gridY: number,
  selection: TileSelection,
  mode: PaintMode,
  anchor: Pos | null
): TileMap | null {
  if (!inBounds(size, gridX, gridY)) return null
  const source = data || {}
  const draft = new Draft(data)
  const targetKey = tileKey(source[cellIndex(size, gridX, gridY)])

  const queue: Pos[] = [{ x: gridX, y: gridY }]
  const visited = new Set<number>()
  const fallbackAnchor: Pos = anchor ?? { x: gridX, y: gridY }

  for (let head = 0; head < queue.length; head++) {
    const { x, y } = queue[head]
    const idx = cellIndex(size, x, y)
    if (visited.has(idx)) continue
    visited.add(idx)

    draft.set(idx, resolveSourceTile(selection, mode, x, y, fallbackAnchor))

    const neighbours: Pos[] = [
      { x, y: y - 1 },
      { x, y: y + 1 },
      { x: x - 1, y },
      { x: x + 1, y },
    ]
    for (const n of neighbours) {
      if (!inBounds(size, n.x, n.y)) continue
      const nIdx = cellIndex(size, n.x, n.y)
      if (!visited.has(nIdx) && tileKey(source[nIdx]) === targetKey) queue.push(n)
    }
  }
  return draft.result()
}

/**
 * Fill the (clamped) rectangle spanned by two corners (in any order) with the selection tiled from `start`.
 * `continuous` and `discontinuous` behave identically here; `random` picks per cell.
 */
export function rectangleFill(
  data: TileMap | undefined,
  size: GridSize,
  start: Pos,
  end: Pos,
  selection: TileSelection,
  mode: PaintMode
): TileMap | null {
  const draft = new Draft(data)
  const minX = Math.max(0, Math.min(start.x, end.x))
  const minY = Math.max(0, Math.min(start.y, end.y))
  const maxX = Math.min(size.width - 1, Math.max(start.x, end.x))
  const maxY = Math.min(size.height - 1, Math.max(start.y, end.y))

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      draft.set(cellIndex(size, x, y), resolveSourceTile(selection, mode, x, y, start))
    }
  }
  return draft.result()
}
