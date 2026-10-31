import { describe, it, expect, beforeEach } from 'vitest';
import { characterAnimKey, clipAnimKey, effectiveFps } from '@shared/engine/index.ts';
import { AnimationSystem } from './AnimationSystem';
import { AnimatorComponent } from '../components/AnimatorComponent';
import { GridMovementComponent } from '../components/GridMovementComponent';
import { FreeMovementComponent } from '../components/FreeMovementComponent';
import { SpriteComponent } from '../components/SpriteComponent';
import { makeRig, type Rig } from '@/test/rig';
import { characterRegistry, heroDef } from '@/test/characters';
import { setClipSpeed } from '@/sprites/animatorOps';
import { settingsStore } from '@/core/SettingsStore';
import { MovementType } from '@/utils/Direction';
import type { Entity } from '../Entity';

let rig: Rig;
beforeEach(() => {
  settingsStore.tileBasedMovement = true;
});

function setup(sprites = characterRegistry({ 'characters/hero': heroDef(), 'objects/flower': heroDef('Flower', { facing: 'none', clips: { sway: heroDef().clips.sway }, bindings: {} }) })) {
  rig = makeRig({ sprites });
  rig.world.addSystem(new AnimationSystem());
}

function walker(asset = 'characters/hero', facing: 'down' | 'left' | 'right' | 'up' = 'down', speed = 100): { e: Entity; a: AnimatorComponent; grid: GridMovementComponent } {
  const e = rig.add({ sprite: { asset, facing }, movement: { controller: 'none', speed } });
  const grid = rig.world.getComponent(e, GridMovementComponent)!;
  grid.direction = facing;
  return { e, a: rig.world.getComponent(e, AnimatorComponent)!, grid };
}

const tick = () => rig.world.update(16);

describe('AnimationSystem: bindings drive the clip', () => {
  it('idle -> walk -> run -> idle, with the v1 key names (sprite:<id>:<phase>-<facing>)', () => {
    setup();
    const { a, grid } = walker('characters/hero', 'left');
    tick();
    expect(a.currentAnimKey).toBe(characterAnimKey('characters/hero', 'idle', 'left'));
    grid.isMoving = true;
    tick();
    expect(a.currentAnimKey).toBe(characterAnimKey('characters/hero', 'walk', 'left'));
    grid.movementType = MovementType.RUN;
    tick();
    expect(a.currentAnimKey).toBe(characterAnimKey('characters/hero', 'run', 'left'));
    grid.isMoving = false;
    tick();
    expect(a.currentAnimKey).toBe(characterAnimKey('characters/hero', 'idle', 'left'));
  });

  it('the migrated test npc (no run sheet) walks when running', () => {
    rig = makeRig();
    rig.world.addSystem(new AnimationSystem());
    const { a, grid } = walker('characters/npc', 'up');
    grid.isMoving = true;
    grid.movementType = MovementType.RUN;
    tick();
    expect(a.currentAnimKey).toBe(characterAnimKey('characters/npc', 'walk', 'up'));
    expect(a.timeScale).toBe(1); // migrated clips never follow speed
  });

  it('movement mode selects <mode>.<activity> bindings and falls back to the plain ones', () => {
    setup();
    const { a, grid } = walker();
    a.mode = 'swim';
    tick();
    expect(a.currentAnimKey).toBe(clipAnimKey('characters/hero', 'swim_idle', 'down'));
    grid.isMoving = true;
    tick();
    expect(a.currentAnimKey).toBe(clipAnimKey('characters/hero', 'swim', 'down'));
    grid.movementType = MovementType.RUN; // swim.run -> swim.walk
    tick();
    expect(a.currentAnimKey).toBe(clipAnimKey('characters/hero', 'swim', 'down'));
    a.mode = 'normal';
    tick();
    expect(a.currentAnimKey).toBe(clipAnimKey('characters/hero', 'run', 'down'));
  });

  it('an explicit clip bypasses the bindings; activity names fall back through them', () => {
    setup();
    const { a, grid } = walker();
    grid.isMoving = true;
    a.explicitClip = 'sway';
    tick();
    expect(a.currentAnimKey).toBe('sprite:characters/hero:sway'); // non-directional: no facing suffix
    a.explicitClip = 'run';
    tick();
    expect(a.currentAnimKey).toBe(clipAnimKey('characters/hero', 'run', 'down'));
    a.explicitClip = 'nonsense';
    tick();
    expect(a.currentAnimKey).toBe('');
  });

  it('a facing-none character plays its explicit clip and otherwise shows its static frame', () => {
    setup();
    const e = rig.add({ sprite: { asset: 'objects/flower', animation: 'sway' } });
    const a = rig.world.getComponent(e, AnimatorComponent)!;
    tick();
    expect(a.currentAnimKey).toBe('sprite:objects/flower:sway');
    a.explicitClip = null;
    tick();
    expect(a.currentAnimKey).toBe('');
  });

  it('a mirrored facing plays the source facing animation flipped', () => {
    setup();
    const { a, grid } = walker('characters/hero', 'left');
    a.explicitClip = 'attack';
    tick();
    expect(a.currentAnimKey).toBe(clipAnimKey('characters/hero', 'attack', 'right'));
    expect(a.flipX).toBe(true);
    grid.direction = 'right';
    tick();
    expect(a.currentAnimKey).toBe(clipAnimKey('characters/hero', 'attack', 'right'));
    expect(a.flipX).toBe(false);
  });

  it('free movement (non tile-based) drives facing, activity and speed for the player', () => {
    setup();
    settingsStore.tileBasedMovement = false;
    const e = rig.add({ sprite: { asset: 'characters/hero' }, movement: { controller: 'player', speed: 200 } });
    const free = rig.world.getComponent(e, FreeMovementComponent)!;
    const a = rig.world.getComponent(e, AnimatorComponent)!;
    free.direction = 'up';
    free.isMoving = true;
    free.movementType = MovementType.RUN;
    free.isRunning = true;
    tick();
    expect(a.currentAnimKey).toBe(clipAnimKey('characters/hero', 'run', 'up'));
    expect(a.entitySpeed).toBe(300); // 200 × RUN_SPEED_MULTIPLIER
    settingsStore.tileBasedMovement = true;
  });

  it('a clip on a sheet with its own pivot moves the sprite origin', () => {
    setup();
    const { e, a } = walker();
    tick();
    expect(rig.world.getComponent(e, SpriteComponent)!.originY).toBe(1);
    a.explicitClip = 'attack';
    tick();
    expect(rig.world.getComponent(e, SpriteComponent)!.originY).toBe(0.75);
    a.explicitClip = null;
    tick();
    expect(rig.world.getComponent(e, SpriteComponent)!.originY).toBe(1);
  });

  it('a waiting one-shot is released when nothing can play', () => {
    setup();
    const { a } = walker();
    let released = false;
    a.explicitClip = 'nonsense';
    a.oneShot = { clip: 'nonsense', then: 'auto', resolve: () => (released = true) };
    tick();
    expect(released).toBe(true);
    expect(a.oneShot).toBeNull();
  });
});

