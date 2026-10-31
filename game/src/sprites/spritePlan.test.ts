import { describe, it, expect } from 'vitest';
import { characterAnimKey, objectAnimKey, spriteTextureKey } from '@shared/engine/index.ts';
import { createPlannedAnimations, planSpriteLoads } from './spritePlan';
import { applySpriteProps, hexToTint } from './spriteState';
import { characterMeta, manifestEntry, objectMeta, testSprites } from '@/test/helpers';
import { parseTilesetManifest } from '@/data/gameData';
import { SpriteRegistry } from '@/data/spriteRegistry';
import { parseBootParams } from '@/core/bootParams';
import { paginateLines, normalizeDialogue, moveCursor, dialogueBoxMetrics } from '@/components/dialogueText';
import { World } from '@/ecs/World';
import { readFileSync } from 'node:fs';

describe('planSpriteLoads (manifest-driven loading)', () => {
  it('registers walk/run textures for characters and `sheet` for objects with the right frame config', () => {
    const plan = planSpriteLoads([
      manifestEntry('characters/player', characterMeta()),
      manifestEntry('objects/chest', objectMeta({ frameWidth: 24, frameHeight: 20, margin: 1, spacing: 2 })),
    ]);
    expect(plan.sheets.map((s) => s.textureKey)).toEqual([
      spriteTextureKey('characters/player', 'walk'),
      spriteTextureKey('characters/player', 'run'),
      spriteTextureKey('objects/chest', 'sheet'),
    ]);
    expect(plan.sheets[0]).toMatchObject({ url: 'graphics/sprites/characters/player/walk.png', frameWidth: 32, frameHeight: 48, margin: 0, spacing: 0 });
    expect(plan.sheets[2]).toMatchObject({ frameWidth: 24, frameHeight: 20, margin: 1, spacing: 2 });
  });

  it('creates idle/walk(/run) x 4 facings for characters and one animation per named animation for objects', () => {
    const plan = planSpriteLoads([
      manifestEntry('characters/player', characterMeta()),
      manifestEntry('characters/npc', characterMeta({ character: { sheets: { walk: 'walk.png' }, framesPerDirection: 4, idleFrame: 0, walkFps: 8, runFps: 12 } })),
      manifestEntry('objects/chest', objectMeta()),
    ]);
    const keys = plan.animations.map((a) => a.key);
    for (const f of ['down', 'left', 'right', 'up'] as const) {
      expect(keys).toContain(characterAnimKey('characters/player', 'idle', f));
      expect(keys).toContain(characterAnimKey('characters/player', 'walk', f));
      expect(keys).toContain(characterAnimKey('characters/player', 'run', f));
      expect(keys).toContain(characterAnimKey('characters/npc', 'walk', f));
      expect(keys).not.toContain(characterAnimKey('characters/npc', 'run', f));
    }
    expect(keys).toContain(objectAnimKey('objects/chest', 'open'));
    expect(keys).toContain(objectAnimKey('objects/chest', 'shine'));
    const run = plan.animations.find((a) => a.key === characterAnimKey('characters/player', 'run', 'up'))!;
    expect(run.textureKey).toBe(spriteTextureKey('characters/player', 'run'));
    expect(run.frames).toEqual([12, 13, 14, 15]);
  });

  it('skips sheets without a URL (and their animations) and reports them', () => {
    const entry = manifestEntry('objects/chest', objectMeta());
    entry.files = {};
    const plan = planSpriteLoads([entry]);
    expect(plan.sheets).toEqual([]);
    expect(plan.animations).toEqual([]);
    expect(plan.problems).toHaveLength(1);
  });

  it('plans the real generated manifest (data/sprites.json)', () => {
    const raw = JSON.parse(readFileSync(new URL('../../public/data/sprites.json', import.meta.url), 'utf8'));
    const registry = new SpriteRegistry();
    const result = registry.load(raw);
    expect(result.skipped).toEqual([]);
    expect(registry.has('characters/player')).toBe(true);
    const plan = planSpriteLoads(registry.all());
    expect(plan.problems).toEqual([]);
    expect(plan.sheets.length).toBeGreaterThanOrEqual(3);
  });

  it('createPlannedAnimations creates frames with the texture key and skips existing animations', () => {
    const created: Array<{ key: string; repeat: number; frameRate: number; frames: unknown[] }> = [];
    const existing = new Set<string>([characterAnimKey('characters/player', 'idle', 'down')]);
    const factory = {
      exists: (k: string) => existing.has(k),
      create: (c: { key: string; repeat: number; frameRate: number; frames: unknown[] }) => {
        existing.add(c.key);
        created.push(c);
      },
    };
    const plan = planSpriteLoads([manifestEntry('characters/player', characterMeta()), manifestEntry('objects/chest', objectMeta())]);
    const keys = createPlannedAnimations(factory as never, plan.animations);
    expect(keys).not.toContain(characterAnimKey('characters/player', 'idle', 'down'));
    const walk = created.find((c) => c.key === characterAnimKey('characters/player', 'walk', 'left'))!;
    expect(walk).toMatchObject({ repeat: -1, frameRate: 10 });
    expect(walk.frames[0]).toEqual({ key: spriteTextureKey('characters/player', 'walk'), frame: 4 });
    expect(created.find((c) => c.key === objectAnimKey('objects/chest', 'open'))!.repeat).toBe(0);
    expect(createPlannedAnimations(factory as never, plan.animations)).toEqual([]);
  });
});

