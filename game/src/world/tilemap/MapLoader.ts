import { Scene } from "phaser";

export class MapLoader {
  /**
   * Loads a Tiled JSON map directly using Phaser's loader.
   * This should be called directly in the preload() method of a Scene.
   *
   * @param scene The Phaser Scene where preload is occurring
   * @param key The key to store the map data under
   * @param url The path to the .tmj or .json Tiled map file
   */
  static preloadMap(scene: Scene, key: string, url: string): void {
    scene.load.tilemapTiledJSON(key, url);
  }

  /**
   * Fetches and parses a JSON map from a URL manually (useful if bypassing Phaser's loader).
   */
  static async fetchMapDetails(url: string): Promise<any> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load tilemap data from ${url}`);
    }
    return response.json();
  }
}