describe('AnimationSystem: dynamic speed (timeScale = effective fps / authored fps)', () => {
  it('agrees with the shared effectiveFps (the function the editor preview uses) for any speed', () => {
    setup();
    const { a, grid } = walker();
    const hero = a.def!;
    grid.isMoving = true;
    for (const [clip, type] of [['walk', MovementType.WALK], ['run', MovementType.RUN]] as const) {
      grid.movementType = type;
      for (const speed of [0, 10, 60, 100, 150, 400, 5000]) {
        for (const animSpeed of [0, 0.5, 1, 2.5]) {
          grid.speed = speed;
          a.animSpeed = animSpeed;
          tick();
          const entitySpeed = type === MovementType.RUN ? speed * 1.5 : speed;
          expect(a.currentClip).toBe(clip);
          expect(a.timeScale * hero.clips[clip].fps).toBeCloseTo(effectiveFps(hero.clips[clip], entitySpeed, animSpeed), 9);
        }
      }
    }
  });

  it('walk follows movement speed against its reference; run includes the run multiplier', () => {
    setup();
    const { a, grid } = walker('characters/hero', 'down', 100);
    grid.isMoving = true;
    tick();
    expect(a.timeScale).toBe(1); // 100 / 100
    grid.speed = 250; // a `speed` route step or setMoveSpeed
    tick();
    expect(a.timeScale).toBe(2.5);
    grid.speed = 5;
    tick();
    expect(a.timeScale).toBe(0.25); // clamped
    grid.speed = 100;
    grid.movementType = MovementType.RUN;
    tick();
    expect(a.entitySpeed).toBe(150);
    expect(a.timeScale).toBe(1); // 150 / reference 150
  });

  it('animSpeed scales every clip, 0 pauses, and a play speed multiplies on top', () => {
    setup();
    const { a } = walker();
    a.animSpeed = 2;
    tick();
    expect(a.timeScale).toBe(2); // idle has no follow speed
    a.animSpeed = 0;
    tick();
    expect(a.timeScale).toBe(0);
    a.animSpeed = 1;
    a.playSpeed = 3;
    tick();
    expect(a.timeScale).toBe(3);
  });

  it('per-clip overrides: a scale applies to that clip, an absolute fps replaces the authored one', () => {
    setup();
    const { a, grid } = walker();
    grid.isMoving = true;
    setClipSpeed(a, { value: 2, mode: 'scale', clip: 'walk' });
    tick();
    expect(a.timeScale).toBe(2);
    setClipSpeed(a, { value: 30, mode: 'fps', clip: 'walk' }); // walk is authored at 10 fps
    tick();
    expect(a.timeScale).toBe(3);
    grid.isMoving = false;
    tick(); // idle: untouched by the walk override
    expect(a.timeScale).toBe(1);
    setClipSpeed(a, { value: 2, mode: 'fps' }); // every clip, absolute (idle is authored at 1 fps)
    tick();
    expect(a.timeScale).toBe(2);
  });
});
