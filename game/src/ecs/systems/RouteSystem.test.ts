import { describe, it, expect, beforeEach } from 'vitest';
import { RouteSystem } from './RouteSystem';
import { MovementSystem } from './MovementSystem';
import { SpatialSystem } from './SpatialSystem';
import { AIWanderSystem } from './AIWanderSystem';
import { AnimationSystem } from './AnimationSystem';
import { InputSystem } from './InputSystem';
import { makeRig, flush, type Rig } from '@/test/rig';
import { TransformComponent } from '../components/TransformComponent';
import { GridMovementComponent } from '../components/GridMovementComponent';
import { MoveRouteComponent } from '../components/MoveRouteComponent';
import { AnimatorComponent } from '../components/AnimatorComponent';
import { gameState } from '@/core/GameState';
import { settingsStore } from '@/core/SettingsStore';
import type { CollisionSystem } from '@/world/CollisionSystem';
import { characterAnimKey } from '@shared/engine/index.ts';
import type { RouteStep } from '@shared/engine/index.ts';

let rig: Rig;
let blocked: Set<string>;

function setup() {
  rig = makeRig();
  blocked = new Set();
  const collision = {
    isWalkable: (x: number, y: number) => !blocked.has(`${Math.floor(x / 32)},${Math.floor((y - 1) / 32)}`),
    setMap: () => {},
  } as unknown as CollisionSystem;
  const spatial = new SpatialSystem(collision);
  rig.world.addSystem(spatial);
  rig.world.addSystem(new InputSystem());
  rig.world.addSystem(new AIWanderSystem(spatial, () => 0));
  rig.world.addSystem(new RouteSystem());
  rig.world.addSystem(new MovementSystem(spatial));
  rig.world.addSystem(new AnimationSystem());
  settingsStore.tileBasedMovement = true;
  gameState.setInputLocked(false);
}
beforeEach(setup);

const tileOf = (e: number) => {
  const t = rig.world.getComponent(e, TransformComponent)!;
  return [Math.floor(t.x / 32), Math.floor((t.y - 1) / 32)];
};

async function runUntil(done: () => boolean, maxFrames = 600) {
  for (let i = 0; i < maxFrames && !done(); i++) {
    rig.world.update(16);
    await flush();
  }
}

