import { describe, it, expect, vi } from 'vitest';
import { SpatialSystem } from './SpatialSystem';
import { World } from '../World';
import { TransformComponent } from '../components/TransformComponent';
import { ColliderComponent } from '../components/ColliderComponent';
import type { CollisionSystem } from '@/world/CollisionSystem';

function stubCollision(walkable: (x: number, y: number) => boolean = () => true) {
  const stub = { isWalkable: vi.fn(walkable), setMap: vi.fn() };
  return { stub, collision: stub as unknown as CollisionSystem };
}

function addBox(world: World, x: number, y: number, init: { width?: number; height?: number; isSolid?: boolean } = {}) {
  const e = world.createEntity();
  world.addComponent(e, new TransformComponent({ x, y }));
  world.addComponent(e, new ColliderComponent(init));
  return e;
}

describe('SpatialSystem.isWalkable', () => {
  it('defers to static tile collision first', () => {
    const { collision, stub } = stubCollision((x) => x < 100);
    const s = new SpatialSystem(collision);
    expect(s.isWalkable(50, 50)).toBe(true);
    expect(s.isWalkable(150, 50)).toBe(false);
    expect(stub.isWalkable).toHaveBeenCalledWith(150, 50);
  });

  it('is walkable when there is no world to check dynamic colliders against', () => {
    const s = new SpatialSystem(stubCollision().collision);
    expect(s.isWalkable(10, 10)).toBe(true);
  });

  it('blocks points inside a solid collider box (bottom-centre anchored)', () => {
    const w = new World();
    // collider 16x8 at (100,100): x in [92,108], y in [92,100]
    addBox(w, 100, 100, { width: 16, height: 8 });
    const s = new SpatialSystem(stubCollision().collision);
    expect(s.isWalkable(100, 100, undefined, w)).toBe(false);
    expect(s.isWalkable(92, 93, undefined, w)).toBe(false); // left/right/bottom edges are inclusive
    expect(s.isWalkable(92, 92, undefined, w)).toBe(true); // the top edge is exclusive
    expect(s.isWalkable(108, 100, undefined, w)).toBe(false);
    expect(s.isWalkable(109, 100, undefined, w)).toBe(true);
    expect(s.isWalkable(100, 101, undefined, w)).toBe(true);
    expect(s.isWalkable(100, 91, undefined, w)).toBe(true);
  });

  it('applies collider offsets', () => {
    const w = new World();
    const e = addBox(w, 100, 100, { width: 16, height: 8 });
    const c = w.getComponent(e, ColliderComponent)!;
    c.offsetX = 32;
    const s = new SpatialSystem(stubCollision().collision);
    expect(s.isWalkable(100, 100, undefined, w)).toBe(true);
    expect(s.isWalkable(132, 100, undefined, w)).toBe(false);
  });

  it('ignores non-solid colliders and the ignored entity', () => {
    const w = new World();
    const solid = addBox(w, 100, 100);
    addBox(w, 200, 100, { isSolid: false });
    const s = new SpatialSystem(stubCollision().collision);
    expect(s.isWalkable(100, 100, solid, w)).toBe(true);
    expect(s.isWalkable(100, 100, undefined, w)).toBe(false);
    expect(s.isWalkable(200, 100, undefined, w)).toBe(true);
  });

  it('uses the world seen in update() when no override is given', () => {
    const w = new World();
    addBox(w, 100, 100);
    const s = new SpatialSystem(stubCollision().collision);
    expect(s.isWalkable(100, 100)).toBe(true);
    s.update(w, 16);
    expect(s.isWalkable(100, 100)).toBe(false);
  });

  it('static collision short-circuits the dynamic check', () => {
    const w = new World();
    const { collision } = stubCollision(() => false);
    const s = new SpatialSystem(collision);
    expect(s.isWalkable(1, 1, undefined, w)).toBe(false);
  });
});

describe('SpatialSystem one-tile colliders', () => {
  it('a 32x32 solid does not block the bottom-centre of the tile above it, but blocks its own tile', () => {
    const w = new World();
    addBox(w, 48, 64, { width: 32, height: 32 }); // tile (1,1): x 32..64, y 32..64
    const s = new SpatialSystem(stubCollision().collision);
    expect(s.isWalkable(48, 64, undefined, w)).toBe(false); // own tile
    expect(s.isWalkable(48, 32, undefined, w)).toBe(true); // tile above (0 + bottom-centre)
    expect(s.isWalkable(48, 96, undefined, w)).toBe(true); // tile below
    expect(s.isWalkable(16, 64, undefined, w)).toBe(true); // tile left
    expect(s.isWalkable(80, 64, undefined, w)).toBe(true); // tile right
  });
});

describe('SpatialSystem.canMoveTo', () => {
  it('requires all five sample points to be walkable', () => {
    const { collision, stub } = stubCollision();
    const s = new SpatialSystem(collision);
    expect(s.canMoveTo(100, 100, 8, 4)).toBe(true);
    expect(stub.isWalkable).toHaveBeenCalledTimes(5);
    const sampled = stub.isWalkable.mock.calls.map(([x, y]) => `${x},${y}`).sort();
    expect(sampled).toEqual(['100,100', '92,100', '108,100', '92,96', '108,96'].sort());
  });

  it('fails if any corner is blocked', () => {
    const { collision } = stubCollision((x, y) => !(x === 92 && y === 96));
    expect(new SpatialSystem(collision).canMoveTo(100, 100, 8, 4)).toBe(false);
  });
});

describe('SpatialSystem.setMap', () => {
  it('forwards a map to collision but ignores null', () => {
    const { collision, stub } = stubCollision();
    const s = new SpatialSystem(collision);
    s.setMap(null);
    expect(stub.setMap).not.toHaveBeenCalled();
    const map = {} as never;
    s.setMap(map);
    expect(stub.setMap).toHaveBeenCalledWith(map);
  });
});
