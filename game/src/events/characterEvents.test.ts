import { describe, it, expect, beforeEach } from 'vitest';
import { buildClipRegistrations, clipAnimKey, spriteTextureKey, type EventGraph, type GraphNode } from '@shared/engine/index.ts';
import { EventInterpreter } from './EventInterpreter';
import { AnimationSystem } from '@/ecs/systems/AnimationSystem';
import { RenderBridgeSystem } from '@/ecs/systems/RenderBridgeSystem';
import { AnimatorComponent } from '@/ecs/components/AnimatorComponent';
import { GridMovementComponent } from '@/ecs/components/GridMovementComponent';
import { SpriteComponent } from '@/ecs/components/SpriteComponent';
import { AppearanceOverrides } from './AppearanceOverrides';
import { makeRig, cmd, state, flush, type Rig } from '@/test/rig';
import { characterRegistry, heroDef } from '@/test/characters';
import { FakeScene } from '@/test/fakePhaser';
import { settingsStore } from '@/core/SettingsStore';
import type { Entity } from '@/ecs/Entity';

const HERO = 'characters/hero';
const ARMOR = 'characters/armor';

let rig: Rig;
let scene: FakeScene;

beforeEach(() => {
  settingsStore.tileBasedMovement = true;
  const defs = { [HERO]: heroDef('Hero'), [ARMOR]: heroDef('Armor') };
  rig = makeRig({ sprites: characterRegistry(defs) });
  scene = new FakeScene(Object.entries(defs).flatMap(([id, def]) => buildClipRegistrations(id, def)));
  rig.world.addSystem(new AnimationSystem());
  rig.world.addSystem(new RenderBridgeSystem(scene.asScene));
});

const n = (id: string, type: string, out: Record<string, string> = {}, params: Record<string, unknown> = {}): GraphNode => ({ id, type, params, out, x: 0, y: 0 });
const graph = (...nodes: GraphNode[]): EventGraph => ({ nodes, frames: [] });

function interpret(g: EventGraph, entity: Entity): EventInterpreter {
  return new EventInterpreter(g, {
    entity, entityId: 'hero', getMapId: () => 'test', flags: rig.runtime.flags, inventory: rig.runtime.inventory, ui: rig.ui,
    clock: rig.runtime.clock, ops: rig.runtime.ops, maps: rig.maps, emit: () => {}, warn: (m) => rig.warnings.push(m), warnOnce: (_k, m) => rig.warnings.push(m), random: () => 0,
  });
}

/** One game frame: ECS systems, the event clock, Phaser's animation clock, then pending promises. */
async function frame(ms = 16) {
  rig.world.update(ms);
  rig.runtime.update(ms);
  scene.tick(ms);
  await flush();
}

