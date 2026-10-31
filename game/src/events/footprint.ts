import { TILE_SIZE } from "@shared/engine/index.ts";
import type { TransformComponent } from "@/ecs/components/TransformComponent";
import type { ColliderComponent } from "@/ecs/components/ColliderComponent";

export interface TileRange {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

export interface Tile {
  col: number;
  row: number;
}

const EPS = 0.001;

/**
 * Tiles an entity covers right now: its collider box (bottom-centred on the anchor, shifted by the
 * offsets) or, without a collider, the single tile of the anchor. Computed from the LIVE transform so a
 * wandering NPC keeps its events while it walks (mid-step it covers two tiles).
 */
export function footprint(
  transform: Pick<TransformComponent, "x" | "y">,
  collider: Pick<ColliderComponent, "width" | "height" | "offsetX" | "offsetY"> | undefined,
  tileSize: number = TILE_SIZE,
): TileRange {
  const width = collider && collider.width > 0 ? collider.width : tileSize;
  const height = collider && collider.height > 0 ? collider.height : tileSize;
  const offsetX = collider?.offsetX ?? 0;
  const offsetY = collider?.offsetY ?? 0;

  const left = transform.x + offsetX - width / 2;
  const right = transform.x + offsetX + width / 2;
  const top = transform.y + offsetY - height;
  const bottom = transform.y + offsetY;

  return {
    minCol: Math.floor(left / tileSize),
    maxCol: Math.floor((right - EPS) / tileSize),
    minRow: Math.floor(top / tileSize),
    maxRow: Math.floor((bottom - EPS) / tileSize),
  };
}

export function coversTile(range: TileRange, tile: Tile): boolean {
  return tile.col >= range.minCol && tile.col <= range.maxCol && tile.row >= range.minRow && tile.row <= range.maxRow;
}

/** Tile containing an anchor point (the anchor sits on the bottom edge of its tile). */
export function tileOfAnchor(x: number, y: number, tileSize: number = TILE_SIZE): Tile {
  return { col: Math.floor(x / tileSize), row: Math.floor((y - 1) / tileSize) };
}
