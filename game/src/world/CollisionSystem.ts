import { GAME_CONSTANTS } from "@/constants/game";
import { pointInShape, shapeBlocksMove, type CollisionShape } from "@shared/collisionShapes.ts";

export class CollisionSystem {
  private map: Phaser.Tilemaps.Tilemap | null = null;
  private collisionLayerName = "collision";
  /** The walkable area: the map's real size (it can stop short of the last tile column / row). */
  private size: { width: number; height: number } | null = null;

  /** Polygon / polyline collision shapes of the map, in world pixels. */
  private shapes: CollisionShape[] = [];

  /**
   * Updates the current map context for collision checks.
   * @param map The active Phaser Tilemap
   * @param size The map's size in pixels when it is not the whole tile grid
   */
  public setMap(map: Phaser.Tilemaps.Tilemap, size?: { width: number; height: number }) {
    // The same map again without a size (SpatialSystem.setMap) keeps what the loader set; a new map starts clean.
    const same = map === this.map;
    this.map = map;
    this.size = size ?? (same ? this.size : null);
    if (!same) this.shapes = [];
  }

  /** The map's static collision shapes (closed areas and open walls). */
  public setShapes(shapes: CollisionShape[]) {
    this.shapes = shapes;
  }

  /** Would a mover whose feet go from (fromX, fromY) to (toX, toY) be stopped by a static shape? */
  public shapesBlockMove(fromX: number, fromY: number, toX: number, toY: number, halfW: number, feetH: number): boolean {
    for (const shape of this.shapes) if (shapeBlocksMove(shape, fromX, fromY, toX, toY, halfW, feetH)) return true;
    return false;
  }

  /**
   * Checks if a world coordinate is walkable.
   * @param x World X coordinate (logical)
   * @param y World Y coordinate (logical, bottom center of entity)
   * @returns True if walkable, false otherwise
   */
  public isWalkable(x: number, y: number): boolean {
    if (!this.map) return true;

    const tileSize = GAME_CONSTANTS.TILE_SIZE;
    const width = this.size?.width ?? this.map.widthInPixels;
    const height = this.size?.height ?? this.map.heightInPixels;

    // 1. Boundary check
    if (x < 0 || x > width || y < tileSize || y > height) {
      return false;
    }

    // 2. Closed polygons (a point on the bottom edge counts as the tile above, like the tile query)
    for (const shape of this.shapes) if (pointInShape(shape, x, y - 1)) return false;

    // 3. Tile-based collision check
    // If the map does not have a designated collision layer, the map is considered walkable.
    const collisionLayer = this.map.getLayer(this.collisionLayerName);
    if (!collisionLayer) {
      return true;
    }

    // Since player origin is (0.5, 1), y is the bottom edge.
    // Subtract a tiny amount to get the tile the player is actually "in" at their base.
    const tileX = this.map.worldToTileX(x, true, undefined, this.collisionLayerName);
    const tileY = this.map.worldToTileY(y - 1, true, undefined, this.collisionLayerName);

    if (tileX === null || tileY === null) return false;

    const tile = this.map.getTileAt(tileX, tileY, true, this.collisionLayerName);
    // A tile is considered a "collision" if it has an index (GID) > 0
    return !tile || tile.index <= 0;
  }
}