describe('event graph: change character, play a one-shot with wait, change speed', () => {
  it('runs the whole sequence against the real animation systems', async () => {
    const hero = rig.add({ id: 'hero', sprite: { asset: HERO, facing: 'down' }, movement: { controller: 'none', speed: 100 } });
    const animator = rig.world.getComponent(hero, AnimatorComponent)!;
    const grid = rig.world.getComponent(hero, GridMovementComponent)!;
    await frame();
    const sprite = scene.sprites[0];
    expect(sprite.anims.currentAnim?.key).toBe(clipAnimKey(HERO, 'idle', 'down'));

    const run = interpret(
      graph(
        n('start', 'start', { next: 'swap' }),
        n('swap', 'changeSprite', { next: 'attack' }, { target: 'self', asset: ARMOR, animation: '', persist: 'state' }),
        n('attack', 'playAnimation', { next: 'faster' }, { target: 'self', animation: 'attack', wait: true, then: 'auto', speed: 1 }),
        n('faster', 'setAnimationSpeed', { next: 'quick' }, { target: 'self', value: 2, mode: 'scale', clip: '' }),
        n('quick', 'setMoveSpeed', { next: 'done' }, { target: 'self', speed: 200 }),
        n('done', 'setSwitch', {}, { id: 's1', value: true }),
        n('end', 'end'),
      ),
      hero,
    );
    const outcome = run.run();
    await flush();

    // 1. the character was swapped and the one-shot started; the event is now waiting on it
    expect(animator.characterId).toBe(ARMOR);
    expect(rig.world.getComponent(hero, SpriteComponent)!.assetId).toBe(ARMOR);
    expect(animator.explicitClip).toBe('attack');
    expect(run.currentNodeId).toBe('attack');
    await frame();
    expect(sprite.anims.currentAnim?.key).toBe(clipAnimKey(ARMOR, 'attack', 'down'));
    expect(sprite.anims.timeScale).toBe(1);

    // 2. 320 ms into a 500 ms clip: still waiting, nothing after the wait ran yet
    for (let i = 0; i < 20; i++) await frame();
    expect(run.currentNodeId).toBe('attack');
    expect(animator.animSpeed).toBe(1);
    expect(grid.speed).toBe(100);
    expect(rig.runtime.flags.getSwitch('s1')).toBe(false);

    // 3. the clip ends: the wait resolves, speeds change, the entity returns to its idle animation
    for (let i = 0; i < 20; i++) await frame();
    expect(await outcome).toBe('completed');
    expect(rig.runtime.flags.getSwitch('s1')).toBe(true);
    expect(animator.animSpeed).toBe(2);
    expect(grid.speed).toBe(200);
    expect(animator.explicitClip).toBeNull();
    await frame();
    expect(sprite.anims.currentAnim?.key).toBe(clipAnimKey(ARMOR, 'idle', 'down'));
    expect(sprite.anims.timeScale).toBe(2);
    expect(rig.warnings).toEqual([]);
  });

  it('wait on a looping clip warns and continues instead of hanging; unknown clips warn', async () => {
    const e = rig.add({ id: 'hero', sprite: { asset: HERO }, movement: { controller: 'none' } });
    const run = interpret(
      graph(
        n('start', 'start', { next: 'a' }),
        n('a', 'playAnimation', { next: 'b' }, { target: 'self', animation: 'sway', wait: true }),
        n('b', 'playAnimation', { next: 'c' }, { target: 'self', animation: 'dance', wait: true }),
        n('c', 'setSwitch', {}, { id: 's1', value: true }),
      ),
      e,
    );
    expect(await run.run()).toBe('completed');
    expect(rig.runtime.flags.getSwitch('s1')).toBe(true);
    expect(rig.warnings.some((w) => w.includes('loops'))).toBe(true);
    expect(rig.warnings.some((w) => w.includes('no animation "dance"'))).toBe(true);
  });

  it('cancelling the event while it waits does not leave it running', async () => {
    const e = rig.add({ id: 'hero', sprite: { asset: HERO }, movement: { controller: 'none' } });
    const run = interpret(
      graph(n('start', 'start', { next: 'a' }), n('a', 'playAnimation', { next: 'b' }, { target: 'self', animation: 'attack', wait: true, then: 'auto' }), n('b', 'setSwitch', {}, { id: 's1', value: true })),
      e,
    );
    const outcome = run.run();
    await frame();
    run.cancel();
    expect(await outcome).toBe('cancelled');
    for (let i = 0; i < 40; i++) await frame();
    expect(rig.runtime.flags.getSwitch('s1')).toBe(false);
  });

  it('a playAnimation node saved before `then` existed keeps the animation on its last frame', async () => {
    const e = rig.add({ id: 'hero', sprite: { asset: HERO }, movement: { controller: 'none' } });
    const run = interpret(graph(n('start', 'start', { next: 'a' }), n('a', 'playAnimation', {}, { target: 'self', animation: 'attack', wait: true })), e);
    const outcome = run.run();
    for (let i = 0; i < 40; i++) await frame();
    expect(await outcome).toBe('completed');
    expect(rig.world.getComponent(e, AnimatorComponent)!.explicitClip).toBe('attack');
  });

  it('stopAnimation returns to the automatic animation and releases a waiting event', async () => {
    const e = rig.add({ id: 'hero', sprite: { asset: HERO }, movement: { controller: 'none' } });
    const a = rig.world.getComponent(e, AnimatorComponent)!;
    const waiting = interpret(graph(n('start', 'start', { next: 'a' }), n('a', 'playAnimation', { next: 'b' }, { target: 'self', animation: 'attack', wait: true, then: 'hold' }), n('b', 'setSwitch', {}, { id: 's1', value: true })), e).run();
    await frame();
    await frame(); // let Phaser start attack
    expect(a.explicitClip).toBe('attack');
    await interpret(graph(n('start', 'start', { next: 'x' }), n('x', 'stopAnimation', {}, { target: 'self' })), e).run();
    expect(a.explicitClip).toBeNull();
    expect(await waiting).toBe('completed');
    expect(rig.runtime.flags.getSwitch('s1')).toBe(true);
  });

  it('setMoveSpeed applies to grid, free and wander speeds; bad input is skipped with a warning', async () => {
    const e = rig.add({ id: 'wanderer', sprite: { asset: HERO }, movement: { controller: 'wander', speed: 50 } });
    await interpret(graph(n('start', 'start', { next: 'a' }), n('a', 'setMoveSpeed', { next: 'b' }, { target: 'self', speed: 240 }), n('b', 'setMoveSpeed', {}, { target: 'self', speed: -5 })), e).run();
    expect(rig.world.getComponent(e, GridMovementComponent)!.speed).toBe(240);
    expect(rig.warnings.some((w) => w.includes('speed above 0'))).toBe(true);
  });

  it('per-clip setAnimationSpeed in fps mode changes only that clip', async () => {
    const e = rig.add({ id: 'hero', sprite: { asset: HERO }, movement: { controller: 'none' } });
    const a = rig.world.getComponent(e, AnimatorComponent)!;
    await interpret(graph(n('start', 'start', { next: 'a' }), n('a', 'setAnimationSpeed', {}, { target: 'self', value: 16, mode: 'fps', clip: 'attack' })), e).run();
    a.explicitClip = 'attack';
    rig.world.update(16);
    expect(a.timeScale).toBe(2); // 16 fps over the authored 8
    a.explicitClip = null;
    rig.world.update(16);
    expect(a.timeScale).toBe(1);
  });
});

