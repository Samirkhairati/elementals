import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tileToAnchor } from '@shared/engine/index.ts';
import { makeRig, cmd, state, flush, type Rig } from '@/test/rig';
import { TriggerSystem } from './TriggerSystem';
import { MovementSystem } from '@/ecs/systems/MovementSystem';
import { SpatialSystem } from '@/ecs/systems/SpatialSystem';
import { TransformComponent } from '@/ecs/components/TransformComponent';
import { GridMovementComponent } from '@/ecs/components/GridMovementComponent';
import { AnimationComponent } from '@/ecs/components/AnimationComponent';
import { ColliderComponent } from '@/ecs/components/ColliderComponent';
import { gameState } from '@/core/GameState';
import { settingsStore } from '@/core/SettingsStore';
import { legacyInteractableEntities } from '@/ecs/legacyInteractables';
import { hydrateMapEntities } from '@/ecs/spawner';
import type { CollisionSystem } from '@/world/CollisionSystem';
import type { Entity } from '@/ecs/Entity';

let rig: Rig;
let triggers: TriggerSystem;

async function step(ms = 16) {
  rig.world.update(ms);
  await flush();
}

function place(entity: Entity, col: number, row: number) {
  const t = rig.world.getComponent(entity, TransformComponent)!;
  const a = tileToAnchor(col, row);
  t.x = a.x;
  t.y = a.y;
}

function setup() {
  rig = makeRig();
  triggers = new TriggerSystem(rig.runtime);
  rig.world.addSystem(triggers);
  settingsStore.tileBasedMovement = true;
}

const say = (text: string) => cmd('showText', { text });

beforeEach(setup);
afterEach(() => {
  triggers.detach();
  gameState.setInputLocked(false);
});

