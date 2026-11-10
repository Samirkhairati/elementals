import { describe, expect, it } from "vitest";
import { YSortField, sortDepth } from "./depth";

describe("YSortField", () => {
  it("without pictures (or at another depth) a character sorts by its y like any sprite", () => {
    const f = new YSortField();
    expect(f.entityDepth(20, 100)).toBe(sortDepth(20, 100));
    f.set(20, [100]);
    expect(f.entityDepth(10, 100)).toBe(sortDepth(10, 100));
  });

  it("a character is behind the pictures whose anchor is at or below its feet and in front of the rest", () => {
    const f = new YSortField();
    f.set(20, [100, 200, 300]);
    const p = [0, 1, 2].map((i) => f.pictureDepth(i));
    expect(f.entityDepth(20, 50)).toBeLessThan(p[0]);
    expect(f.entityDepth(20, 100)).toBeLessThan(p[0]); // on the line: the picture draws over it
    expect(f.entityDepth(20, 150)).toBeGreaterThan(p[0]);
    expect(f.entityDepth(20, 150)).toBeLessThan(p[1]);
    expect(f.entityDepth(20, 250)).toBeGreaterThan(p[1]);
    expect(f.entityDepth(20, 250)).toBeLessThan(p[2]);
    expect(f.entityDepth(20, 301)).toBeGreaterThan(p[2]);
    for (const y of [0, 50, 150, 250, 400]) {
      expect(f.entityDepth(20, y)).toBeGreaterThan(20);
      expect(f.entityDepth(20, y)).toBeLessThan(21);
    }
  });

  it("characters in the same gap still sort by y among themselves, and by y overall", () => {
    const f = new YSortField();
    f.set(20, [100, 200]);
    expect(f.entityDepth(20, 120)).toBeLessThan(f.entityDepth(20, 160));
    const ys = [10, 99, 100, 101, 150, 200, 201, 500];
    const depths = ys.map((y) => f.entityDepth(20, y));
    expect([...depths].sort((a, b) => a - b)).toEqual(depths);
  });

  it("one picture whose y disagrees with the draw order does not decide for the ones drawn after it", () => {
    const f = new YSortField();
    // A low-standing picture drawn early (y 784), then buildings (y 300, 400) and a prop (y 735), drawn later.
    f.set(20, [784, 300, 400, 735]);
    const p = [0, 1, 2, 3].map((i) => f.pictureDepth(i));
    // At y 500 it is below both buildings (in front of them) though it is above the early picture: in front of the
    // buildings wins over being behind the early picture, which is wrong for it alone.
    expect(f.entityDepth(20, 500)).toBeGreaterThan(p[2]);
    expect(f.entityDepth(20, 500)).toBeLessThan(p[3]);
    // Below everything: in front of all.
    expect(f.entityDepth(20, 900)).toBeGreaterThan(p[3]);
  });

  it("pictures in draw order never reorder; with a tie a character goes behind the earliest picture it should be behind", () => {
    const f = new YSortField();
    // Drawn in this order: a building (y 300), then a bush that stands higher up (y 100).
    f.set(20, [300, 100]);
    expect(f.pictureDepth(0)).toBeLessThan(f.pictureDepth(1));
    // At y 200 it is behind the building and in front of the bush: cannot be both; it stays behind the building.
    expect(f.entityDepth(20, 200)).toBeLessThan(f.pictureDepth(0));
    // Below both it is in front of both.
    expect(f.entityDepth(20, 350)).toBeGreaterThan(f.pictureDepth(1));
  });

  it("only the pictures a character overlaps on screen decide: in front of one building, behind an earlier one far away", () => {
    const f = new YSortField();
    // Drawn in this order: a far-left building (anchor 537), then a building on the right (anchor 369).
    f.set(20, [537, 369], [
      { left: 0, top: 100, right: 150, bottom: 537 },
      { left: 400, top: 36, right: 560, bottom: 369 },
    ]);
    const p = [0, 1].map((i) => f.pictureDepth(i));
    // Below the right building (y 400) and overlapping only it: in front of it, though the far one is drawn first.
    const nearRight = { left: 450, top: 368, right: 480, bottom: 400 };
    expect(f.entityDepth(20, 400, nearRight)).toBeGreaterThan(p[1]);
    // Above its anchor (y 300), inside it: behind it.
    expect(f.entityDepth(20, 300, { left: 450, top: 268, right: 480, bottom: 300 })).toBeLessThan(p[1]);
    // Overlapping the far-left building above its anchor: behind it.
    expect(f.entityDepth(20, 450, { left: 50, top: 418, right: 80, bottom: 450 })).toBeLessThan(p[0]);
    // Touching neither: plain y order against all of them, as without boxes.
    expect(f.entityDepth(20, 450, { left: 250, top: 418, right: 280, bottom: 450 })).toBe(f.entityDepth(20, 450));
  });
});
