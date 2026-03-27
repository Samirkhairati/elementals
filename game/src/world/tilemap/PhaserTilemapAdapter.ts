import { Scene } from "phaser";
import type { TilemapData } from "@/world/tilemap/interfaces";
import { TilesetManager } from "@/world/tilemap/TilesetManager";
import { LayerManager } from "@/world/tilemap/LayerManager";
import { GameLayer } from "@/world/tilemap/GameLayer";

export class PhaserTilemapAdapter {
  private scene: Scene;
  private map: Phaser.Tilemaps.Tilemap | null = null;
  private tilesetManager: TilesetManager;
  private layerManager: LayerManager;

  constructor(
    scene: Scene,
    tilesetManager: TilesetManager,
    layerManager: LayerManager,
  ) {
    this.scene = scene;
    this.tilesetManager = tilesetManager;
    this.layerManager = layerManager;
  }

  /**
   * The core method linking the decoupled architecture into Phaser's tilemap system.
   *
   * @param mapKey The string key assigned to the mapped JSON data via Phaser loader.
   * @param mapData Expected to be normalized MapParser.parse() output or Phaser's MapData internally
   */
  createTilemapFromLoadedJson(
    mapKey: string,
    mapData: TilemapData,
  ): Phaser.Tilemaps.Tilemap {
    // Rely on Phaser for the core performance rendering pipeline
    this.map = this.scene.make.tilemap({ key: mapKey });

    if (!this.map) {
      throw new Error(
        `PhaserTilemapAdapter: Failed to make Tilemap with key '${mapKey}'`,
      );
    }

    // Connect pre-registered tileset textures
    const phaserTilesets = this.tilesetManager.addTilesetsToMap(
      this.map,
      mapData.tilesets,
    );

    // Iteratively build layers wrapped within the GameLayer structure
    // Tiled data layers dictate our rendering loops
    mapData.layers.forEach((layerData) => {
      // By checking type we support extendibility (e.g object groups later)
      if (layerData.type === "tilelayer") {
        const phaserLayer = this.map!.createLayer(
          layerData.name,
          phaserTilesets,
          layerData.x ?? 0,
          layerData.y ?? 0,
        );

        if (phaserLayer) {
          phaserLayer.setAlpha(layerData.opacity ?? 1);
          phaserLayer.setVisible(layerData.visible ?? true);

          const gameLayer = new GameLayer(layerData.name, phaserLayer);
          this.layerManager.addLayer(layerData.name, gameLayer);
        } else {
          console.warn(
            `PhaserTilemapAdapter: Failed creating Phaser layer for '${layerData.name}'`,
          );
        }
      } else if (layerData.type === "objectgroup") {
        console.log(
          `PhaserTilemapAdapter: Identified object layer '${layerData.name}' - object spawning system pending implementation.`,
        );
      }
    });

    return this.map;
  }

  getPhaserMap(): Phaser.Tilemaps.Tilemap | null {
    return this.map;
  }
}
