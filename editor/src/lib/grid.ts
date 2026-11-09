// The picture grid: the lines pictures snap to. It starts as the 32 px tile grid and can be given another size and an offset
// (right-click the grid snapping button).

export interface GridSpec {
  sizeX: number
  sizeY: number
  offsetX: number
  offsetY: number
}

export const DEFAULT_GRID: GridSpec = { sizeX: 32, sizeY: 32, offsetX: 0, offsetY: 0 }
export const GRID_MIN = 1
export const GRID_MAX = 1024

const clean = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback

/** A usable grid from anything (stored or typed): whole pixels, sizes at least 1, offsets inside one cell. */
export function normalizeGrid(value: Partial<GridSpec> | null | undefined): GridSpec {
  const sizeX = clean(value?.sizeX, DEFAULT_GRID.sizeX, GRID_MIN, GRID_MAX)
  const sizeY = clean(value?.sizeY, DEFAULT_GRID.sizeY, GRID_MIN, GRID_MAX)
  const wrap = (v: unknown, size: number) => {
    const n = clean(v, 0, -1_000_000, 1_000_000)
    return ((n % size) + size) % size
  }
  return { sizeX, sizeY, offsetX: wrap(value?.offsetX, sizeX), offsetY: wrap(value?.offsetY, sizeY) }
}

export const isDefaultGrid = (g: GridSpec): boolean =>
  g.sizeX === DEFAULT_GRID.sizeX && g.sizeY === DEFAULT_GRID.sizeY && g.offsetX === 0 && g.offsetY === 0

/** The grid line nearest to `v` (lines at `offset + k * size`). */
export const nearestLine = (v: number, size: number, offset: number): number => Math.round((v - offset) / size) * size + offset
