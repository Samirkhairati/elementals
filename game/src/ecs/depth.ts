// Draw depths shared by the sprites of entities and the y-sorted pictures of image layers.

/**
 * Draw order of a sprite: the Transform `depth` picks the layer (characters 20, objects 10, ...), and inside a
 * layer whatever stands further down the screen draws on top, so a character walking behind another one is hidden
 * by it and the one in front covers the other's feet. The y part stays below 1, so it never crosses a layer.
 */
const Y_SORT_RANGE = 100000;
export function sortDepth(depth: number, y: number): number {
  return depth + Math.min(Math.max(y, 0) / Y_SORT_RANGE, 0.999);
}
