import { describe, expect, it } from 'vitest';
import { coversTile, footprint, tileOfAnchor } from './footprint';

describe('footprint', () => {
  it('a tile-based entity without a collider covers the tile of its anchor', () => {
    expect(footprint({ x: 48, y: 64 }, undefined)).toEqual({ minCol: 1, maxCol: 1, minRow: 1, maxRow: 1 });
  });

  it('a free entity covers every tile its pixel box touches, however small or off-grid', () => {
    // a 10x10 box standing on (100, 70): spans x 95..105 (tile 2 and 3), y 60..70 (tile 1 and 2)
    const range = footprint({ x: 100, y: 70 }, { width: 10, height: 10, offsetX: 0, offsetY: 0 });
    expect(range).toEqual({ minCol: 2, maxCol: 3, minRow: 1, maxRow: 2 });
    expect(coversTile(range, { col: 3, row: 2 })).toBe(true);
    expect(coversTile(range, { col: 4, row: 2 })).toBe(false);
  });

  it('a box that ends exactly on a tile line does not leak into the next tile', () => {
    // 64x32 on tile anchor (64, 64) with offsetX 0 spans x 32..96: tiles 1 and 2 only
    const range = footprint({ x: 64, y: 64 }, { width: 64, height: 32, offsetX: 0, offsetY: 0 });
    expect(range).toEqual({ minCol: 1, maxCol: 2, minRow: 1, maxRow: 1 });
  });

  it('a large free box covers a block of tiles', () => {
    const range = footprint({ x: 200, y: 200 }, { width: 100, height: 50, offsetX: 10, offsetY: -5 });
    expect(range).toEqual({ minCol: 5, maxCol: 8, minRow: 4, maxRow: 6 });
  });

  it('tileOfAnchor puts the anchor on the bottom edge of its tile', () => {
    expect(tileOfAnchor(48, 64)).toEqual({ col: 1, row: 1 });
  });
});
