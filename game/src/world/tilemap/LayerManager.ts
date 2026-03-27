import { GameLayer } from "./GameLayer";

export class LayerManager {
  private layers: Map<string, GameLayer> = new Map();

  /**
   * Registers a newly created GameLayer wrapper to the manager.
   * @param name Name of the layer
   * @param layer The GameLayer instance
   */
  addLayer(name: string, layer: GameLayer): void {
    if (this.layers.has(name)) {
      console.warn(`LayerManager: Overwriting existing layer mapping for '${name}'`);
    }
    this.layers.set(name, layer);
  }

  /**
   * Returns the GameLayer instance by its name.
   */
  getLayer(name: string): GameLayer | undefined {
    return this.layers.get(name);
  }

  /**
   * Returns an array of all layers registered in the manager.
   */
  getAllLayers(): GameLayer[] {
    return Array.from(this.layers.values());
  }

  /**
   * Exposes a utility to toggle visibility across all layers.
   */
  setAllVisible(isVisible: boolean): void {
    this.layers.forEach((layer) => layer.setVisible(isVisible));
  }
}
