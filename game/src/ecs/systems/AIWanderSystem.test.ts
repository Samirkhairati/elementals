import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('phaser', async () => {
  const { EventEmitter } = await import('node:events');
  return { Events: { EventEmitter } };
});

import { AIWanderSystem } from './AIWanderSystem';
import type { WalkabilityQuery } from './AIWanderSystem';
import { MovementSystem } from './MovementSystem';
import { SpatialSystem } from './SpatialSystem';
import { World } from '../World';
import { TransformComponent } from '../components/TransformComponent';
import { GridMovementComponent } from '../components/GridMovementComponent';
import { AIWanderComponent } from '../components/AIWanderComponent';
import { PlayerControlComponent } from '../components/PlayerControlComponent';
import { Direction } from '@/utils/Direction';
import { gameState } from '@/core/GameState';
import { settingsStore } from '@/core/SettingsStore';
import type { CollisionSystem } from '@/world/CollisionSystem';

const TS = 32;
const px = (tx: number) => tx * TS + TS / 2;
const py = (ty: number) => (ty + 1) * TS;
const tileOf = (x: number, y: number) => [Math.floor(x / TS), Math.floor((y - 1) / TS)] as const;

/** Walkability stub over tile coordinates (sample point is bottom-centre of the tile). */
function walkability(blocked: Array<[number, number]> = []): WalkabilityQuery & { isWalkable: ReturnType<typeof vi.fn> } {
  const set = new Set(blocked.map(([x, y]) => `${x},${y}`));
  return {
    isWalkable: vi.fn((x: number, y: number) => {
      const [tx, ty] = tileOf(x, y);
      return !set.has(`${tx},${ty}`);
    }),
  };
}

interface NpcOpts {
  tx?: number;
  ty?: number;
  radius?: number;
  interval?: number;
  speed?: number;
}

function addNpc(world: World, o: NpcOpts = {}) {
  const e = world.createEntity();
  const transform = world.addComponent(e, new TransformComponent({ x: px(o.tx ?? 10), y: py(o.ty ?? 10) }));
  const grid = world.addComponent(e, new GridMovementComponent({ speed: 999 }));
  const wander = world.addComponent(
    e,
    new AIWanderComponent({ radius: o.radius ?? 2, interval: o.interval ?? 1000, speed: o.speed ?? 60 }),
  );
  return { e, transform, grid, wander };
}

/** rng that yields the given sequence then repeats the last value. */
function seq(...values: number[]) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

// Direction option order produced by the system: UP, DOWN, LEFT, RIGHT.
// With all four walkable, rng value r picks index floor(r * 4).
const PICK = { UP: 0, DOWN: 0.3, LEFT: 0.55, RIGHT: 0.8 };

beforeEach(() => {
  settingsStore.tileBasedMovement = true;
  gameState.setInputLocked(false);
});
afterEach(() => {
  settingsStore.tileBasedMovement = true;
  gameState.setInputLocked(false);
});

