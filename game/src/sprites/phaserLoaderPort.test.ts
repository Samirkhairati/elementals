import { describe, expect, it } from 'vitest';
import type { Scene } from 'phaser';
import { phaserLoaderPort } from './phaserLoaderPort';

function fakeScene() {
  const calls: string[] = [];
  let onComplete: (() => void) | undefined;
  const scene = {
    textures: { exists: (k: string) => k === 'have' },
    anims: { exists: () => false, create: (c: { key: string }) => calls.push(`anim ${c.key}`) },
    load: {
      path: 'data/maps', // what the Preloader leaves behind after queueing the maps
      setPath(p: string) { this.path = p; calls.push(`path "${p}"`); },
      spritesheet(key: string, url: string) { calls.push(`sheet ${key} ${this.path}${url}`); },
      once(_e: string, cb: () => void) { onComplete = cb; },
      start() { calls.push('start'); },
    },
  };
  return { scene: scene as unknown as Scene, calls, finish: () => onComplete?.() };
}

describe('phaserLoaderPort', () => {
  it('resets the loader path before queueing, so manifest URLs are not prefixed (a leftover "data/maps" broke every sheet)', () => {
    const { scene, calls } = fakeScene();
    const port = phaserLoaderPort(scene);
    port.queueSheet({ textureKey: 'sprite:a:walk', url: 'graphics/a/walk.png', frameWidth: 32, frameHeight: 48, margin: 0, spacing: 0 });
    expect(calls).toEqual(['path ""', 'sheet sprite:a:walk graphics/a/walk.png']);
  });

  it('starts the loader and reports completion once; knows existing textures; creates animations through the manager', () => {
    const { scene, calls, finish } = fakeScene();
    const port = phaserLoaderPort(scene);
    let done = 0;
    port.start(() => done++);
    expect(calls).toEqual(['start']);
    finish();
    expect(done).toBe(1);
    expect(port.textureExists('have')).toBe(true);
    expect(port.textureExists('nope')).toBe(false);
    port.createAnimations([{ key: 'k', textureKey: 't', frames: [0], fps: 1, loop: false }]);
    expect(calls).toContain('anim k');
  });
});
