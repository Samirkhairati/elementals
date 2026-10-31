import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('phaser', async () => {
  const { EventEmitter } = await import('node:events');
  return { Events: { EventEmitter } };
});

import { MovementSystem } from './MovementSystem';
import { SpatialSystem } from './SpatialSystem';
import { World } from '../World';
import { TransformComponent } from '../components/TransformComponent';
import { GridMovementComponent } from '../components/GridMovementComponent';
import { FreeMovementComponent } from '../components/FreeMovementComponent';
import { PlayerControlComponent } from '../components/PlayerControlComponent';
import { ColliderComponent } from '../components/ColliderComponent';
import { Direction } from '@/utils/Direction';
import { gameState } from '@/core/GameState';
import { settingsStore } from '@/core/SettingsStore';
import { EventBus, Events } from '@/utils/EventBus';
import type { CollisionSystem } from '@/world/CollisionSystem';

const TS = 32;
// bottom-centre of tile (tx, ty)
const px = (tx: number) => tx * TS + TS / 2;
const py = (ty: number) => (ty + 1) * TS;

const created: Array<{ movement: MovementSystem; world: World }> = [];

function makeSystems(blocked: Array<[number, number]> = []) {
  const blockedSet = new Set(blocked.map(([x, y]) => `${x},${y}`));
  const collision = {
    isWalkable: (x: number, y: number) => !blockedSet.has(`${Math.floor(x / TS)},${Math.floor((y - 1) / TS)}`),
    setMap: () => {},
  } as unknown as CollisionSystem;
  const spatial = new SpatialSystem(collision);
  const movement = new MovementSystem(spatial);
  const world = new World();
  world.addSystem(spatial);
  world.addSystem(movement);
  created.push({ movement, world });
  return { world, movement, spatial };
}

function addGridEntity(world: World, tx: number, ty: number, opts: { player?: boolean; speed?: number } = {}) {
  const e = world.createEntity();
  world.addComponent(e, new TransformComponent({ x: px(tx), y: py(ty) }));
  const grid = world.addComponent(e, new GridMovementComponent({ speed: opts.speed ?? 320 }));
  if (opts.player) world.addComponent(e, new PlayerControlComponent());
  return { e, grid, t: world.getComponent(e, TransformComponent)! };
}

beforeEach(() => {
  settingsStore.tileBasedMovement = true;
  gameState.setInputLocked(false);
});
afterEach(() => {
  for (const { movement, world } of created.splice(0)) movement.destroy(world);
  settingsStore.tileBasedMovement = true;
  gameState.setInputLocked(false);
});

