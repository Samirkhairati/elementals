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

/**
 * Where characters stand among the y-sorted pictures of a map. The pictures keep their own draw order (layer z, then
 * the layer's order); inside the characters' depth band each one gets a fixed depth in that order. A character is
 * behind a picture whose anchor is at or below its feet and in front of the rest. When the pictures' order and y
 * agree that is exact. When they disagree (a picture drawn early stands lower than ones drawn after it) one depth
 * cannot satisfy every picture, so the character takes the place in the order where the fewest pictures are wrong
 * (ties: the earliest place), instead of letting one odd picture decide for all the ones drawn after it.
 */
export class YSortField {
  private band = 0;
  /** Anchor y of each picture in draw order. */
  private ys: number[] = [];

  /** The pictures' anchor ys in their draw order, and the depth band the characters stand in. */
  public set(band: number, ys: readonly number[]): void {
    this.band = band;
    this.ys = [...ys];
  }

  public clear(): void {
    this.ys = [];
  }

  public get count(): number {
    return this.ys.length;
  }

  /** Fixed depth of the picture at `index` in the draw order. */
  public pictureDepth(index: number): number {
    return this.band + (index + 1) / (this.ys.length + 1);
  }

  /** Depth of a character (or anything with a Transform depth) standing at `y`. */
  public entityDepth(depth: number, y: number): number {
    if (this.ys.length === 0 || depth !== this.band) return sortDepth(depth, y);
    // Slot k = between picture k-1 and k. Start behind every picture (slot 0): each picture with its anchor above the
    // feet is then wrong. Stepping past a picture puts the character in front of it: that fixes the ones above its
    // feet and breaks the others.
    let wrong = 0;
    for (const py of this.ys) if (py < y) wrong++;
    let best = wrong;
    let lo = 0;
    for (let k = 0; k < this.ys.length; k++) {
      wrong += this.ys[k] < y ? -1 : 1;
      if (wrong < best) {
        best = wrong;
        lo = k + 1;
      }
    }
    // Inside the gap, characters still sort by y among themselves (strictly between its two pictures).
    const within = 0.005 + 0.99 * Math.min(Math.max(y, 0) / Y_SORT_RANGE, 1);
    return this.band + (lo + within) / (this.ys.length + 1);
  }
}