describe('AIWanderSystem decision logic', () => {
  it('waits for the interval, then requests exactly one step with the component speed', () => {
    const world = new World();
    const { grid } = addNpc(world, { interval: 1000, speed: 60 });
    // first rng call = start-up jitter (0 => full interval ahead), second = direction (RIGHT)
    world.addSystem(new AIWanderSystem(walkability(), seq(0, PICK.RIGHT)));

    world.update(0);
    world.update(500);
    expect(grid.pendingDirection).toBeNull();
    world.update(499);
    expect(grid.pendingDirection).toBeNull();
    world.update(1);
    expect(grid.pendingDirection).toBe(Direction.RIGHT);
    expect(grid.holdDuration).toBeGreaterThan(grid.moveThreshold);
    expect(grid.speed).toBe(60);
    expect(grid.movementType).toBe('walk');
  });

  it('clears the intent on the next tick and restarts the interval', () => {
    const world = new World();
    const { grid, wander } = addNpc(world, { interval: 1000 });
    world.addSystem(new AIWanderSystem(walkability(), seq(0, PICK.LEFT)));
    world.update(0);
    world.update(1000);
    expect(grid.pendingDirection).toBe(Direction.LEFT);
    world.update(16);
    expect(grid.pendingDirection).toBeNull();
    expect(wander.timer).toBe(16);
  });

  it('desynchronises the first move using the rng jitter', () => {
    const world = new World();
    const { grid } = addNpc(world, { interval: 1000 });
    world.addSystem(new AIWanderSystem(walkability(), seq(0.75, PICK.UP)));
    world.update(0); // timer starts at 750
    world.update(249);
    expect(grid.pendingDirection).toBeNull();
    world.update(1);
    expect(grid.pendingDirection).toBe(Direction.UP);
  });

  it('captures the home tile once, from the first update', () => {
    const world = new World();
    const { transform, wander } = addNpc(world, { tx: 7, ty: 9 });
    world.addSystem(new AIWanderSystem(walkability(), seq(0)));
    world.update(0);
    expect([wander.originX, wander.originY]).toEqual([px(7), py(9)]);
    expect(wander.homeInitialized).toBe(true);
    transform.x = px(8);
    world.update(10);
    expect(wander.originX).toBe(px(7));
  });

  it('never picks a direction that leaves the radius around the home tile', () => {
    // radius 1, NPC sits on the right edge of its box: RIGHT must never be chosen
    for (const r of [0, 0.2, 0.34, 0.5, 0.67, 0.8, 0.99]) {
      const world = new World();
      const { grid, wander, transform: t } = addNpc(world, { tx: 10, ty: 10, radius: 1, interval: 100 });
      world.addSystem(new AIWanderSystem(walkability(), seq(0, r)));
      world.update(0); // capture home at (10,10)
      t.x = px(11); // right edge of the radius box
      wander.timer = 0;
      world.update(100);
      expect(grid.pendingDirection, `rng=${r}`).not.toBeNull();
      expect(grid.pendingDirection, `rng=${r}`).not.toBe(Direction.RIGHT);
    }
  });

  it('does not move at all when the radius leaves no legal step (radius 0)', () => {
    const world = new World();
    const { grid } = addNpc(world, { radius: 0, interval: 100 });
    world.addSystem(new AIWanderSystem(walkability(), seq(0)));
    world.update(0);
    for (let i = 0; i < 20; i++) {
      world.update(100);
      expect(grid.pendingDirection).toBeNull();
    }
  });

  it('never picks a blocked target tile', () => {
    // block UP, DOWN and LEFT of (10,10): only RIGHT is legal whatever the rng says
    for (const r of [0, 0.3, 0.55, 0.8, 0.99]) {
      const world = new World();
      const { grid } = addNpc(world, { interval: 100 });
      const w = walkability([[10, 9], [10, 11], [9, 10]]);
      world.addSystem(new AIWanderSystem(w, seq(0, r)));
      world.update(0);
      world.update(100);
      expect(grid.pendingDirection, `rng=${r}`).toBe(Direction.RIGHT);
    }
  });

  it('asks the walkability query about the bottom-centre of the target tile, ignoring itself', () => {
    const world = new World();
    const { e } = addNpc(world, { tx: 10, ty: 10, interval: 100 });
    const w = walkability();
    world.addSystem(new AIWanderSystem(w, seq(0, 0)));
    world.update(0);
    world.update(100);
    const calls = w.isWalkable.mock.calls.map(([x, y, ignore, wld]) => [x, y, ignore, wld]);
    expect(calls).toEqual([
      [px(10), py(9), e, world], // UP
      [px(10), py(11), e, world], // DOWN
      [px(9), py(10), e, world], // LEFT
      [px(11), py(10), e, world], // RIGHT
    ]);
  });

  it('skips the step (and waits another interval) when everything around is blocked', () => {
    const world = new World();
    const { grid, wander } = addNpc(world, { interval: 100 });
    const w = walkability([[10, 9], [10, 11], [9, 10], [11, 10]]);
    world.addSystem(new AIWanderSystem(w, seq(0)));
    world.update(0);
    world.update(100);
    expect(grid.pendingDirection).toBeNull();
    expect(wander.timer).toBe(0);
  });

  it('does not tick or act while the entity is already moving', () => {
    const world = new World();
    const { grid, wander } = addNpc(world, { interval: 100 });
    world.addSystem(new AIWanderSystem(walkability(), seq(0, PICK.UP)));
    world.update(0);
    grid.isMoving = true;
    world.update(10_000);
    expect(grid.pendingDirection).toBeNull();
    expect(wander.timer).toBe(0);
    grid.isMoving = false;
    world.update(100);
    expect(grid.pendingDirection).toBe(Direction.UP);
  });

  it('freezes while input is locked (dialogue / menu) and resumes afterwards', () => {
    const world = new World();
    const { grid, wander } = addNpc(world, { interval: 100 });
    world.addSystem(new AIWanderSystem(walkability(), seq(0, PICK.DOWN)));
    world.update(0);
    gameState.setInputLocked(true, 'dialogue');
    world.update(10_000);
    expect(grid.pendingDirection).toBeNull();
    expect(wander.timer).toBe(0);
    gameState.setInputLocked(false);
    world.update(100);
    expect(grid.pendingDirection).toBe(Direction.DOWN);
  });

  it('is inactive in free-movement mode', () => {
    const world = new World();
    const { grid } = addNpc(world, { interval: 100 });
    world.addSystem(new AIWanderSystem(walkability(), seq(0, PICK.DOWN)));
    settingsStore.tileBasedMovement = false;
    world.update(0);
    world.update(10_000);
    expect(grid.pendingDirection).toBeNull();
  });

  it('never drives the player, and ignores entities without GridMovement', () => {
    const world = new World();
    const player = addNpc(world, { interval: 100 });
    world.addComponent(player.e, new PlayerControlComponent());
    player.grid.pendingDirection = Direction.LEFT; // set by "input"
    const e2 = world.createEntity();
    world.addComponent(e2, new TransformComponent({ x: px(1), y: py(1) }));
    world.addComponent(e2, new AIWanderComponent({ interval: 100 }));
    world.addSystem(new AIWanderSystem(walkability(), seq(0)));
    world.update(0);
    world.update(1000);
    expect(player.grid.pendingDirection).toBe(Direction.LEFT);
    expect(player.wander.homeInitialized).toBe(false);
  });

  it('uses Math.random by default', () => {
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0);
    const world = new World();
    const { grid } = addNpc(world, { interval: 100 });
    world.addSystem(new AIWanderSystem(walkability()));
    world.update(0);
    world.update(100);
    expect(rand).toHaveBeenCalled();
    expect(grid.pendingDirection).toBe(Direction.UP);
    rand.mockRestore();
  });

  it('runs between InputSystem (200) and MovementSystem (300)', () => {
    const sys = new AIWanderSystem(walkability());
    expect(sys.priority).toBeGreaterThan(200);
    expect(sys.priority).toBeLessThan(300);
  });
});