describe('MovementSystem grid movement', () => {
  it('does nothing without an intent', () => {
    const { world } = makeSystems();
    const { grid, t } = addGridEntity(world, 5, 5);
    world.update(100);
    expect(grid.isMoving).toBe(false);
    expect([t.x, t.y]).toEqual([px(5), py(5)]);
  });

  it('requires the hold threshold before stepping but still turns to face the intent', () => {
    const { world } = makeSystems();
    const { grid } = addGridEntity(world, 5, 5);
    grid.pendingDirection = Direction.RIGHT;
    grid.holdDuration = grid.moveThreshold; // not strictly greater
    world.update(16);
    expect(grid.isMoving).toBe(false);
    expect(grid.direction).toBe(Direction.RIGHT);
    grid.holdDuration = grid.moveThreshold + 1;
    world.update(16);
    expect(grid.isMoving).toBe(true);
  });

  it('walks one tile in the requested direction and stops when the intent is cleared', () => {
    const { world } = makeSystems();
    const { grid, t } = addGridEntity(world, 5, 5, { speed: 320 }); // 320 px/s = 32px per 100ms
    grid.pendingDirection = Direction.RIGHT;
    grid.holdDuration = 100;
    world.update(16); // starts step
    expect(grid.isMoving).toBe(true);
    expect([grid.targetX, grid.targetY]).toEqual([px(6), py(5)]);
    grid.pendingDirection = null;

    world.update(50); // half way
    expect(grid.isMoving).toBe(true);
    expect(t.x).toBeCloseTo(px(5) + 16);

    world.update(60); // overshoot -> snaps to target
    expect(grid.isMoving).toBe(false);
    expect([t.x, t.y]).toEqual([px(6), py(5)]);
    world.update(100);
    expect([t.x, t.y]).toEqual([px(6), py(5)]);
  });

  it('chains into the next step while the intent is held', () => {
    const { world } = makeSystems();
    const { grid, t } = addGridEntity(world, 5, 5);
    grid.pendingDirection = Direction.DOWN;
    grid.holdDuration = 100;
    world.update(16);
    world.update(120); // finish first step and start second
    expect(grid.isMoving).toBe(true);
    expect(t.y).toBe(py(6));
    expect(grid.targetY).toBe(py(7));
  });

  it('does not enter blocked tiles', () => {
    const { world } = makeSystems([[6, 5]]);
    const { grid, t } = addGridEntity(world, 5, 5);
    grid.pendingDirection = Direction.RIGHT;
    grid.holdDuration = 100;
    world.update(16);
    expect(grid.isMoving).toBe(false);
    expect(grid.direction).toBe(Direction.RIGHT);
    expect([t.x, t.y]).toEqual([px(5), py(5)]);
  });

  it('is blocked by solid entities and ignores itself', () => {
    const { world } = makeSystems();
    const { e, grid } = addGridEntity(world, 5, 5);
    const other = addGridEntity(world, 6, 5);
    world.addComponent(e, new ColliderComponent({ width: 16, height: 8 }));
    world.addComponent(other.e, new ColliderComponent({ width: 16, height: 8 }));
    grid.pendingDirection = Direction.RIGHT;
    grid.holdDuration = 100;
    world.update(16);
    expect(grid.isMoving).toBe(false);
    grid.pendingDirection = Direction.LEFT;
    world.update(16);
    expect(grid.isMoving).toBe(true);
  });

  it('does not start a step while input is locked, but finishes an in-flight one', () => {
    const { world } = makeSystems();
    const { grid, t } = addGridEntity(world, 5, 5);
    gameState.setInputLocked(true, 'dialogue');
    grid.pendingDirection = Direction.RIGHT;
    grid.holdDuration = 100;
    world.update(16);
    expect(grid.isMoving).toBe(false);

    gameState.setInputLocked(false);
    world.update(16);
    expect(grid.isMoving).toBe(true);
    gameState.setInputLocked(true);
    world.update(500);
    expect(grid.isMoving).toBe(false);
    expect(t.x).toBe(px(6));
  });

  it('only syncs gameState and emits PLAYER_MOVED for the player', () => {
    const { world } = makeSystems();
    const moved = vi.fn();
    EventBus.on(Events.PLAYER_MOVED, moved);

    const npc = addGridEntity(world, 2, 2);
    npc.grid.pendingDirection = Direction.RIGHT;
    npc.grid.holdDuration = 100;
    world.update(16);
    world.update(200);
    expect(moved).not.toHaveBeenCalled();

    const before = { ...gameState.playerPosition };
    const player = addGridEntity(world, 8, 8, { player: true });
    player.grid.pendingDirection = Direction.UP;
    player.grid.holdDuration = 100;
    world.update(16);
    world.update(200);
    EventBus.off(Events.PLAYER_MOVED, moved);

    expect(moved).toHaveBeenCalled();
    expect(gameState.playerPosition).not.toEqual(before);
    expect(gameState.playerPosition).toMatchObject({ worldX: px(8), worldY: py(7), gridX: 8, gridY: 7, direction: Direction.UP });
  });

  it('skips the grid of entities that also have free movement when tile-based movement is off', () => {
    const { world } = makeSystems();
    settingsStore.tileBasedMovement = false;
    const { grid, e } = addGridEntity(world, 5, 5);
    world.addComponent(e, new FreeMovementComponent());
    grid.pendingDirection = Direction.RIGHT;
    grid.holdDuration = 100;
    world.update(16);
    expect(grid.isMoving).toBe(false);
  });

  it('still steps grid-only entities (NPCs, move routes) when tile-based movement is off', () => {
    const { world } = makeSystems();
    settingsStore.tileBasedMovement = false;
    const { grid } = addGridEntity(world, 5, 5);
    grid.pendingDirection = Direction.RIGHT;
    grid.holdDuration = 100;
    world.update(16);
    expect(grid.isMoving).toBe(true);
  });

  it('run speed is 1.5x', () => {
    const { world } = makeSystems();
    const walk = addGridEntity(world, 1, 1, { speed: 320 });
    const run = addGridEntity(world, 3, 3, { speed: 320 });
    run.grid.movementType = 'run';
    for (const g of [walk.grid, run.grid]) {
      g.pendingDirection = Direction.RIGHT;
      g.holdDuration = 100;
    }
    world.update(16);
    for (const g of [walk.grid, run.grid]) g.pendingDirection = null;
    world.update(50);
    expect(walk.grid.progress).toBeCloseTo(0.5);
    expect(run.grid.progress).toBeCloseTo(0.75);
  });
});