describe('action trigger', () => {
  it('triggers on the tile in front of the player and turns the NPC towards the player', async () => {
    const player = rig.addPlayer(5, 5, 'down');
    const npc = rig.add({ id: 'npc', col: 5, row: 6, movement: { controller: 'none' }, sprite: { facing: 'left' }, states: [state([say('hi')])] });
    triggers.resetTouchState(rig.world);
    triggers.requestAction();
    await step();
    expect(rig.ui.texts).toEqual([{ speaker: '', text: 'hi' }]);
    expect(rig.world.getComponent(npc, AnimationComponent)!.direction).toBe('up');
    expect(gameState.isInputLocked).toBe(true);
    expect(gameState.isLockedBy('event')).toBe(true);
    expect(player).toBeDefined();
  });

  it('does not trigger on events that are not adjacent or not facing... (fallback only covers the 4 neighbours)', async () => {
    rig.addPlayer(5, 5, 'down');
    rig.add({ id: 'far', col: 5, row: 8, states: [state([say('far')])] });
    rig.add({ id: 'diag', col: 6, row: 6, states: [state([say('diag')])] });
    triggers.resetTouchState(rig.world);
    triggers.requestAction();
    await step();
    expect(rig.ui.texts).toEqual([]);
  });

  it('falls back to any of the four neighbours, front first', async () => {
    rig.addPlayer(5, 5, 'up');
    rig.add({ id: 'right', col: 6, row: 5, states: [state([say('right')])] });
    triggers.resetTouchState(rig.world);
    triggers.requestAction();
    await step();
    expect(rig.ui.texts[0].text).toBe('right');
    rig.runtime.cancelAll();
    await flush();
    rig.ui.texts.length = 0;

    rig.add({ id: 'front', col: 5, row: 4, states: [state([say('front')])] });
    triggers.requestAction();
    await step();
    expect(rig.ui.texts[0].text).toBe('front');
  });

  it('triggers an event the player stands on (walkable zone) before looking ahead', async () => {
    rig.addPlayer(5, 5, 'down');
    rig.add({ id: 'zone', col: 5, row: 5, sprite: false, collider: { isSolid: false }, states: [state([say('under')])] });
    rig.add({ id: 'ahead', col: 5, row: 6, states: [state([say('ahead')])] });
    triggers.resetTouchState(rig.world);
    triggers.requestAction();
    await step();
    expect(rig.ui.texts[0].text).toBe('under');
  });

  it('non-solid zones and faceOnInteract:false do not turn to the player', async () => {
    rig.addPlayer(5, 5, 'down');
    const zone = rig.add({ id: 'zone', col: 5, row: 6, movement: { controller: 'none' }, sprite: { facing: 'left' }, collider: { isSolid: false }, states: [state([say('z')])] });
    triggers.resetTouchState(rig.world);
    triggers.requestAction();
    await step();
    expect(rig.world.getComponent(zone, AnimationComponent)!.direction).toBe('left');

    rig.runtime.cancelAll();
    await flush();
    const proud = rig.add({ id: 'proud', col: 4, row: 5, movement: { controller: 'none' }, sprite: { facing: 'left' }, states: [state([say('p')], { faceOnInteract: false })] });
    rig.world.getComponent(zone, ColliderComponent)!.offsetX = 500; // move the zone out of the way
    rig.world.getComponent(rig.world.query(GridMovementComponent)[0], GridMovementComponent)!.direction = 'left';
    triggers.requestAction();
    await step();
    expect(rig.world.getComponent(proud, AnimationComponent)!.direction).toBe('left');
  });

  it('only triggers action states; other triggers are ignored by the action key', async () => {
    rig.addPlayer(5, 5, 'down');
    rig.add({ id: 'touchy', col: 5, row: 6, states: [state([say('t')], { trigger: 'playerTouch' })] });
    triggers.resetTouchState(rig.world);
    triggers.requestAction();
    await step();
    expect(rig.ui.texts).toEqual([]);
  });

  it('uses the active state: a conditional second state replaces the first', async () => {
    rig.addPlayer(5, 5, 'down');
    rig.add({ id: 'npc', col: 5, row: 6, states: [state([say('one')]), state([say('two')], { conditions: [{ kind: 'switch', id: 's1', value: true }] })] });
    triggers.resetTouchState(rig.world);
    rig.runtime.flags.setSwitch('s1', true);
    triggers.requestAction();
    await step();
    expect(rig.ui.texts[0].text).toBe('two');
  });

  it('is ignored while input is locked (a dismissing key press must not re-open the dialogue) and during an event', async () => {
    rig.addPlayer(5, 5, 'down');
    rig.add({ id: 'npc', col: 5, row: 6, states: [state([say('hi')])] });
    triggers.resetTouchState(rig.world);

    gameState.setInputLocked(true, 'menu');
    triggers.requestAction();
    await step();
    expect(rig.ui.texts).toEqual([]);
    gameState.setInputLocked(false, 'menu');

    triggers.requestAction();
    await step();
    expect(rig.ui.texts).toHaveLength(1);
    triggers.requestAction(); // second press while the dialogue is up
    await step();
    expect(rig.ui.texts).toHaveLength(1);
  });

  it('a wandering NPC keeps its dialogue: the live footprint follows it', async () => {
    rig.addPlayer(5, 5, 'down');
    const npc = rig.add({ id: 'wanderer', col: 5, row: 6, movement: { controller: 'wander' }, states: [state([say('still me')])] });
    triggers.resetTouchState(rig.world);
    place(npc, 8, 6); // wandered away
    triggers.requestAction();
    await step();
    expect(rig.ui.texts).toEqual([]);
    place(npc, 6, 5); // now next to the player (east)
    triggers.requestAction();
    await step();
    expect(rig.ui.texts[0].text).toBe('still me');
  });

  it('a mid-step NPC covers both tiles', async () => {
    rig.addPlayer(5, 5, 'down');
    const npc = rig.add({ id: 'walker', col: 5, row: 6, states: [state([say('hey')])] });
    triggers.resetTouchState(rig.world);
    const t = rig.world.getComponent(npc, TransformComponent)!;
    t.y += 16; // half way down to row 7: still overlaps row 6
    triggers.requestAction();
    await step();
    expect(rig.ui.texts[0].text).toBe('hey');
  });

  it('tap on an event within 3 tiles turns the player and triggers it', async () => {
    const player = rig.addPlayer(5, 5, 'down');
    rig.add({ id: 'npc', col: 7, row: 5, states: [state([say('tapped')])] });
    triggers.resetTouchState(rig.world);
    expect(triggers.tryActionAt(rig.world, player, { col: 7, row: 5 })).toBe(true);
    expect(rig.world.getComponent(player, GridMovementComponent)!.direction).toBe('right');
    await step();
    expect(rig.ui.texts[0].text).toBe('tapped');
    expect(triggers.tryActionAt(rig.world, player, { col: 12, row: 5 })).toBe(false);
  });
});

