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

  it("pictures in draw order never reorder; a character goes behind the first picture it should be behind", () => {
    const f = new YSortField();
    // Drawn in this order: a building (y 300), then a bush that stands higher up (y 100).
    f.set(20, [300, 100]);
    expect(f.pictureDepth(0)).toBeLessThan(f.pictureDepth(1));
    // At y 200 it is behind the building and in front of the bush: cannot be both; it stays behind the building.
    expect(f.entityDepth(20, 200)).toBeLessThan(f.pictureDepth(0));
    // Below both it is in front of both.
    expect(f.entityDepth(20, 350)).toBeGreaterThan(f.pictureDepth(1));
  });
});