describe('AIWanderSystem + MovementSystem integration', () => {
  function build(blocked: Array<[number, number]> = []) {
    const set = new Set(blocked.map(([x, y]) => `${x},${y}`));
    const collision = {
      isWalkable: (x: number, y: number) => {
        const [tx, ty] = tileOf(x, y);
        return !set.has(`${tx},${ty}`);
      },
      setMap: () => {},
    } as unknown as CollisionSystem;
    const spatial = new SpatialSystem(collision);
    const movement = new MovementSystem(spatial);
    const world = new World();
    return { world, spatial, movement };
  }

  // simple deterministic LCG
  function lcg(seed: number) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  }

  it('moves exactly one tile per wander and arrives tile-aligned', () => {
    const { world, spatial, movement } = build();
    const { transform, grid } = addNpc(world, { tx: 10, ty: 10, radius: 3, interval: 200, speed: 320 });
    world.addSystem(spatial);
    world.addSystem(new AIWanderSystem(spatial, seq(0, PICK.RIGHT)));
    world.addSystem(movement);

    world.update(0);
    for (let i = 0; i < 12; i++) world.update(16); // 192ms, not yet
    expect([transform.x, transform.y]).toEqual([px(10), py(10)]);
    expect(grid.isMoving).toBe(false);

    world.update(16);
    expect(grid.isMoving).toBe(true);
    expect(grid.direction).toBe(Direction.RIGHT);
    expect(grid.targetX).toBe(px(11));

    for (let i = 0; i < 8; i++) world.update(16); // 100ms step, next wander is 200ms away
    expect(grid.isMoving).toBe(false);
    expect([transform.x, transform.y]).toEqual([px(11), py(10)]);
    movement.destroy(world);
  });

  it('stays inside its radius and off blocked tiles over a long random walk', () => {
    const blocked: Array<[number, number]> = [[11, 10], [9, 9], [10, 12]];
    const { world, spatial, movement } = build(blocked);
    const rng = lcg(1234);
    const radius = 2;
    const npc = addNpc(world, { tx: 10, ty: 10, radius, interval: 100, speed: 320 });
    world.addSystem(spatial);
    world.addSystem(new AIWanderSystem(spatial, rng));
    world.addSystem(movement);

    const visited = new Set<string>();
    let moves = 0;
    let wasMoving = false;
    for (let i = 0; i < 4000; i++) {
      world.update(16);
      const [tx, ty] = tileOf(npc.transform.x, npc.transform.y);
      if (!npc.grid.isMoving) {
        visited.add(`${tx},${ty}`);
        expect(Math.abs(tx - 10)).toBeLessThanOrEqual(radius);
        expect(Math.abs(ty - 10)).toBeLessThanOrEqual(radius);
        expect(blocked.some(([bx, by]) => bx === tx && by === ty)).toBe(false);
      }
      if (npc.grid.isMoving && !wasMoving) moves++;
      wasMoving = npc.grid.isMoving;
    }
    expect(moves).toBeGreaterThan(50);
    expect(visited.size).toBeGreaterThan(5);
    movement.destroy(world);
  });

  it('does not block or alter the player controlled by input intent', () => {
    const { world, spatial, movement } = build();
    const player = world.createEntity();
    world.addComponent(player, new TransformComponent({ x: px(3), y: py(3) }));
    const pg = world.addComponent(player, new GridMovementComponent({ speed: 320 }));
    world.addComponent(player, new PlayerControlComponent());
    addNpc(world, { tx: 10, ty: 10, interval: 100, speed: 320 });

    world.addSystem(spatial);
    world.addSystem(new AIWanderSystem(spatial, lcg(7)));
    world.addSystem(movement);

    pg.pendingDirection = Direction.RIGHT;
    pg.holdDuration = 100;
    for (let i = 0; i < 30; i++) world.update(16);
    const t = world.getComponent(player, TransformComponent)!;
    expect(t.x).toBeGreaterThan(px(3));
    expect(pg.speed).toBe(320);
    movement.destroy(world);
  });
});
