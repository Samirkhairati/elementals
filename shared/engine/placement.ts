// One kind of entity: the same six components whatever its size or position.
//
//  * Its area is its Collider box (a rect), or one tile when it has no Collider. The editor resizes it on the map and
//    snaps it with the magnet, so nothing in the data says "tile-based".
//  * `Transform.free` is derived from the position, never chosen: it is true exactly when the anchor is off the tile
//    grid (`x = col*32+16`, `y = (row+1)*32`). The game uses it to keep such an entity on its pixel position and to step
//    it from there, instead of moving it tile by tile.
//
// Pure helpers shared by the editor (writing the flag) and the game (reading it).

import { TILE_SIZE } from './constants.ts';
import type { EngineEntity } from './types.ts';
import { isRecord } from './util.ts';

/** The anchor of the tile that contains the point: bottom-centre, `x = col*32+16`, `y = (row+1)*32`. */
export function snapAnchorToTile(x: number, y: number): { x: number; y: number } {
  const col = Math.floor(x / TILE_SIZE);
  const row = Math.floor((y - TILE_SIZE / 2) / TILE_SIZE);
  return { x: col * TILE_SIZE + TILE_SIZE / 2, y: (row + 1) * TILE_SIZE };
}

/** Whether the anchor already is a tile anchor. */
export const isTileAnchor = (x: number, y: number): boolean => x === snapAnchorToTile(x, y).x && y === snapAnchorToTile(x, y).y;

/** Whether the anchor is off the tile grid (what `Transform.free` records). */
export const isOffGrid = (x: number, y: number): boolean => !isTileAnchor(x, y);

/**
 * The entity with `Transform.free` set from its position (`isOffGrid(x, y)`). Never mutates; the same object comes back
 * when nothing changes (no Transform, or the flag already right: a missing flag counts as false).
 */
export function withDerivedFree<T extends Pick<EngineEntity, 'x' | 'y'> & { components?: unknown }>(entity: T): T {
  const components = entity.components;
  if (!isRecord(components)) return entity;
  const transform = components.Transform;
  if (!isRecord(transform)) return entity;
  const free = isOffGrid(entity.x, entity.y);
  if ((transform.free === true) === free) return entity;
  return { ...entity, components: { ...components, Transform: { ...transform, free } } };
}
