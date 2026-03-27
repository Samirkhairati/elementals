export class CoordinateUtils {
  /**
   * Converts grid tile coordinates to absolute world coordinates.
   *
   * @param tileX Tile array X coordinate
   * @param tileY Tile array Y coordinate
   * @param tilemap A Phaser Tilemap object referencing the tile dimensions
   * @returns An object containing absolute world X/Y
   */
  static tileToWorld(
    tileX: number,
    tileY: number,
    tilemap: Phaser.Tilemaps.Tilemap,
  ): { x: number; y: number } {
    return {
      x: tilemap.tileToWorldX(tileX) ?? tileX * tilemap.tileWidth,
      y: tilemap.tileToWorldY(tileY) ?? tileY * tilemap.tileHeight,
    };
  }

  /**
   * Converts world coordinates to grid tile coordinates.
   *
   * @param worldX Absolute world X coordinate
   * @param worldY Absolute world Y coordinate
   * @param tilemap A Phaser Tilemap object referencing the tile dimensions
   * @returns An object containing array grid X/Y
   */
  static worldToTile(
    worldX: number,
    worldY: number,
    tilemap: Phaser.Tilemaps.Tilemap,
  ): { x: number; y: number } {
    return {
      // Phaser's worldToTileXY returns Vector2 if successful, though it's typically easier to compute mathematically or use individual coords
      x: tilemap.worldToTileX(worldX) ?? Math.floor(worldX / tilemap.tileWidth),
      y:
        tilemap.worldToTileY(worldY) ?? Math.floor(worldY / tilemap.tileHeight),
    };
  }
}
