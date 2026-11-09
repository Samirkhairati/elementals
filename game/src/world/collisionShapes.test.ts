import { describe, it, expect } from 'vitest';
import { readCollisionShapes } from './collisionShapes';

const layer = (props: unknown[], objects: unknown[], extra: object = {}) => ({
  id: 3,
  type: 'objectgroup',
  properties: props,
  objects,
  ...extra,
});
const kind = (v: string) => [{ name: 'kind', type: 'string', value: v }];

describe('readCollisionShapes', () => {
  it('reads polygons (closed) and polylines (open) in world pixels', () => {
    const raw = {
      layers: [
        layer(kind('collision'), [
          { id: 1, x: 10, y: 20, polygon: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }] },
          { id: 2, x: 100, y: 50, polyline: [{ x: 0, y: 0 }, { x: 0, y: 64 }] },
        ]),
      ],
    };
    expect(readCollisionShapes(raw)).toEqual([
      { id: '3:1', closed: true, points: [{ x: 10, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 50 }] },
      { id: '3:2', closed: false, points: [{ x: 100, y: 50 }, { x: 100, y: 114 }] },
    ]);
  });

  it('applies layer offsets and ignores visibility', () => {
    const raw = { layers: [layer(kind('collision'), [{ id: 1, x: 0, y: 0, polyline: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }], { visible: false, offsetx: 8, offsety: 4 })] };
    expect(readCollisionShapes(raw)[0].points).toEqual([{ x: 8, y: 4 }, { x: 13, y: 4 }]);
  });

  it('skips other layers and unusable shapes', () => {
    const raw = {
      layers: [
        layer(kind('image'), [{ id: 1, x: 0, y: 0, polyline: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }]),
        { type: 'tilelayer' },
        layer(kind('collision'), [
          { id: 1, x: 0, y: 0, polygon: [{ x: 0, y: 0 }, { x: 5, y: 0 }] },
          { id: 2, x: 0, y: 0, polyline: [{ x: 0, y: 0 }] },
          { id: 3, x: 0, y: 0 },
          'junk',
        ]),
      ],
    };
    expect(readCollisionShapes(raw)).toEqual([]);
    expect(readCollisionShapes(null)).toEqual([]);
  });
});