describe('SpriteRegistry', () => {
  it('skips invalid entries without throwing', () => {
    const r = new SpriteRegistry();
    const res = r.load({ sprites: [{ id: 'a', meta: { version: 2 } }, { nope: 1 }, manifestEntry('ok', objectMeta())] });
    expect(res.loaded).toEqual(['ok']);
    expect(res.skipped).toHaveLength(2);
    expect(r.load(null).loaded).toEqual([]);
  });
});

describe('applySpriteProps', () => {
  it('hexToTint', () => {
    expect(hexToTint('#00ff10')).toBe(0x00ff10);
    expect(hexToTint('')).toBeUndefined();
    expect(hexToTint('red')).toBeUndefined();
  });

  it('removes the graphic for an empty asset', () => {
    const w = new World();
    const e = w.createEntity();
    const sprites = testSprites();
    const base = { asset: 'objects/chest', facing: 'down', animation: '', frame: 0, offsetX: 0, offsetY: 0, scale: 1, flipX: false, tint: '', opacity: 1, visible: true } as const;
    expect(applySpriteProps(w, e, { ...base }, sprites)).toBe(true);
    expect(w.getComponents(e)).toHaveLength(1);
    expect(applySpriteProps(w, e, { ...base, asset: '' }, sprites)).toBe(true);
    expect(w.getComponents(e)).toHaveLength(0);
    const warn: string[] = [];
    expect(applySpriteProps(w, e, { ...base, asset: 'nope' }, sprites, (m) => warn.push(m))).toBe(false);
    expect(warn).toHaveLength(1);
  });
});

describe('tileset manifest', () => {
  it('parses defensively', () => {
    expect(parseTilesetManifest({ tilesets: [{ name: 'a', file: 'x.png' }, { name: 'a', file: 'y.png' }, { name: '', file: 'z' }, null, { name: 'b' }] })).toEqual([{ name: 'a', file: 'x.png' }]);
    expect(parseTilesetManifest(undefined)).toEqual([]);
    const real = parseTilesetManifest(JSON.parse(readFileSync(new URL('../../public/data/tilesets.json', import.meta.url), 'utf8')));
    expect(real.map((t) => t.name)).toContain('grass');
  });
});

describe('boot params', () => {
  it('reads renderer, map and debug from the query string', () => {
    expect(parseBootParams('')).toEqual({ renderer: 'auto', map: undefined, debug: false });
    expect(parseBootParams('?renderer=canvas&map=market&debug=1')).toEqual({ renderer: 'canvas', map: 'market', debug: true });
    expect(parseBootParams('?renderer=WEBGL&debug')).toMatchObject({ renderer: 'webgl', debug: true });
    expect(parseBootParams('?renderer=vulkan&debug=0&map=')).toEqual({ renderer: 'auto', map: undefined, debug: false });
  });
});

describe('dialogue text helpers', () => {
  it('paginates wrapped lines', () => {
    expect(paginateLines('a\nb\nc\nd\ne', 2)).toEqual(['a\nb', 'c\nd', 'e']);
    expect(paginateLines('', 3)).toEqual(['']);
    expect(paginateLines('a\nb', 0)).toEqual(['a', 'b']);
  });
  it('normalises legacy string and object payloads', () => {
    expect(normalizeDialogue('hi')).toEqual({ speaker: '', text: 'hi' });
    expect(normalizeDialogue({ speaker: ' Ann ', text: 't' })).toEqual({ speaker: 'Ann', text: 't' });
    expect(normalizeDialogue(undefined)).toEqual({ speaker: '', text: '' });
  });
  it('moveCursor wraps both ways', () => {
    expect(moveCursor(0, -1, 3)).toBe(2);
    expect(moveCursor(2, 1, 3)).toBe(0);
    expect(moveCursor(0, 1, 0)).toBe(0);
  });
  it('dialogue box fits small screens with fewer lines', () => {
    expect(dialogueBoxMetrics(1200, 900).maxLines).toBe(3);
    expect(dialogueBoxMetrics(400, 300).maxLines).toBe(1);
    expect(dialogueBoxMetrics(400, 300).w).toBe(360);
  });
});
