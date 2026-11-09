import { describe, it, expect } from 'vitest';
import { CollisionSystem } from './CollisionSystem';

const fakeMap = (w = 640, h = 640) =>
  ({
    widthInPixels: w,
    heightInPixels: h,
    getLayer: () => null,
  }) as unknown as Phaser.Tilemaps.Tilemap;

const square = { id: 's', closed: true, points: [{ x: 100, y: 100 }, { x: 150, y: 100 }, { x: 150, y: 150 }, { x: 100, y: 150 }] };
const wall = { id: 'w', closed: false, points: [{ x: 200, y: 0 }, { x: 200, y: 300 }] };

describe('CollisionSystem shapes', () => {
  it('blocks points inside a closed polygon, the bottom edge counting as the cell above', () => {
    const c = new CollisionSystem();
    const map = fakeMap();
    c.setMap(map);
    c.setShapes([square]);
    expect(c.isWalkable(125, 125)).toBe(false);
    expect(c.isWalkable(125, 200)).toBe(true);
    expect(c.isWalkable(125, 100)).toBe(true); // y-1 is just above the top
    expect(c.isWalkable(125, 150)).toBe(false); // y-1 = 149 is inside
  });

  it('open lines have no inside', () => {
    const c = new CollisionSystem();
    c.setMap(fakeMap());
    c.setShapes([wall]);
    expect(c.isWalkable(200, 100)).toBe(true);
  });

  it('a wall stops a mover walking into it, not one walking alongside, and lets one standing on it step off', () => {
    const c = new CollisionSystem();
    c.setMap(fakeMap());
    c.setShapes([wall]);
    expect(c.shapesBlockMove(180, 100, 195, 100, 8, 4)).toBe(true);
    expect(c.shapesBlockMove(150, 100, 150, 120, 8, 4)).toBe(false);
    expect(c.shapesBlockMove(200, 100, 190, 100, 8, 4)).toBe(false);
  });

  it('clears the shapes when the map changes but keeps them for the same map', () => {
    const c = new CollisionSystem();
    const map = fakeMap();
    c.setMap(map);
    c.setShapes([wall]);
    c.setMap(map);
    expect(c.shapesBlockMove(180, 100, 195, 100, 8, 4)).toBe(true);
    c.setMap(fakeMap());
    expect(c.shapesBlockMove(180, 100, 195, 100, 8, 4)).toBe(false);
  });

  it('keeps the pixel size when the same map is set again without one', () => {
    const c = new CollisionSystem();
    const map = fakeMap(640, 640);
    c.setMap(map, { width: 100, height: 100 });
    expect(c.isWalkable(150, 50)).toBe(false);
    c.setMap(map);
    expect(c.isWalkable(150, 50)).toBe(false);
    c.setMap(fakeMap(640, 640));
    expect(c.isWalkable(150, 50)).toBe(true);
  });
});
