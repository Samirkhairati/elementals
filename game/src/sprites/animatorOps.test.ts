import { describe, it, expect } from 'vitest';
import { AnimatorComponent } from '@/ecs/components/AnimatorComponent';
import { canPlay, completeClip, explicitClipName, playClip, setClipSpeed, stopClip } from './animatorOps';
import { heroDef } from '@/test/characters';

const animator = () => new AnimatorComponent({ characterId: 'characters/hero', def: heroDef() });
const settled = (p: Promise<void>) => Promise.race([p.then(() => true), Promise.resolve().then(() => false)]);

describe('explicitClipName / canPlay', () => {
  const def = heroDef();
  it('names a clip, or resolves idle/walk/run through the bindings', () => {
    expect(explicitClipName(def, 'normal', 'attack')).toBe('attack');
    expect(explicitClipName(def, 'normal', 'walk')).toBe('walk');
    expect(explicitClipName(def, 'swim', 'walk')).toBe('walk'); // a clip of that exact name wins over the bindings
    const bound = { ...def, clips: { a: def.clips.idle, b: def.clips.walk }, bindings: { idle: 'a', walk: 'b', 'swim.walk': 'a' } };
    expect(explicitClipName(bound, 'normal', 'walk')).toBe('b');
    expect(explicitClipName(bound, 'swim', 'walk')).toBe('a');
    expect(explicitClipName({ ...def, clips: { idle: def.clips.idle, walk: def.clips.walk }, bindings: { idle: 'idle', walk: 'walk' } }, 'normal', 'run')).toBe('walk');
    expect(explicitClipName(def, 'normal', 'dance')).toBeNull();
    expect(explicitClipName(null, 'normal', 'walk')).toBeNull();
  });
  it('canPlay accepts clips and the three activities', () => {
    expect(canPlay(def, 'attack')).toBe(true);
    expect(canPlay(def, 'run')).toBe(true);
    expect(canPlay(def, 'dance')).toBe(false);
    expect(canPlay(null, 'idle')).toBe(false);
  });
});

describe('playClip / completeClip / stopClip', () => {
  it('an unknown clip cannot play and changes nothing', () => {
    const a = animator();
    expect(playClip(a, 'dance')).toBeNull();
    expect(a.explicitClip).toBeNull();
    expect(a.revision).toBe(0);
  });

  it('a looping clip has no end to wait for', () => {
    const a = animator();
    expect(playClip(a, 'walk')).toEqual({ done: null });
    expect(a.explicitClip).toBe('walk');
    expect(a.oneShot).toBeNull();
  });

  it('a one-shot resolves when Phaser reports its key; "auto" returns to automatic', async () => {
    const a = animator();
    const h = playClip(a, 'attack', { speed: 2, then: 'auto' })!;
    expect(a.playSpeed).toBe(2);
    expect(a.revision).toBe(1);
    a.currentAnimKey = 'sprite:characters/hero:attack-down';
    expect(await settled(h.done!)).toBe(false);
    expect(completeClip(a, 'sprite:characters/hero:walk-down')).toBe(false); // another animation ended
    expect(completeClip(a, a.currentAnimKey)).toBe(true);
    expect(await settled(h.done!)).toBe(true);
    expect(a.explicitClip).toBeNull();
    expect(a.playSpeed).toBe(1);
    expect(a.oneShot).toBeNull();
  });

  it('"hold" keeps the clip on its last frame, "loop" restarts it', async () => {
    const hold = animator();
    const h1 = playClip(hold, 'attack', { then: 'hold' })!;
    hold.currentAnimKey = 'k';
    completeClip(hold, 'k');
    await h1.done;
    expect(hold.explicitClip).toBe('attack');
    expect(hold.revision).toBe(1);

    const loop = animator();
    const h2 = playClip(loop, 'attack', { then: 'loop' })!;
    loop.currentAnimKey = 'k';
    completeClip(loop, 'k');
    await h2.done;
    expect(loop.explicitClip).toBe('attack');
    expect(loop.revision).toBe(2);
  });

  it('playing again releases the previous waiter; stop releases too and returns to automatic', async () => {
    const a = animator();
    const first = playClip(a, 'attack')!;
    const second = playClip(a, 'attack')!;
    expect(await settled(first.done!)).toBe(true);
    expect(await settled(second.done!)).toBe(false);
    stopClip(a);
    expect(await settled(second.done!)).toBe(true);
    expect(a.explicitClip).toBeNull();
  });

  it('a non-finite or negative play speed falls back sanely', () => {
    const a = animator();
    playClip(a, 'walk', { speed: Number.NaN });
    expect(a.playSpeed).toBe(1);
    playClip(a, 'walk', { speed: -4 });
    expect(a.playSpeed).toBe(0);
  });
});

describe('setClipSpeed', () => {
  it('scale without a clip is the Sprite.animSpeed', () => {
    const a = animator();
    setClipSpeed(a, { value: 0.5, mode: 'scale' });
    expect(a.animSpeed).toBe(0.5);
    expect(a.clipSpeeds).toEqual({});
    setClipSpeed(a, { value: -1, mode: 'scale' });
    expect(a.animSpeed).toBe(0);
  });
  it('per-clip scale and fps are separate overrides that merge', () => {
    const a = animator();
    setClipSpeed(a, { value: 2, mode: 'scale', clip: 'walk' });
    setClipSpeed(a, { value: 12, mode: 'fps', clip: 'walk' });
    setClipSpeed(a, { value: 9, mode: 'fps' });
    expect(a.clipSpeeds).toEqual({ walk: { scale: 2, fps: 12 }, '*': { fps: 9 } });
  });
});
