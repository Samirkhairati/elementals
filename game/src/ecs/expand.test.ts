import { describe, it, expect, vi } from 'vitest';
import { createDefaultComponent, objectAnimKey, spriteTextureKey, characterFrameIndex, type EngineEntity } from '@shared/engine/index.ts';
import { expandEntity, type ExpandContext } from './expand';
import { createComponentFromData, ComponentDataError } from './componentFactory';
import { spriteRegistry } from '@/data/spriteRegistry';
import { testSprites, characterMeta, commandTypes, firstCommand } from '@/test/helpers';
import { World } from './World';
import { hydrateMapEntities, spawnPlayer } from './spawner';
import { TransformComponent } from './components/TransformComponent';
import { SpriteComponent } from './components/SpriteComponent';
import { AnimationComponent } from './components/AnimationComponent';
import { ColliderComponent } from './components/ColliderComponent';
import { GridMovementComponent } from './components/GridMovementComponent';
import { FreeMovementComponent } from './components/FreeMovementComponent';
import { PlayerControlComponent } from './components/PlayerControlComponent';
import { AIWanderComponent } from './components/AIWanderComponent';
import { EventComponent } from './components/EventComponent';
import { EntityInfoComponent } from './components/EntityInfoComponent';
import { TagComponent } from './components/TagComponent';
import { PlayerPrefab } from './prefabs/PlayerPrefab';
import { PlayerControl } from './components/PlayerControlComponent';
import { InputSystem } from './systems/InputSystem';
import { gameState } from '@/core/GameState';

const sprites = testSprites();
const warnings: string[] = [];
const ctx: ExpandContext = { sprites, warn: (m) => warnings.push(m) };

function entity(components: Record<string, unknown>, extra: Partial<EngineEntity> = {}): EngineEntity {
  return { id: 'e1', name: 'E1', x: 48, y: 64, components, ...extra } as EngineEntity;
}

function expand(components: Record<string, unknown>) {
  warnings.length = 0;
  const list = expandEntity(entity(components), ctx);
  const find = <T,>(cls: new (...a: never[]) => T) => list.find((c) => c instanceof cls) as T | undefined;
  return { list, find };
}

