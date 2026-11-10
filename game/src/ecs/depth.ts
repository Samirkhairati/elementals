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
 * the layer's order); inside the characters' depth band each one gets a fixed depth in that order. A character goes
 * between them by comparing its y with each picture's anchor y: it is behind a picture whose anchor is at or below
 * its feet, in front of the rest. When the pictures' order and y disagree (a picture drawn later stands higher up
 * than one drawn earlier) one character cannot satisfy both: it goes behind the first (lowest in draw order) picture
 * it should be behind, so it is never drawn through a picture it is walking behind.
 */
export class YSortField {
  private band = 0;
  /** Anchor y of each picture in draw order, and the running maximum of those (non-decreasing, for the search). */
  private ys: number[] = [];
  private maxUpTo: number[] = [];

  /** The pictures' anchor ys in their draw order, and the depth band the characters stand in. */
  public set(band: number, ys: readonly number[]): void {
    this.band = band;
    this.ys = [...ys];
    let max = -Infinity;
    this.maxUpTo = this.ys.map((y) => (max = Math.max(max, y)));
  }

  public clear(): void {
    this.ys = [];
    this.maxUpTo = [];
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
    // The first picture the character is behind (its anchor at or below the character's feet).
    let lo = 0;
    let hi = this.maxUpTo.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.maxUpTo[mid] >= y) hi = mid;
      else lo = mid + 1;
    }
    // Inside the gap, characters still sort by y among themselves (strictly between its two pictures).
    const within = 0.005 + 0.99 * Math.min(Math.max(y, 0) / Y_SORT_RANGE, 1);
    return this.band + (lo + within) / (this.ys.length + 1);
  }
}
