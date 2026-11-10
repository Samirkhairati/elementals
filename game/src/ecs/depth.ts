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

/** A box in map pixels (left < right, top < bottom). */
export interface DepthRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const overlaps = (a: DepthRect, b: DepthRect): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Where characters stand among the y-sorted pictures of a map. The pictures keep their own draw order (layer z, then
 * the layer's order); inside the characters' depth band each one gets a fixed depth in that order. A character is
 * behind a picture whose anchor is at or below its feet and in front of the rest, but only for the pictures it
 * actually overlaps on screen: a picture it does not touch cannot hide it or be hidden by it, so it does not count.
 * That is what lets a character be in front of one building and behind another that was drawn before it.
 * When the pictures it does overlap still disagree (their order and their y), one depth cannot satisfy them all, so
 * it takes the place in the order where the fewest of them are wrong (ties: the earliest place).
 */
export class YSortField {
  private band = 0;
  /** Anchor y of each picture in draw order. */
  private ys: number[] = [];
  /** Screen box of each picture, same order (none: every picture counts for every character). */
  private rects: (DepthRect | undefined)[] = [];

  /** The pictures' anchor ys (and boxes) in their draw order, and the depth band the characters stand in. */
  public set(band: number, ys: readonly number[], rects?: readonly DepthRect[]): void {
    this.band = band;
    this.ys = [...ys];
    this.rects = rects ? [...rects] : [];
  }

  public clear(): void {
    this.ys = [];
    this.rects = [];
  }

  public get count(): number {
    return this.ys.length;
  }

  /** Fixed depth of the picture at `index` in the draw order. */
  public pictureDepth(index: number): number {
    return this.band + (index + 1) / (this.ys.length + 1);
  }

  /** Place (0..n) in `order` (indices into the pictures) with the fewest wrong pictures for a character at `y`; slot j = after the j-th. */
  private bestPlace(y: number, order: readonly number[]): number {
    let wrong = 0;
    for (const k of order) if (this.ys[k] < y) wrong++;
    let best = wrong;
    let place = 0;
    for (let j = 0; j < order.length; j++) {
      wrong += this.ys[order[j]] < y ? -1 : 1;
      if (wrong < best) {
        best = wrong;
        place = j + 1;
      }
    }
    return place;
  }

  /**
   * Depth of a character (or anything with a Transform depth) standing at `y`; `box` is the screen box of its
   * sprite, so only the pictures it overlaps decide where it stands.
   */
  public entityDepth(depth: number, y: number, box?: DepthRect): number {
    const n = this.ys.length;
    if (n === 0 || depth !== this.band) return sortDepth(depth, y);
    const all = Array.from({ length: n }, (_, k) => k);
    // Where plain y-sorting against every picture would put it: keeps characters in y order when nothing overlaps.
    const natural = this.bestPlace(y, all);
    let slot = natural;
    if (box && this.rects.length === n) {
      const touched = all.filter((k) => overlaps(box, this.rects[k]!));
      if (touched.length > 0) {
        const j = this.bestPlace(y, touched);
        // Any slot between the neighbours it must stay between is equal for the pictures it touches; take the
        // one closest to the natural one.
        const low = j === 0 ? 0 : touched[j - 1] + 1;
        const high = j === touched.length ? n : touched[j];
        slot = Math.min(Math.max(natural, low), high);
      }
    }
    // Inside the gap, characters still sort by y among themselves (strictly between its two pictures).
    const within = 0.005 + 0.99 * Math.min(Math.max(y, 0) / Y_SORT_RANGE, 1);
    return this.band + (slot + within) / (n + 1);
  }
}
