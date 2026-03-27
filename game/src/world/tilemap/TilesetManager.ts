import type { TilesetData } from "@/world/tilemap/interfaces";

export class TilesetManager {
  private tilesetMapping: Map<string, string> = new Map();

  /**
   * Registers a tileset so that the adapter knows which Phaser texture key
   * to map to a given Tiled tileset name.
   *
   * @param tiledTilesetName The name of the tileset defined in Tiled
   * @param phaserTextureKey The key used to load the image in Phaser's loader
   */
  registerTileset(tiledTilesetName: string, phaserTextureKey: string): void {
    if (this.tilesetMapping.has(tiledTilesetName)) {
      console.warn(
        `TilesetManager: Overwriting existing tileset mapping for '${tiledTilesetName}'`,
      );
    }
    this.tilesetMapping.set(tiledTilesetName, phaserTextureKey);
  }

  /**
   * Retrieves the mapped Phaser texture key for a Tiled tileset name.
   */
  getTextureKey(tiledTilesetName: string): string | undefined {
    return this.tilesetMapping.get(tiledTilesetName);
  }

  /**
   * Takes a Phaser Tilemap and automatically adds all registered tilesets to it.
   */
  addTilesetsToMap(
    map: Phaser.Tilemaps.Tilemap,
    mapDataTilesets: TilesetData[],
  ): Phaser.Tilemaps.Tileset[] {
    const phaserTilesets: Phaser.Tilemaps.Tileset[] = [];

    for (const tsData of mapDataTilesets) {
      const textureKey = this.getTextureKey(tsData.name);
      if (!textureKey) {
        console.warn(
          `TilesetManager: No mapping found for Tiled tileset '${tsData.name}'. Skipping.`,
        );
        continue;
      }

      // Add the tileset to the Phaser Tilemap
      const tileset = map.addTilesetImage(tsData.name, textureKey);
      if (tileset) {
        phaserTilesets.push(tileset);
      } else {
        console.error(
          `TilesetManager: Failed to add tileset image '${tsData.name}' -> texture '${textureKey}'`,
        );
      }
    }

    return phaserTilesets;
  }
}