describe('changeSprite persistence (AppearanceOverrides, not GameFlags)', () => {
  function player() {
    return rig.addPlayer(2, 2);
  }
  const swap = (entity: Entity, persist: string) =>
    interpret(graph(n('start', 'start', { next: 'a' }), n('a', 'changeSprite', {}, { target: 'self', asset: ARMOR, animation: '', persist })), entity).run();
  const characterOf = (e: Entity) => rig.world.getComponent(e, AnimatorComponent)!.characterId;

  it('the default lasts until the event state changes and stores nothing', async () => {
    const e = rig.add({
      id: 'npc',
      sprite: { asset: HERO },
      states: [state([cmd('changeSprite', { target: 'self', asset: ARMOR, animation: '', persist: 'state' })]), state([], { conditions: [{ kind: 'switch', id: 's1', value: true }] })],
    });
    await rig.runtime.start(e, 0)!.done;
    expect(characterOf(e)).toBe(ARMOR);
    expect(rig.runtime.appearance.size).toBe(0);
    rig.runtime.flags.setSwitch('s1', true);
    rig.runtime.update(16);
    expect(characterOf(e)).toBe(HERO);
  });

  it('"forever" survives a state change and a map change and is saved; "map" ends with the map', async () => {
    rig.runtime.onMapLoaded('town');
    const e = rig.add({
      id: 'npc',
      sprite: { asset: HERO },
      states: [state([]), state([], { conditions: [{ kind: 'switch', id: 's1', value: true }] })],
    });
    rig.runtime.start(e, 0);
    await swap(e, 'forever');
    expect(characterOf(e)).toBe(ARMOR);
    rig.runtime.flags.setSwitch('s1', true);
    rig.runtime.update(16);
    expect(characterOf(e)).toBe(ARMOR); // the stored override is re-applied on top of the new state

    const snapshot = rig.runtime.appearance.snapshot();
    expect(Object.keys(snapshot.overrides)).toEqual(['town/npc']);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    const restored = new AppearanceOverrides();
    restored.restore(snapshot);
    expect(restored.get('town', 'npc')).toMatchObject({ asset: ARMOR, persist: 'forever' });
    restored.restore({ overrides: { 'a/b': { asset: '' }, 'c/d': 5 } });
    expect(restored.size).toBe(0);

    // the player leaves: the NPC (not on that map any more) and map-only overrides are ignored on the new map
    await swap(rig.add({ id: 'merchant', sprite: { asset: HERO } }), 'map');
    expect(rig.runtime.appearance.get('town', 'merchant')).toMatchObject({ persist: 'map' });
    rig.runtime.onMapLoaded('cave');
    expect(rig.runtime.appearance.get('town', 'merchant')).toBeUndefined();
    expect(rig.runtime.appearance.get('town', 'npc')).toBeDefined(); // forever stays in the store
  });

  it('an override is restored when its entity spawns again (also for entities without events)', async () => {
    rig.runtime.onMapLoaded('town');
    const p = player();
    await swap(p, 'forever');
    expect(characterOf(p)).toBe(ARMOR);
    rig.world.removeComponent(p, AnimatorComponent);
    rig.world.removeComponent(p, SpriteComponent);
    rig.runtime.ops.changeSprite(p, HERO, ''); // spawn with the authored sprite
    expect(characterOf(p)).toBe(HERO);
    rig.runtime.onMapLoaded('town');
    expect(characterOf(p)).toBe(ARMOR);
  });

  it('the player outfit forever follows them to another map', async () => {
    rig.runtime.onMapLoaded('town');
    const p = player();
    await swap(p, 'forever');
    rig.runtime.ops.changeSprite(p, HERO, ''); // a new map spawns the player with the authored sprite
    rig.runtime.onMapLoaded('cave');
    expect(characterOf(p)).toBe(ARMOR);
  });

  it('GameFlags stay a pure flag store', async () => {
    const before = JSON.stringify(rig.runtime.flags.toJSON());
    const e = rig.add({ id: 'npc', sprite: { asset: HERO } });
    await swap(e, 'forever');
    expect(JSON.stringify(rig.runtime.flags.toJSON())).toBe(before);
    expect(Object.keys(rig.runtime.flags.toJSON()).sort()).toEqual(['selfSwitches', 'stages', 'switches', 'variables']);
    expect(rig.runtime.appearance.size).toBe(1);
  });
});

describe('texture and animation names of existing characters are unchanged', () => {
  it('migrated test characters keep sprite:<id>:<sheet> textures and sprite:<id>:<phase>-<facing> animations', () => {
    const r = makeRig();
    const e = r.add({ sprite: { asset: 'characters/player', facing: 'up' } });
    expect(r.world.getComponent(e, SpriteComponent)!.texture).toBe(spriteTextureKey('characters/player', 'walk'));
    expect(r.world.getComponent(e, SpriteComponent)!.frame).toBe(12);
  });
});
