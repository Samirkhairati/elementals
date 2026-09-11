import { GAME_CONSTANTS } from "@/constants/game";

export class CollisionSystem {
  private map: Phaser.Tilemaps.Tilemap | null = null;
  private collisionLayerName = "collision";

  /**
   * Updates the current map context for collision checks.
   * @param map The active Phaser Tilemap
   */
  public setMap(map: Phaser.Tilemaps.Tilemap) {
    this.map = map;
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
    const width = this.map.widthInPixels;
    const height = this.map.heightInPixels;

    // 1. Boundary check
    if (x < 0 || x > width || y < tileSize || y > height) {
      return false;
    }

    // 2. Tile-based collision check
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