describe('RouteSystem', () => {
  it('walks the steps one tile each and resolves when finished', async () => {
    const npc = rig.add({ col: 3, row: 3, movement: { controller: 'none', speed: 200 } });
    let outcome: unknown;
    void rig.runtime.ops.moveRoute(npc, [{ type: 'right' }, { type: 'right' }, { type: 'down' }, { type: 'left' }]).then((o) => (outcome = o));
    await runUntil(() => outcome !== undefined);
    expect(outcome).toEqual({ completed: true, blocked: 0 });
    expect(tileOf(npc)).toEqual([4, 4]);
    expect(rig.world.hasComponent(npc, MoveRouteComponent)).toBe(false);
  });

  it('forward / back are relative to the facing; turn changes facing without moving; speed changes the walking speed', async () => {
    const npc = rig.add({ col: 3, row: 3, sprite: { facing: 'up' }, movement: { controller: 'none', speed: 100 } });
    const steps: RouteStep[] = [{ type: 'turn', value: 'right' }, { type: 'speed', value: 400 }, { type: 'forward' }, { type: 'forward' }, { type: 'turn', value: 'down' }];
    let done = false;
    void rig.runtime.ops.moveRoute(npc, steps).then(() => (done = true));
    await runUntil(() => done);
    expect(tileOf(npc)).toEqual([5, 3]);
    const grid = rig.world.getComponent(npc, GridMovementComponent)!;
    expect(grid.speed).toBe(400);
    expect(grid.direction).toBe('down');
  });

  it('back walks away from the facing', async () => {
    const npc = rig.add({ col: 3, row: 3, sprite: { facing: 'up' }, movement: { controller: 'none', speed: 400 } });
    let done = false;
    void rig.runtime.ops.moveRoute(npc, [{ type: 'back' }]).then(() => (done = true));
    await runUntil(() => done);
    expect(tileOf(npc)).toEqual([3, 4]);
  });

  it('wait steps wait in game time', async () => {
    const npc = rig.add({ col: 3, row: 3, movement: { controller: 'none', speed: 400 } });
    let done = false;
    void rig.runtime.ops.moveRoute(npc, [{ type: 'wait', value: 160 }, { type: 'right' }]).then(() => (done = true));
    for (let i = 0; i < 5; i++) {
      rig.world.update(16);
      await flush();
    }
    expect(tileOf(npc)).toEqual([3, 3]);
    expect(done).toBe(false);
    await runUntil(() => done);
    expect(tileOf(npc)).toEqual([4, 3]);
  });

  it('a blocked step is skipped and counted; later steps still run', async () => {
    const npc = rig.add({ col: 3, row: 3, movement: { controller: 'none', speed: 400 } });
    blocked.add('4,3');
    let outcome: { completed: boolean; blocked: number } | undefined;
    void rig.runtime.ops.moveRoute(npc, [{ type: 'right' }, { type: 'down' }]).then((o) => (outcome = o));
    await runUntil(() => outcome !== undefined);
    expect(outcome).toEqual({ completed: true, blocked: 1 });
    expect(tileOf(npc)).toEqual([3, 4]);
  });

  it('is blocked by solid entities too', async () => {
    const npc = rig.add({ col: 3, row: 3, movement: { controller: 'none', speed: 400 } });
    rig.add({ col: 4, row: 3 });
    let outcome: { completed: boolean; blocked: number } | undefined;
    void rig.runtime.ops.moveRoute(npc, [{ type: 'right' }]).then((o) => (outcome = o));
    await runUntil(() => outcome !== undefined);
    expect(outcome?.blocked).toBe(1);
    expect(tileOf(npc)).toEqual([3, 3]);
  });

  it('works while player input is locked (events lock input) and ignores input for the routed player', async () => {
    const player = rig.addPlayer(5, 5);
    gameState.setInputLocked(true, 'event');
    let done = false;
    void rig.runtime.ops.moveRoute(player, [{ type: 'up' }, { type: 'up' }]).then(() => (done = true));
    await runUntil(() => done);
    expect(tileOf(player)).toEqual([5, 3]);
    expect(gameState.playerPosition.gridY).toBe(3);
  });

  it('works in free movement mode (the route uses tile steps)', async () => {
    settingsStore.tileBasedMovement = false;
    const player = rig.addPlayer(5, 5);
    const npc = rig.add({ col: 2, row: 2, movement: { controller: 'none', speed: 400 } });
    let done = 0;
    void rig.runtime.ops.moveRoute(player, [{ type: 'left' }]).then(() => done++);
    void rig.runtime.ops.moveRoute(npc, [{ type: 'down' }]).then(() => done++);
    await runUntil(() => done === 2);
    expect(tileOf(player)).toEqual([4, 5]);
    expect(tileOf(npc)).toEqual([2, 3]);
    settingsStore.tileBasedMovement = true;
  });

  it('keeps the walk animation between steps (no idle flicker) and idles afterwards', async () => {
    const npc = rig.add({ col: 3, row: 3, sprite: { asset: 'characters/npc' }, movement: { controller: 'none', speed: 400 } });
    const keys: string[] = [];
    let done = false;
    void rig.runtime.ops.moveRoute(npc, [{ type: 'right' }, { type: 'right' }, { type: 'right' }]).then(() => (done = true));
    while (!done) {
      rig.world.update(16);
      await flush();
      keys.push(rig.world.getComponent(npc, AnimatorComponent)!.currentAnimKey);
    }
    const idle = characterAnimKey('characters/npc', 'idle', 'right');
    expect(keys.pop()).toBe(idle); // the frame in which the route ended
    expect(keys.length).toBeGreaterThan(10);
    expect(keys.every((k) => k === characterAnimKey('characters/npc', 'walk', 'right'))).toBe(true);
    expect(rig.world.getComponent(npc, AnimatorComponent)!.currentAnimKey).toBe(characterAnimKey('characters/npc', 'idle', 'right'));
  });

  it('wandering NPCs are driven by the route, not the AI, and resume wandering afterwards', async () => {
    const npc = rig.add({ col: 3, row: 3, movement: { controller: 'wander', speed: 400, wanderInterval: 500 } });
    let done = false;
    void rig.runtime.ops.moveRoute(npc, [{ type: 'right' }, { type: 'right' }]).then(() => (done = true));
    await runUntil(() => done);
    expect(tileOf(npc)).toEqual([5, 3]);
  });

  it('cancelling (abort) removes the route; destroying the entity resolves it', async () => {
    const npc = rig.add({ col: 3, row: 3, movement: { controller: 'none', speed: 100 } });
    const ac = new AbortController();
    const p = rig.runtime.ops.moveRoute(npc, [{ type: 'wait', value: 100000 }], ac.signal);
    rig.world.update(16);
    expect(rig.world.getComponent(npc, MoveRouteComponent)!.active).toBe(true);
    ac.abort();
    expect(await p).toEqual({ completed: false, blocked: 0 });
    rig.world.update(16);
    expect(rig.world.hasComponent(npc, MoveRouteComponent)).toBe(false);

    const other = rig.add({ col: 1, row: 1, movement: { controller: 'none' } });
    const q = rig.runtime.ops.moveRoute(other, [{ type: 'wait', value: 100000 }]);
    rig.world.update(16);
    rig.world.destroyEntity(other);
    expect(await q).toEqual({ completed: false, blocked: 0 });
  });

  it('entities without Movement get a grid so they can be moved (statues)', async () => {
    const statue = rig.add({ col: 3, row: 3 });
    expect(rig.world.hasComponent(statue, GridMovementComponent)).toBe(false);
    let done = false;
    void rig.runtime.ops.moveRoute(statue, [{ type: 'right' }]).then(() => (done = true));
    await runUntil(() => done);
    expect(tileOf(statue)).toEqual([4, 3]);
  });

  it('queued routes run one after another', async () => {
    const npc = rig.add({ col: 3, row: 3, movement: { controller: 'none', speed: 400 } });
    const order: number[] = [];
    void rig.runtime.ops.moveRoute(npc, [{ type: 'right' }]).then(() => order.push(1));
    void rig.runtime.ops.moveRoute(npc, [{ type: 'down' }]).then(() => order.push(2));
    await runUntil(() => order.length === 2);
    expect(order).toEqual([1, 2]);
    expect(tileOf(npc)).toEqual([4, 4]);
  });
});