describe('expandEntity', () => {
  it('Transform + EntityInfo are always produced', () => {
    const { find } = expand({ Transform: createDefaultComponent('Transform', { x: 48, y: 64, depth: 20 }) });
    expect(find(TransformComponent)).toMatchObject({ x: 48, y: 64, depth: 20 });
    expect(find(EntityInfoComponent)).toMatchObject({ editorId: 'e1', name: 'E1' });
  });

  it('Sprite (character asset) -> SpriteComponent + AnimationComponent with the asset pivot, offsets, scale, flip, tint, opacity', () => {
    const { find } = expand({
      Sprite: createDefaultComponent('Sprite', {
        asset: 'characters/player', facing: 'left', offsetX: 3, offsetY: -2, scale: 2, flipX: true, tint: '#ff8800', opacity: 0.5, visible: false,
      }),
    });
    const s = find(SpriteComponent)!;
    expect(s).toMatchObject({
      assetId: 'characters/player', texture: spriteTextureKey('characters/player', 'walk'),
      originX: 0.5, originY: 1, offsetX: 3, offsetY: -2, scale: 2, flipX: true, tint: 0xff8800, alpha: 0.5, visible: false,
    });
    expect(s.frame).toBe(characterFrameIndex(characterMeta(), 'left', 'idle', 0));
    expect(find(AnimationComponent)).toMatchObject({ assetId: 'characters/player', direction: 'left', hasRun: true, forcedPhase: null });
  });

  it('character Sprite with a forced animation name and an asset without run sheet', () => {
    const { find } = expand({ Sprite: createDefaultComponent('Sprite', { asset: 'characters/npc', animation: 'walk' }) });
    expect(find(AnimationComponent)).toMatchObject({ forcedPhase: 'walk', hasRun: false });
  });

  it('Sprite (object asset): static frame or named animation, no AnimationComponent', () => {
    const still = expand({ Sprite: createDefaultComponent('Sprite', { asset: 'objects/chest', frame: 2 }) });
    expect(still.find(SpriteComponent)).toMatchObject({ texture: spriteTextureKey('objects/chest', 'sheet'), frame: 2, animKey: undefined });
    expect(still.find(AnimationComponent)).toBeUndefined();
    const anim = expand({ Sprite: createDefaultComponent('Sprite', { asset: 'objects/chest', animation: 'shine' }) });
    expect(anim.find(SpriteComponent)!.animKey).toBe(objectAnimKey('objects/chest', 'shine'));
    const unknownAnim = expand({ Sprite: createDefaultComponent('Sprite', { asset: 'objects/chest', animation: 'nope' }) });
    expect(unknownAnim.find(SpriteComponent)!.animKey).toBeUndefined();
  });

  it('Sprite with an empty asset has no graphic and no warning; an unknown asset warns instead of crashing', () => {
    const empty = expand({ Sprite: createDefaultComponent('Sprite', { asset: '' }) });
    expect(empty.find(SpriteComponent)).toBeUndefined();
    expect(warnings).toEqual([]);
    const missing = expand({ Sprite: createDefaultComponent('Sprite', { asset: 'objects/ghost' }), Tag: { tag: 'x' } });
    expect(missing.find(SpriteComponent)).toBeUndefined();
    expect(missing.find(TagComponent)).toBeDefined(); // the rest of the entity survives
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('objects/ghost');
  });

  it('Collider: new 32x32 default, offsets, solid flag', () => {
    expect(expand({ Collider: {} }).find(ColliderComponent)).toMatchObject({ width: 32, height: 32, offsetX: 0, offsetY: 0, isSolid: true });
    expect(expand({ Collider: { width: 48, height: 16, offsetX: 4, offsetY: -8, isSolid: false } }).find(ColliderComponent)).toMatchObject({
      width: 48, height: 16, offsetX: 4, offsetY: -8, isSolid: false,
    });
  });

  it('Movement controller none -> GridMovement only, facing from the Sprite', () => {
    const { find } = expand({
      Sprite: createDefaultComponent('Sprite', { asset: 'characters/npc', facing: 'up' }),
      Movement: createDefaultComponent('Movement', { controller: 'none', speed: 80 }),
    });
    expect(find(GridMovementComponent)).toMatchObject({ speed: 80, direction: 'up' });
    expect(find(FreeMovementComponent)).toBeUndefined();
    expect(find(PlayerControlComponent)).toBeUndefined();
    expect(find(AIWanderComponent)).toBeUndefined();
  });

  it('Movement controller player -> Grid + Free + PlayerControl (canRun)', () => {
    const { find } = expand({ Movement: createDefaultComponent('Movement', { controller: 'player', speed: 200, canRun: false }) });
    expect(find(GridMovementComponent)).toMatchObject({ speed: 200 });
    expect(find(FreeMovementComponent)).toMatchObject({ speed: 200 });
    expect(find(PlayerControlComponent)).toMatchObject({ canRun: false });
  });

  it('Movement controller wander -> GridMovement + AIWander with radius, interval and speed', () => {
    const { find } = expand({ Movement: createDefaultComponent('Movement', { controller: 'wander', speed: 70, wanderRadius: 2, wanderInterval: 1500 }) });
    expect(find(AIWanderComponent)).toMatchObject({ radius: 2, interval: 1500, speed: 70 });
    expect(find(GridMovementComponent)).toMatchObject({ speed: 70 });
    expect(find(FreeMovementComponent)).toBeUndefined();
  });

  it('Event -> EventComponent with the states, the authored sprite and the authored solid flag', () => {
    const { find } = expand({
      Sprite: createDefaultComponent('Sprite', { asset: 'objects/chest' }),
      Collider: createDefaultComponent('Collider', { isSolid: false }),
      Event: { states: [{ id: 'p', name: 'P', conditions: [], trigger: 'playerTouch', commands: [], faceOnInteract: true, solid: null, appearance: {} }] },
    });
    const ev = find(EventComponent)!;
    expect(ev.states).toHaveLength(1);
    expect(ev.states[0].trigger).toBe('playerTouch');
    expect(ev.baseSprite?.asset).toBe('objects/chest');
    expect(ev.baseSolid).toBe(false);
    expect(ev.activeState).toBe(-1);
  });

  it('Event with no states gets the default empty action state; Tag falls back to "entity"', () => {
    const { find } = expand({ Event: {}, Tag: { tag: '' } });
    expect(find(EventComponent)!.states).toHaveLength(1);
    expect(find(TagComponent)!.tag).toBe('entity');
  });

  it('bad props are normalised, unknown components are reported', () => {
    const { find } = expand({ Collider: { width: 'wide', height: -4, isSolid: 'maybe' }, Bogus: {} });
    expect(find(ColliderComponent)).toMatchObject({ width: 32, height: 1, isSolid: true });
    expect(warnings.some((w) => w.includes('Bogus'))).toBe(true);
  });
});

