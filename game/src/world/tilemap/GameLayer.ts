export class GameLayer {
  name: string;
  phaserLayer: Phaser.Tilemaps.TilemapLayer;

  constructor(name: string, layer: Phaser.Tilemaps.TilemapLayer) {
    this.name = name;
    this.phaserLayer = layer;
  }

  /**
   * Toggles the visibility of this layer.
   *
   * @param isVisible whether the layer should be visible
   */
  setVisible(isVisible: boolean): void {
    this.phaserLayer.setVisible(isVisible);
  }

  /**
   * Sets the Z-index depth of the layer in the rendering pipeline.
   *
   * @param depth Z-index to set the layer to
   */
  setDepth(depth: number): void {
    this.phaserLayer.setDepth(depth);
  }

  /**
   * Sets the rendering scale of the layer.
   *
   * @param scale scale factor to apply
   */
  setScale(scale: number): void {
    this.phaserLayer.setScale(scale);
  }

  /**
   * Enables collision on specific tiles or a range of tiles within this layer.
   * This delegates directly to Phaser's TilemapLayer collision methods.
   *
   * @param tileFlags IDs or array of IDs to collide with
   * @param collides Whether collision is enabled
   */
  setCollision(tileFlags: number | number[], collides: boolean = true): void {
    this.phaserLayer.setCollision(tileFlags, collides);
  }

  /**
   * Enables collision on all tiles within this layer.
   */
  setCollisionByExclusion(exclusions: number[] = [-1]): void {
    this.phaserLayer.setCollisionByExclusion(exclusions);
  }

  /**
   * Returns the underlying Phaser TilemapLayer. Use this strictly when
   * you absolutely need Phaser-specific features not wrapped by GameLayer.
   */
  getPhaserLayer(): Phaser.Tilemaps.TilemapLayer {
    return this.phaserLayer;
  }
}
