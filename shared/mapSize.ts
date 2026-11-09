// A map's size: a grid of `width` x `height` tiles (32 px) and, when it is not a whole number of tiles, its real size in
// pixels (`pixelWidth` / `pixelHeight`, at most the grid). The camera and the editor's map frame use the pixel size;
// tile layers use the grid. Pure, shared by the editor, the exporter and the game.

export const MAP_TILE_SIZE = 32

export interface SizedMap {
  width: number
  height: number
  pixelWidth?: number
  pixelHeight?: number
}

const valid = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= max

/** The map's size in pixels: `pixelWidth` / `pixelHeight` when set (and inside the grid), else the whole grid. */
export function mapPixelSize(map: SizedMap): { width: number; height: number } {
  const gridW = map.width * MAP_TILE_SIZE
  const gridH = map.height * MAP_TILE_SIZE
  return {
    width: valid(map.pixelWidth, gridW) ? Math.round(map.pixelWidth) : gridW,
    height: valid(map.pixelHeight, gridH) ? Math.round(map.pixelHeight) : gridH,
  }
}
