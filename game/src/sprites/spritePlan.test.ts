import { describe, it, expect } from 'vitest';
import { buildAnimationRegistrations, characterAnimKey, objectAnimKey, spriteSheetRoles, spriteTextureKey, type SpriteAssetMeta } from '@shared/engine/index.ts';
import { createPlannedAnimations, planSpriteLoads } from './spritePlan';
import { applySpriteProps, hexToTint } from './spriteState';
import { characterMeta, legacyManifestEntry, manifestEntry, objectMeta, testSprites } from '@/test/helpers';
import { heroDef } from '@/test/characters';
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

describe('clip-based planning (v2 characters)', () => {
  const hero = heroDef();
  const entry = { id: 'characters/hero', def: hero, files: { walk: 'g/walk.png', run: 'g/run.png', attack: 'g/attack.png' } };

  it('loads every sheet with its own frame size, margin and spacing', () => {
    const big = { ...hero, sheets: { ...hero.sheets, attack: { ...hero.sheets.attack, frameWidth: 64, frameHeight: 64, margin: 2, spacing: 1 } } };
    const plan = planSpriteLoads([{ ...entry, def: big }]);
    expect(plan.problems).toEqual([]);
    const by = Object.fromEntries(plan.sheets.map((s) => [s.textureKey, s]));
    expect(by[spriteTextureKey('characters/hero', 'walk')]).toMatchObject({ url: 'g/walk.png', frameWidth: 32, frameHeight: 48, margin: 0, spacing: 0 });
    expect(by[spriteTextureKey('characters/hero', 'attack')]).toMatchObject({ url: 'g/attack.png', frameWidth: 64, frameHeight: 64, margin: 2, spacing: 1 });
  });

  it('registers one animation per clip, per facing for directional clips and none for mirrored facings', () => {
    const keys = planSpriteLoads([entry]).animations.map((a) => a.key);
    expect(keys).toContain('sprite:characters/hero:attack-down');
    expect(keys).toContain('sprite:characters/hero:attack-right');
    expect(keys).not.toContain('sprite:characters/hero:attack-left'); // mirror: left = right flipped
    expect(keys).toContain('sprite:characters/hero:sway'); // non-directional: no facing suffix
    expect(keys.filter((k) => k.includes(':walk-'))).toHaveLength(4);
  });

  it('a clip on a sheet without a URL is left out and reported', () => {
    const plan = planSpriteLoads([{ ...entry, files: { walk: 'g/walk.png', run: 'g/run.png' } }]);
    expect(plan.problems).toHaveLength(1);
    expect(plan.animations.some((a) => a.key.includes(':attack-'))).toBe(false);
    expect(plan.animations.some((a) => a.key.includes(':walk-'))).toBe(true);
  });

  it('ping-pong clips are created with yoyo', () => {
    const created: Array<Record<string, unknown>> = [];
    const factory = { exists: () => false, create: (c: Record<string, unknown>) => created.push(c) };
    const pp = { ...hero, clips: { sway: { ...hero.clips.sway, mode: 'pingpong' as const } }, bindings: {} };
    createPlannedAnimations(factory as never, planSpriteLoads([{ ...entry, def: pp }]).animations);
    expect(created[0]).toMatchObject({ key: 'sprite:characters/hero:sway', yoyo: true, repeat: -1 });
  });
});

describe('golden: the real manifest plans exactly what the v1 code planned', () => {
  const raw = JSON.parse(readFileSync(new URL('../../public/data/sprites.json', import.meta.url), 'utf8')) as { sprites: Array<{ id: string; meta: SpriteAssetMeta; files: Record<string, string> }> };
  const registry = new SpriteRegistry();
  registry.load(raw);
  const plan = planSpriteLoads(registry.all());

  it('has characters to compare', () => {
    expect(raw.sprites.length).toBeGreaterThanOrEqual(10);
    expect(registry.ids().sort()).toEqual(raw.sprites.map((s) => s.id).sort());
  });

  it('same texture keys, urls and frame configuration', () => {
    const expected = raw.sprites.flatMap((s) =>
      spriteSheetRoles(s.meta).map(({ role, file }) => ({
        textureKey: spriteTextureKey(s.id, role), url: s.files[file], frameWidth: s.meta.frameWidth, frameHeight: s.meta.frameHeight, margin: s.meta.margin, spacing: s.meta.spacing,
      })),
    );
    const byKey = (l: Array<{ textureKey: string }>) => Object.fromEntries(l.map((x) => [x.textureKey, x]));
    expect(byKey(plan.sheets)).toEqual(byKey(expected));
  });

  it('same animation keys, texture keys, frames, fps and loop', () => {
    const expected = raw.sprites.flatMap((s) => buildAnimationRegistrations(s.id, s.meta));
    const byKey = (l: Array<{ key: string }>) => Object.fromEntries(l.map((x) => [x.key, x]));
    expect(plan.animations).toHaveLength(expected.length);
    expect(byKey(plan.animations)).toEqual(byKey(expected));
  });
});

describe('SpriteRegistry (v1 and v2 manifests)', () => {
  it('migrates v1 sprite assets on load and re-keys their files by sheet key', () => {
    const r = new SpriteRegistry();
    r.load({ version: 1, sprites: [legacyManifestEntry('characters/player', characterMeta())] });
    const e = r.get('characters/player')!;
    expect(e.def.version).toBe(2);
    expect(e.files).toEqual({ walk: 'graphics/sprites/characters/player/walk.png', run: 'graphics/sprites/characters/player/run.png' });
    expect(r.character('characters/player')).toBe(e.def);
  });

  it('accepts v2 entries in `characters`, and rejects invalid definitions', () => {
    const r = new SpriteRegistry();
    const bad = { ...heroDef(), facing: 'eight' };
    const res = r.load({ characters: [{ id: 'characters/hero', def: heroDef(), files: {} }, { id: 'characters/bad', def: bad, files: {} }] });
    expect(res.loaded).toEqual(['characters/hero']);
    expect(res.skipped.map((s) => s.id)).toEqual(['characters/bad']);
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
    const base = { asset: 'objects/chest', facing: 'down', animation: '', animSpeed: 1, frame: 0, offsetX: 0, offsetY: 0, scale: 1, flipX: false, tint: '', opacity: 1, visible: true } as const;
    expect(applySpriteProps(w, e, { ...base }, sprites)).toBe(true);
    expect(w.getComponents(e)).toHaveLength(2); // Sprite + Animator
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