describe('only one blocking event at a time', () => {
  it('a second blocking event cannot start while one runs; parallel ones can', async () => {
    rig.addPlayer(5, 5, 'down');
    const a = rig.add({ id: 'a', col: 5, row: 6, states: [state([say('a')])] });
    const b = rig.add({ id: 'b', col: 4, row: 5, states: [state([say('b')])] });
    const par = rig.add({ id: 'par', col: 0, row: 0, sprite: false, collider: false, states: [state([cmd('wait', { ms: 1000 })], { trigger: 'parallel' })] });
    triggers.resetTouchState(rig.world);
    await step();
    expect(rig.runtime.isRunning(par)).toBe(true);
    expect(rig.runtime.isBlocking).toBe(false);

    expect(rig.runtime.start(a, 0)).not.toBeNull();
    expect(rig.runtime.start(b, 0)).toBeNull();
    expect(rig.runtime.start(a, 0)).toBeNull(); // the same event cannot restart itself
  });
});

describe('playerTouch', () => {
  it('fires when the player arrives on the tile, not while standing there, again after leaving and re-entering', async () => {
    const player = rig.addPlayer(5, 5);
    rig.add({ id: 'door', col: 6, row: 5, sprite: false, collider: { isSolid: false }, states: [state([cmd('setVariable', { id: 'v1', op: 'add', operand: 'const', value: 1 })], { trigger: 'playerTouch' })] });
    triggers.resetTouchState(rig.world);
    await step();
    expect(rig.runtime.flags.getVariable('v1')).toBe(0);

    place(player, 6, 5);
    await step();
    await step();
    expect(rig.runtime.flags.getVariable('v1')).toBe(1);
    await step();
    await step();
    expect(rig.runtime.flags.getVariable('v1')).toBe(1); // standing still does not re-fire

    place(player, 7, 5);
    await step();
    place(player, 6, 5);
    await step();
    await step();
    expect(rig.runtime.flags.getVariable('v1')).toBe(2);
  });

  it('does not fire for the tile the player spawned / was warped onto', async () => {
    rig.addPlayer(6, 5);
    rig.add({ id: 'door', col: 6, row: 5, sprite: false, collider: { isSolid: false }, states: [state([cmd('setSwitch', { id: 's1', value: true })], { trigger: 'playerTouch' })] });
    triggers.resetTouchState(rig.world);
    await step();
    await step();
    expect(rig.runtime.flags.getSwitch('s1')).toBe(false);
  });

  it('fires when a step ends on the trigger even if the player chains straight into the next step', async () => {
    const collision = { isWalkable: () => true, setMap: () => {} } as unknown as CollisionSystem;
    const spatial = new SpatialSystem(collision);
    const movement = new MovementSystem(spatial);
    rig.world.addSystem(spatial);
    rig.world.addSystem(movement);
    const player = rig.addPlayer(5, 5, 'right');
    rig.add({ id: 'door', col: 6, row: 5, sprite: false, collider: { isSolid: false }, states: [state([cmd('setSwitch', { id: 's1', value: true })], { trigger: 'playerTouch' })] });
    triggers.resetTouchState(rig.world);

    const grid = rig.world.getComponent(player, GridMovementComponent)!;
    grid.pendingDirection = 'right'; // key held the whole way
    grid.holdDuration = 100;
    for (let i = 0; i < 40 && !rig.runtime.flags.getSwitch('s1'); i++) {
      // the lock only starts once the event runs, so keep the intent while unlocked
      if (!gameState.isInputLocked) {
        grid.pendingDirection = 'right';
        grid.holdDuration = 100;
      }
      await step(16);
    }
    expect(rig.runtime.flags.getSwitch('s1')).toBe(true);
    // fired when the first step ended on column 6 (the player was already walking on to column 7)
    const t = rig.world.getComponent(player, TransformComponent)!;
    expect(t.x).toBeGreaterThanOrEqual(6 * 32 + 16);
    expect(t.x).toBeLessThan(7 * 32 + 16 + 1);
    movement.destroy(rig.world);
  });

  it('bumping into a SOLID playerTouch event triggers it; walkable ones wait for arrival', async () => {
    const player = rig.addPlayer(5, 5, 'right');
    rig.add({ id: 'guard', col: 6, row: 5, states: [state([cmd('setSwitch', { id: 's1', value: true })], { trigger: 'playerTouch' })] });
    triggers.resetTouchState(rig.world);
    const grid = rig.world.getComponent(player, GridMovementComponent)!;
    grid.pendingDirection = 'right';
    grid.holdDuration = 10;
    await step();
    expect(rig.runtime.flags.getSwitch('s1')).toBe(false); // hold threshold not reached
    grid.holdDuration = 100;
    await step();
    await step();
    expect(rig.runtime.flags.getSwitch('s1')).toBe(true);
  });
});