describe('MovementSystem free movement', () => {
  function addFree(world: World, x: number, y: number) {
    const e = world.createEntity();
    const t = world.addComponent(e, new TransformComponent({ x, y }));
    const f = world.addComponent(e, new FreeMovementComponent({ speed: 100 }));
    return { e, f, t };
  }

  it('moves along the velocity vector at speed, normalised', () => {
    const { world } = makeSystems();
    settingsStore.tileBasedMovement = false;
    const { f, t } = addFree(world, 200, 200);
    f.vx = 1;
    f.vy = 0;
    world.update(1000);
    expect(t.x).toBeCloseTo(300);
    expect(f.isMoving).toBe(true);
    f.vx = 3;
    f.vy = 4; // normalised -> (0.6, 0.8)
    world.update(1000);
    expect(t.x).toBeCloseTo(360);
    expect(t.y).toBeCloseTo(280);
  });

  it('stops with zero velocity or when input is locked', () => {
    const { world } = makeSystems();
    settingsStore.tileBasedMovement = false;
    const { f, t } = addFree(world, 200, 200);
    world.update(100);
    expect(f.isMoving).toBe(false);
    f.vx = 1;
    gameState.setInputLocked(true);
    world.update(100);
    expect(f.isMoving).toBe(false);
    expect(t.x).toBe(200);
  });

  it('slides along walls (blocked axis does not move, other axis does)', () => {
    // block everything with x >= 300
    const collision = { isWalkable: (x: number) => x < 300, setMap: () => {} } as unknown as CollisionSystem;
    const spatial = new SpatialSystem(collision);
    const world = new World();
    world.addSystem(new MovementSystem(spatial));
    settingsStore.tileBasedMovement = false;
    const { f, t } = addFree(world, 285, 200);
    f.vx = 1;
    f.vy = 1;
    world.update(1000);
    expect(t.x).toBe(285);
    expect(t.y).toBeGreaterThan(200);
  });
});

describe('MovementSystem lifecycle', () => {
  it('snaps the player position when switching to tile-based mode', () => {
    makeSystems();
    gameState.updatePlayerPosition(px(3) + 7, py(4) - 5, 3, 3, Direction.LEFT);
    EventBus.emit(Events.MOVEMENT_MODE_CHANGED, true);
    expect(gameState.playerPosition).toMatchObject({ worldX: px(3), worldY: py(4) });
    EventBus.emit(Events.MOVEMENT_MODE_CHANGED, false);
    expect(gameState.playerPosition.worldX).toBe(px(3));
  });

  it('destroy() removes the event listener', () => {
    const { movement, world } = makeSystems();
    const before = EventBus.listenerCount(Events.MOVEMENT_MODE_CHANGED);
    movement.destroy(world);
    expect(EventBus.listenerCount(Events.MOVEMENT_MODE_CHANGED)).toBe(before - 1);
    created.length = 0;
  });

  it('snapTransformToGrid aligns to the nearest walkable tile', () => {
    const { world, movement } = makeSystems();
    const { e, t } = addGridEntity(world, 4, 4);
    t.x = px(4) + 5;
    t.y = py(4) - 6;
    movement.snapTransformToGrid(t, e, world);
    expect([t.x, t.y]).toEqual([px(4), py(4)]);
  });
});
