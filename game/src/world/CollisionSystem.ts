import { CONFIG } from "@/config";

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
   * @param x World X coordinate
   * @param y World Y coordinate (bottom center of entity)
   * @returns True if walkable, false otherwise
   */
  public isWalkable(x: number, y: number): boolean {
    if (!this.map) return true;

    const { tileSize } = CONFIG;

    // 1. Boundary check
    if (x < 0 || x > this.map.widthInPixels || y < tileSize || y > this.map.heightInPixels) {
      return false;
    }

    // 2. Tile-based collision check
    // Since player origin is (0.5, 1), y is the bottom edge.
    // subtract a tiny amount to get the tile the player is actually "in" at their base.
    const tileX = this.map.worldToTileX(x);
    const tileY = this.map.worldToTileY(y - 1);

    if (tileX === null || tileY === null) return false;

    const collisionLayer = this.map.getLayer(this.collisionLayerName);
    if (collisionLayer) {
      const tile = this.map.getTileAt(tileX, tileY, true, this.collisionLayerName);
      // A tile is considered a "collision" if it has an index (GID) > 0
      return !tile || tile.index <= 0;
    }

    return true;
  }
}