describe('legacy maps through the spawner', () => {
  it('a legacy NPC (SpriteView + CharacterAnimation + GridMovement + AIWander + Interactable) is migrated to the new components', () => {
    const w = new World();
    const { entities, problems } = hydrateMapEntities(w, [{
      id: 'npc-1', name: 'Elder', x: 48, y: 64,
      components: {
        Transform: { x: 48, y: 64, depth: 10 },
        SpriteView: { texture: 'npc-walk', frame: 0 },
        CharacterAnimation: { characterKey: 'npc', direction: 'left' },
        GridMovement: { speed: 80, direction: 'left' },
        AIWander: { radius: 2, interval: 2500, speed: 55 },
        Interactable: { type: 'on_interact', message: 'Hi', eventKey: 'EV' },
      },
    }], ctx);
    expect(problems).toEqual([]);
    const e = entities[0];
    expect(w.getComponent(e, AnimationComponent)).toMatchObject({ assetId: 'characters/npc', direction: 'left' });
    expect(w.getComponent(e, AIWanderComponent)).toMatchObject({ radius: 2, interval: 2500, speed: 55 });
    const state = w.getComponent(e, EventComponent)!.states[0];
    expect(commandTypes(state)).toEqual(['showText', 'emit']);
  });

  it('a legacy Interactable without content shows the entity name', () => {
    const w = new World();
    const { entities } = hydrateMapEntities(w, [{ id: 's', name: 'Old Sign', components: { Transform: { x: 1, y: 2 }, Interactable: {} } }], ctx);
    expect(firstCommand(w.getComponent(entities[0], EventComponent)!.states[0]).params.text).toBe('Old Sign');
  });
});

describe('factory (new component names)', () => {
  it('returns the primary runtime component of each new type', () => {
    spriteRegistry.load({ sprites: [...testSprites().all()] });
    expect(createComponentFromData('Sprite', { asset: 'characters/player' })).toBeInstanceOf(SpriteComponent);
    expect(createComponentFromData('Sprite', { asset: '' })).toBeInstanceOf(SpriteComponent);
    expect(() => createComponentFromData('Sprite', { asset: 'objects/ghost' })).toThrow(ComponentDataError);
    expect(createComponentFromData('Movement', { controller: 'player' })).toBeInstanceOf(GridMovementComponent);
    expect(createComponentFromData('Event', {})).toBeInstanceOf(EventComponent);
    spriteRegistry.clear();
  });
});

describe('PlayerPrefab', () => {
  it('builds the player in the new model with identical gameplay components', () => {
    spriteRegistry.load({ sprites: [...testSprites().all()] });
    const w = new World();
    const { entity: p } = spawnPlayer(w, { width: 20, height: 15 }, 32, { col: 3, row: 4, facing: 'up' });
    expect(w.getComponent(p, TransformComponent)).toMatchObject({ x: 3 * 32 + 16, y: 5 * 32, depth: 20 });
    expect(w.getComponent(p, SpriteComponent)).toMatchObject({ assetId: 'characters/player' });
    expect(w.getComponent(p, ColliderComponent)).toMatchObject({ width: 16, height: 8, isSolid: true });
    expect(w.getComponent(p, GridMovementComponent)).toMatchObject({ speed: 200, direction: 'up' });
    expect(w.getComponent(p, FreeMovementComponent)).toMatchObject({ speed: 200 });
    expect(w.hasComponent(p, PlayerControlComponent)).toBe(true);
    expect(w.getComponent(p, TagComponent)!.tag).toBe('player');
    expect(w.getComponent(p, EntityInfoComponent)!.editorId).toBe('player');
    expect(PlayerPrefab.name).toBe('Player');
    spriteRegistry.clear();
  });

  it('spawnPlayer clamps a warp tile to the map', () => {
    const w = new World();
    const spawn = spawnPlayer(w, { width: 10, height: 8 }, 32, { col: 99, row: -4 });
    expect([spawn.x, spawn.y]).toEqual([9 * 32 + 16, 32]);
  });
});

describe('PlayerControl.canRun', () => {
  it('the run key has no effect when canRun is false', () => {
    const w = new World();
    const e = w.createEntity();
    w.addComponent(e, PlayerControl({ canRun: false }));
    const grid = w.addComponent(e, new GridMovementComponent());
    const input = new InputSystem();
    input.setSnapshot({ direction: 'right', vector: { x: 1, y: 0 }, isRunning: true, holdDuration: 100 });
    gameState.setInputLocked(false);
    input.update(w, 16);
    expect(grid.movementType).toBe('walk');
  });
});

vi.spyOn(console, 'warn').mockImplementation(() => {});
