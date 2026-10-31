import { describe, it, expect, beforeEach } from 'vitest';
import { buildClipRegistrations, clipAnimKey, spriteTextureKey } from '@shared/engine/index.ts';
import { AnimationSystem } from './AnimationSystem';
import { RenderBridgeSystem } from './RenderBridgeSystem';
import { AnimatorComponent } from '../components/AnimatorComponent';
import { GridMovementComponent } from '../components/GridMovementComponent';
import { SpriteComponent } from '../components/SpriteComponent';
import { makeRig, type Rig } from '@/test/rig';
import { characterRegistry, heroDef } from '@/test/characters';
import { FakeScene } from '@/test/fakePhaser';
import { playClip } from '@/sprites/animatorOps';
import { settingsStore } from '@/core/SettingsStore';
import { MovementType } from '@/utils/Direction';

let rig: Rig;
let scene: FakeScene;

function setup() {
  settingsStore.tileBasedMovement = true;
  const def = heroDef();
  rig = makeRig({ sprites: characterRegistry({ 'characters/hero': def }) });
  scene = new FakeScene(buildClipRegistrations('characters/hero', def));
  rig.world.addSystem(new AnimationSystem());
  rig.world.addSystem(new RenderBridgeSystem(scene.asScene));
}
beforeEach(setup);

function hero(facing: 'down' | 'left' | 'right' | 'up' = 'down', sprite: Record<string, unknown> = {}) {
  const e = rig.add({ sprite: { asset: 'characters/hero', facing, ...sprite }, movement: { controller: 'none', speed: 100 } });
  const grid = rig.world.getComponent(e, GridMovementComponent)!;
  grid.direction = facing;
  return { e, grid, a: rig.world.getComponent(e, AnimatorComponent)!, sc: rig.world.getComponent(e, SpriteComponent)! };
}

/** One game frame: systems, then the (fake) Phaser animation clock. */
const frame = (ms = 16) => {
  rig.world.update(ms);
  scene.tick(ms);
};

describe('RenderBridgeSystem with an animator', () => {
  it('creates the sprite on the idle animation of the facing, at the character pivot', () => {
    const { sc } = hero('right');
    frame();
    const sprite = scene.sprites[0];
    expect(sprite.texture.key).toBe(spriteTextureKey('characters/hero', 'walk'));
    expect(sprite.anims.currentAnim?.key).toBe(clipAnimKey('characters/hero', 'idle', 'right'));
    expect([sprite.originX, sprite.originY]).toEqual([sc.originX, sc.originY]);
    expect(sprite.flipX).toBe(false);
  });

  it('switches animation with movement and keeps a running one instead of restarting it', () => {
    const { grid } = hero();
    frame();
    grid.isMoving = true;
    frame();
    frame();
    frame();
    const sprite = scene.sprites[0];
    expect(sprite.anims.plays).toEqual([clipAnimKey('characters/hero', 'idle', 'down'), clipAnimKey('characters/hero', 'walk', 'down')]);
    grid.movementType = MovementType.RUN;
    frame();
    expect(sprite.anims.currentAnim?.key).toBe(clipAnimKey('characters/hero', 'run', 'down'));
  });

  it('sets anims.timeScale = effective fps / authored fps (follow-speed and animSpeed)', () => {
    const { grid, a } = hero();
    grid.isMoving = true;
    frame();
    const sprite = scene.sprites[0];
    expect(sprite.anims.timeScale).toBe(1);
    grid.speed = 300; // setMoveSpeed / a speed route step
    frame();
    expect(sprite.anims.timeScale).toBe(3);
    a.animSpeed = 0.5;
    frame();
    expect(sprite.anims.timeScale).toBe(1.5);
    a.animSpeed = 0;
    frame();
    expect(sprite.anims.timeScale).toBe(0);
    const before = sprite.anims.elapsed;
    frame(160);
    expect(sprite.anims.elapsed).toBe(before); // paused
  });

  it('a mirrored facing is drawn with flipX, XOR the authored flip', () => {
    const { a } = hero('left');
    a.explicitClip = 'attack';
    frame();
    const sprite = scene.sprites[0];
    expect(sprite.anims.currentAnim?.key).toBe(clipAnimKey('characters/hero', 'attack', 'right'));
    expect(sprite.flipX).toBe(true);

    const flipped = hero('left', { flipX: true });
    flipped.a.explicitClip = 'attack';
    frame();
    expect(scene.sprites[1].flipX).toBe(false);
  });

  it('a finished one-shot resolves its waiter and follows `then`', async () => {
    const { a } = hero('down');
    frame();
    const handle = playClip(a, 'attack', { then: 'auto' })!;
    let done = false;
    void handle.done!.then(() => (done = true));
    frame();
    const sprite = scene.sprites[0];
    expect(sprite.anims.currentAnim?.key).toBe(clipAnimKey('characters/hero', 'attack', 'down'));
    for (let i = 0; i < 20; i++) frame(); // 320 ms of 500
    await Promise.resolve();
    expect(done).toBe(false);
    for (let i = 0; i < 20; i++) frame(); // past 500 ms
    await Promise.resolve();
    await Promise.resolve();
    expect(done).toBe(true);
    frame();
    expect(a.explicitClip).toBeNull();
    expect(sprite.anims.currentAnim?.key).toBe(clipAnimKey('characters/hero', 'idle', 'down'));
  });

  it('a play speed shortens the wait; playing the same clip again restarts it', async () => {
    const { a } = hero('down');
    frame();
    playClip(a, 'attack', { speed: 2, then: 'hold' });
    frame();
    const sprite = scene.sprites[0];
    expect(sprite.anims.timeScale).toBe(2);
    for (let i = 0; i < 20; i++) frame(); // 320 ms × 2 > 500 ms
    expect(sprite.anims.isPlaying).toBe(false);
    expect(a.explicitClip).toBe('attack'); // hold
    const playsBefore = sprite.anims.plays.length;
    playClip(a, 'attack', { then: 'hold' });
    frame();
    expect(sprite.anims.plays.length).toBe(playsBefore + 1);
    expect(sprite.anims.isPlaying).toBe(true);
  });

  it('with no animation the static texture and frame show', () => {
    const e = rig.add({ sprite: { asset: 'characters/hero' }, movement: { controller: 'none' } });
    const a = rig.world.getComponent(e, AnimatorComponent)!;
    a.def = { ...a.def!, bindings: {} }; // nothing bound: only the still frame remains
    frame();
    const sprite = scene.sprites[0];
    expect(sprite.anims.currentAnim).toBeNull();
    expect(sprite.texture.key).toBe(spriteTextureKey('characters/hero', 'walk'));
  });
});