describe('eventTouch', () => {
  it('fires when another entity ends a step on the event', async () => {
    rig.addPlayer(1, 1);
    rig.add({ id: 'pad', col: 8, row: 8, sprite: false, collider: { isSolid: false }, states: [state([cmd('setSwitch', { id: 's1', value: true })], { trigger: 'eventTouch' })] });
    const walker = rig.add({ id: 'walker', col: 7, row: 8, movement: { controller: 'none' } });
    triggers.resetTouchState(rig.world);
    await step();
    await step();
    expect(rig.runtime.flags.getSwitch('s1')).toBe(false);
    place(walker, 8, 8);
    await step();
    await step();
    expect(rig.runtime.flags.getSwitch('s1')).toBe(true);
  });
});

describe('autorun', () => {
  it('blocks input, runs, and restarts while its state stays active until it switches itself off', async () => {
    rig.addPlayer(5, 5);
    rig.add({
      id: 'cutscene',
      col: 0,
      row: 0,
      sprite: false,
      collider: false,
      states: [
        state([cmd('showText', { text: 'intro' }), cmd('setVariable', { id: 'v1', op: 'add', operand: 'const', value: 1 })], { trigger: 'autorun' }),
        state([], { conditions: [{ kind: 'selfSwitch', key: 'A', value: true }], trigger: 'action' }),
      ],
    });
    triggers.resetTouchState(rig.world);
    await step();
    expect(rig.ui.texts).toHaveLength(1);
    expect(gameState.isInputLocked).toBe(true); // player is locked out while it runs
    rig.ui.dismiss();
    await flush();
    await step();
    expect(rig.runtime.flags.getVariable('v1')).toBe(1);
    expect(rig.ui.texts).toHaveLength(2); // restarted: the state is still active
    rig.runtime.flags.setSelfSwitch('test', 'cutscene', 'A', true); // switch it off
    rig.ui.dismiss();
    await flush();
    await step();
    await step();
    expect(rig.ui.texts).toHaveLength(2);
    expect(gameState.isInputLocked).toBe(false);
  });

  it('does not start while another blocking event is running, then runs after it', async () => {
    rig.addPlayer(5, 5, 'down');
    rig.add({ id: 'npc', col: 5, row: 6, states: [state([say('npc')])] });
    triggers.resetTouchState(rig.world);
    triggers.requestAction();
    await step();
    rig.add({ id: 'auto', col: 0, row: 0, sprite: false, collider: false, states: [state([cmd('setSwitch', { id: 's1', value: true })], { trigger: 'autorun' })] });
    await step();
    expect(rig.runtime.flags.getSwitch('s1')).toBe(false);
    rig.ui.dismiss();
    await flush();
    await step();
    expect(rig.runtime.flags.getSwitch('s1')).toBe(true);
  });
});

describe('parallel', () => {
  it('runs in the background without locking input and restarts when finished', async () => {
    rig.addPlayer(5, 5);
    rig.add({ id: 'par', col: 0, row: 0, sprite: false, collider: false, states: [state([cmd('setVariable', { id: 'v1', op: 'add', operand: 'const', value: 1 }), cmd('wait', { ms: 32 })], { trigger: 'parallel' })] });
    triggers.resetTouchState(rig.world);
    for (let i = 0; i < 10; i++) await step(16);
    expect(rig.runtime.flags.getVariable('v1')).toBeGreaterThanOrEqual(3);
    expect(gameState.isInputLocked).toBe(false);
  });

  it('is cancelled when its state is no longer active', async () => {
    rig.addPlayer(5, 5);
    const par = rig.add({
      id: 'par', col: 0, row: 0, sprite: false, collider: false,
      states: [state([cmd('wait', { ms: 100000 })], { trigger: 'parallel', conditions: [{ kind: 'switch', id: 's1', value: false }] })],
    });
    triggers.resetTouchState(rig.world);
    await step();
    expect(rig.runtime.isRunning(par)).toBe(true);
    rig.runtime.flags.setSwitch('s1', true);
    await step();
    await step();
    expect(rig.runtime.isRunning(par)).toBe(false);
  });
});

