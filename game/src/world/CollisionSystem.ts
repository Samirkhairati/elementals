import { GAME_CONSTANTS } from "@/constants/game";
import { settingsStore } from "@/core/SettingsStore";

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
   * @param x World X coordinate (scaled)
   * @param y World Y coordinate (scaled, bottom center of entity)
   * @returns True if walkable, false otherwise
   */
  public isWalkable(x: number, y: number): boolean {
    if (!this.map) return true;

    const scale = settingsStore.renderScale;
    const scaledTileSize = GAME_CONSTANTS.TILE_SIZE * scale;
    const scaledWidth = this.map.widthInPixels * scale;
    const scaledHeight = this.map.heightInPixels * scale;

    // 1. Boundary check
    if (x < 0 || x > scaledWidth || y < scaledTileSize || y > scaledHeight) {
      return false;
    }

    // 2. Tile-based collision check
    // Since player origin is (0.5, 1), y is the bottom edge.
    // Subtract a tiny amount to get the tile the player is actually "in" at their base.
    const tileX = this.map.worldToTileX(x, true, undefined, this.collisionLayerName);
    const tileY = this.map.worldToTileY(y - 1, true, undefined, this.collisionLayerName);

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
