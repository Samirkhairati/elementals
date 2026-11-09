// Tile-based and free entities. Both are the same six-component entity; `Transform.free` says which kind it is.
//
//  * Tile-based (the default, and every entity written before the flag existed): the anchor is the bottom-centre of a
//    tile (`x = col*32+16`, `y = (row+1)*32`) and the collider covers whole tiles, so its edges lie on tile lines.
//  * Free: any pixel position and any collider size and offset; nothing snaps.
//
// Pure helpers shared by the editor (snapping, converting, creating) and the validator.

import { TILE_SIZE } from './constants.ts';
import type { ColliderProps, EngineEntity } from './types.ts';
import { isRecord } from './util.ts';

/** True for a free entity (`Transform.free === true`); anything else, including a missing flag, is tile-based. */
export function isFreeEntity(entity: { components?: unknown }): boolean {
  const components = entity.components;
  if (!isRecord(components)) return false;
  const transform = components.Transform;
  return isRecord(transform) && transform.free === true;
}

/** The anchor of the tile that contains the point: bottom-centre, `x = col*32+16`, `y = (row+1)*32`. */
export function snapAnchorToTile(x: number, y: number): { x: number; y: number } {
  const col = Math.floor(x / TILE_SIZE);
  const row = Math.floor((y - TILE_SIZE / 2) / TILE_SIZE);
  return { x: col * TILE_SIZE + TILE_SIZE / 2, y: (row + 1) * TILE_SIZE };
}

/** Whether the anchor already is a tile anchor. */
export const isTileAnchor = (x: number, y: number): boolean => x === snapAnchorToTile(x, y).x && y === snapAnchorToTile(x, y).y;

type Box = Pick<ColliderProps, 'width' | 'height' | 'offsetX' | 'offsetY'>;

const roundTo = (value: number, step: number): number => Math.round(value / step) * step || 0;

/**
 * The nearest collider box whose edges lie on tile lines for a tile anchor: width and height whole tiles (at least
 * one), and offsets that put the box on the grid. The box is centred on the anchor, so a box an even number of tiles
 * wide needs half a tile of offset X (offset Y is always whole tiles, the box hangs up from the anchor).
 */
export function snapColliderToTiles(box: Box): Box {
  const tilesWide = Math.max(1, Math.round(box.width / TILE_SIZE));
  const tilesHigh = Math.max(1, Math.round(box.height / TILE_SIZE));
  // left edge = anchor + offsetX - width/2 and the anchor is half a tile off the grid: offsetX = 16*(tilesWide-1) (mod 32)
  const parity = (TILE_SIZE / 2) * (tilesWide - 1);
  return {
    width: tilesWide * TILE_SIZE,
    height: tilesHigh * TILE_SIZE,
    offsetX: roundTo(box.offsetX - parity, TILE_SIZE) + parity,
    offsetY: roundTo(box.offsetY, TILE_SIZE),
  };
}

/** Whether the box has edges on tile lines when its entity stands on a tile anchor. */
export function isTileAlignedBox(box: Box): boolean {
  const snapped = snapColliderToTiles(box);
  return snapped.width === box.width && snapped.height === box.height && snapped.offsetX === box.offsetX && snapped.offsetY === box.offsetY;
}

/**
 * The entity as the other kind: `free: true` only sets the flag (nothing moves); `free: false` also moves the anchor
 * to the tile it stands on and snaps its collider to whole tiles. Never mutates; the entity itself is returned when
 * nothing changes.
 */
export function setEntityFree<T extends EngineEntity>(entity: T, free: boolean): T {
  if (isFreeEntity(entity) === free && (free || isTileEntityAligned(entity))) return entity;
  const components = { ...entity.components };
  let { x, y } = entity;
  if (!free) {
    ({ x, y } = snapAnchorToTile(entity.x, entity.y));
    const collider = components.Collider;
    if (collider) components.Collider = { ...collider, ...snapColliderToTiles(collider) };
  }
  components.Transform = { ...(components.Transform ?? { depth: 10 }), x, y, free } as T['components']['Transform'];
  return { ...entity, x, y, components };
}

/** Whether a tile-based entity really is on the grid (anchor and collider). A free entity always is, vacuously. */
export function isTileEntityAligned(entity: EngineEntity): boolean {
  if (isFreeEntity(entity)) return true;
  if (!isTileAnchor(entity.x, entity.y)) return false;
  const collider = entity.components?.Collider;
  return !collider || isTileAlignedBox(collider);
}