describe('lifecycle', () => {
  it('destroying an entity cancels its interpreter', async () => {
    rig.addPlayer(5, 5, 'down');
    const npc = rig.add({ id: 'npc', col: 5, row: 6, states: [state([say('hi')])] });
    triggers.resetTouchState(rig.world);
    triggers.requestAction();
    await step();
    expect(rig.runtime.isRunning(npc)).toBe(true);
    rig.world.destroyEntity(npc);
    expect(rig.runtime.isRunning(npc)).toBe(false);
    expect(gameState.isInputLocked).toBe(false);
  });

  it('onMapLoaded cancels running events and re-selects states for the new map (self switches are per map)', async () => {
    rig.addPlayer(5, 5, 'down');
    const npc = rig.add({ id: 'npc', col: 5, row: 6, states: [state([say('hi')])] });
    triggers.resetTouchState(rig.world);
    triggers.requestAction();
    await step();
    expect(rig.runtime.isBlocking).toBe(true);
    rig.runtime.onMapLoaded('market');
    expect(rig.runtime.isBlocking).toBe(false);
    expect(rig.runtime.mapId).toBe('market');
    expect(rig.runtime.isRunning(npc)).toBe(false);
  });

  it('the action key listener only attaches once and ignores presses while locked', async () => {
    const { EventBus, Events } = await import('@/utils/EventBus');
    rig.addPlayer(5, 5, 'down');
    rig.add({ id: 'npc', col: 5, row: 6, states: [state([say('hi')])] });
    triggers.resetTouchState(rig.world);
    triggers.attach();
    triggers.attach();
    gameState.setInputLocked(true, 'menu');
    EventBus.emit(Events.INPUT_ACTION);
    gameState.setInputLocked(false, 'menu');
    await step();
    expect(rig.ui.texts).toEqual([]);
    EventBus.emit(Events.INPUT_ACTION);
    await step();
    expect(rig.ui.texts).toHaveLength(1);
  });
});

describe('legacy Tiled interactables and legacy entities run identically', () => {
  it('on_interact message / on_step emit objects become action / playerTouch events', async () => {
    const raw = {
      layers: [
        { type: 'tilelayer', name: 'ground' },
        {
          type: 'objectgroup',
          name: 'interactables',
          objects: [
            { id: 1, name: 'Old Sign', x: 6 * 32, y: 5 * 32, properties: [{ name: 'message', value: 'Welcome!' }] },
            { id: 2, name: 'Trap', x: 5 * 32, y: 7 * 32, properties: { type: 'on_step', eventKey: 'TRAP' } },
            { id: 3, name: 'Just a name', x: 4 * 32, y: 5 * 32 },
          ],
        },
      ],
    };
    const defs = legacyInteractableEntities(raw);
    expect(defs).toHaveLength(3);
    hydrateMapEntities(rig.world, defs, rig.expandCtx);
    rig.runtime.states.refreshAll();
    const player = rig.addPlayer(5, 5, 'right');
    triggers.resetTouchState(rig.world);

    triggers.requestAction(); // facing right: the sign at (6,5)
    await step();
    expect(rig.ui.texts[0].text).toBe('Welcome!');
    rig.ui.dismiss();
    await flush();
    await step();

    rig.world.getComponent(player, GridMovementComponent)!.direction = 'left';
    triggers.requestAction(); // name fallback at (4,5)
    await step();
    expect(rig.ui.texts[1].text).toBe('Just a name');
    rig.ui.dismiss();
    await flush();
    await step();

    place(player, 5, 7); // step onto the trap
    await step();
    await step();
    expect(rig.emitted.map((e) => e.event)).toEqual(['TRAP']);
  });

  it('a legacy Interactable with a targetMap warps', async () => {
    hydrateMapEntities(rig.world, [{
      id: 'door', name: 'Door', x: 176, y: 224,
      components: { Transform: { x: 176, y: 224, depth: 5 }, Collider: { width: 32, height: 32, offsetX: 0, offsetY: 0, isSolid: false }, Interactable: { type: 'on_step', targetMap: 'market.json', targetX: 3, targetY: 4 } },
    }], rig.expandCtx);
    rig.runtime.states.refreshAll();
    const player = rig.addPlayer(4, 5);
    triggers.resetTouchState(rig.world);
    place(player, 5, 6);
    await step();
    await step();
    expect(rig.maps.warps).toEqual([{ map: 'market', x: 3, y: 4, facing: undefined, fade: true }]);
  });
});
