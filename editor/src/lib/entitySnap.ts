// Where an entity lands when it is placed or dragged. The top-toolbar magnet decides, for entities exactly as for pictures:
// on, the edges of its AREA box (its collider, or one tile) land on grid lines (`snapImageAnchor`, on the grid in force);
// off, the pixel under the pointer. With the default one-tile area and grid this is the tile anchor.

import type { Rect } from './entityVisuals'
import type { GridSpec } from './grid'
import { snapImageAnchor } from './imageItems'
import { currentGrid } from '@/store/gridStore'

export function snapEntityAnchor(area: Rect, x: number, y: number, snap: boolean, grid: GridSpec = currentGrid()): { x: number; y: number } {
  return snap ? snapImageAnchor(area, x, y, grid) : { x: Math.round(x), y: Math.round(y) }
}
