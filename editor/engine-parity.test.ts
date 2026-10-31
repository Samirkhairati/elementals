// The Electron main process cannot import shared/ (its tsconfig has rootDir "electron"), so the sprite and
// database rules it enforces are re-implemented in electron/ipc/{spriteMeta,databaseStore,spriteStore}.ts.
// This test pins those copies to shared/engine so the editor's IPC, the sync script and the game agree.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultSpriteMeta, previewFrame, validateSpriteMeta as sharedValidateSpriteMeta } from '../shared/engine/sprites';
import { clipFrameAt, clipFrames, effectiveFps, resolveClip } from '../shared/engine/characters';
import { migrateCharacter } from '../shared/engine/characterMigrate';
import { FACINGS } from '../shared/engine/constants';
import type { SpriteAssetMeta } from '../shared/engine/types';
import { normalizeDatabase as sharedNormalizeDatabase, validateDatabase as sharedValidateDatabase } from '../shared/engine/database';
import { makePng, makeTempDirTracker } from './electron/__testutils__/helpers';
import { normalizeDatabase, validateDatabase } from './electron/ipc/databaseStore';
import { validateSpriteMeta } from './electron/ipc/spriteMeta';
import { importSprite } from './electron/ipc/spriteStore';
import { TilesetCache } from './electron/ipc/tilesetCache';

const REPO = path.resolve(__dirname, '..');
const tmp = makeTempDirTracker();
beforeEach(() => undefined);
afterEach(() => tmp.cleanup());

const base = { version: 1, name: 'X', margin: 0, spacing: 0, pivotX: 0.5, pivotY: 1, frameWidth: 32, frameHeight: 48 };
const character = { ...base, kind: 'character', character: { sheets: { walk: 'walk.png' }, framesPerDirection: 4, idleFrame: 0, walkFps: 8, runFps: 12 } };
const object = { ...base, kind: 'object', sheet: 'sheet.png', frameWidth: 24, frameHeight: 24 };

const metaCases: [string, unknown, boolean][] = [
  ['character', character, true],
  ['character with run sheet', { ...character, character: { ...character.character, sheets: { walk: 'walk.png', run: 'run.png' } } }, true],
  ['object', object, true],
  ['animated', { ...object, kind: 'animated', animations: { idle: { frames: [0], fps: 8, loop: true } } }, true],
  ['wrong version', { ...object, version: 2 }, false],
  ['unknown kind', { ...object, kind: 'monster' }, false],
  ['zero frame width', { ...object, frameWidth: 0 }, false],
  ['fractional frame height', { ...object, frameHeight: 2.5 }, false],
  ['negative margin', { ...object, margin: -1 }, false],
  ['pivot above 1', { ...object, pivotY: 2 }, false],
  ['object without sheet', { ...object, sheet: undefined }, false],
  ['character without section', { ...character, character: undefined }, false],
  ['idleFrame outside the row', { ...character, character: { ...character.character, idleFrame: 4 } }, false],
  ['zero fps', { ...character, character: { ...character.character, walkFps: 0 } }, false],
  ['animation without frames', { ...object, animations: { a: { frames: [], fps: 1, loop: true } } }, false],
  ['animation with negative frame', { ...object, animations: { a: { frames: [-1], fps: 1, loop: true } } }, false],
  ['animation with bad loop', { ...object, animations: { a: { frames: [0], fps: 1, loop: 1 } } }, false],
  ['not an object', 'sprite', false],
];

describe('sprite meta validation agrees with shared/engine', () => {
  it.each(metaCases)('%s', (_label, meta, ok) => {
    expect(sharedValidateSpriteMeta(meta).ok).toBe(ok);
    expect(validateSpriteMeta(meta).ok).toBe(ok);
  });

  it('is stricter only where file access is involved (unsafe sheet names)', () => {
    const evil = { ...object, sheet: '../../secret.png' };
    expect(sharedValidateSpriteMeta(evil).ok).toBe(true); // the shared check does not touch files
    expect(validateSpriteMeta(evil).ok).toBe(false);
  });
});

describe('imported sprites start from the shared defaults', () => {
  const dims: Record<string, [number, number]> = { character: [128, 192], object: [24, 24], animated: [96, 32] };
  for (const kind of ['character', 'object', 'animated'] as const) {
    it(kind, () => {
      const root = tmp.create();
      const src = path.join(root, 'src.png');
      const [w, h] = dims[kind];
      fs.writeFileSync(src, makePng(w, h));
      const { asset } = importSprite(path.join(root, 'sprites'), new TilesetCache(), src, { name: 'Thing', kind });
      expect(asset.meta).toEqual(defaultSpriteMeta(kind, { sheetWidth: w, sheetHeight: h, name: 'Thing' }));
    });
  }
});

describe('database rules agree with shared/engine', () => {
  const db = (over: object = {}) => ({ version: 1, switches: [{ id: 'a', name: 'A' }], variables: [{ id: 'v', name: 'V', initial: 1 }], ...over });
  const cases: [string, unknown, boolean][] = [
    ['valid', db(), true],
    ['empty', db({ switches: [], variables: [] }), true],
    ['wrong version', db({ version: 2 }), false],
    ['duplicate switch ids', db({ switches: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }] }), false],
    ['empty id', db({ switches: [{ id: '', name: 'A' }] }), false],
    ['variable without initial', db({ variables: [{ id: 'v', name: 'V' }] }), false],
    ['not an object', [], false],
  ];
  it.each(cases)('%s', (_label, value, ok) => {
    expect(sharedValidateDatabase(value).ok).toBe(ok);
    expect(validateDatabase(value).length === 0).toBe(ok);
  });

  it('normalisation of a valid database is identical', () => {
    expect(normalizeDatabase(db())).toEqual(sharedNormalizeDatabase(db()));
  });
});

describe('the committed project data passes both validators', () => {
  const spritesDir = path.join(REPO, 'project', 'sprites');
  const metas = fs.existsSync(spritesDir)
    ? fs
        .readdirSync(spritesDir, { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('sprite.json'))
        .map((f) => [f, JSON.parse(fs.readFileSync(path.join(spritesDir, f), 'utf8'))] as const)
    : [];

  it('has sprites to check', () => {
    expect(metas.length).toBeGreaterThanOrEqual(2);
  });
  it.each(metas.map(([f, m]) => [f, m] as [string, unknown]))('%s', (_f, meta) => {
    expect(sharedValidateSpriteMeta(meta)).toMatchObject({ ok: true });
    expect(validateSpriteMeta(meta)).toMatchObject({ ok: true });
  });
  it('database.json', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(REPO, 'project', 'database.json'), 'utf8'));
    expect(sharedValidateDatabase(raw)).toMatchObject({ ok: true, warnings: [] });
    expect(validateDatabase(raw)).toEqual([]);
  });
});

describe('character v2 rules agree with the v1 preview the editor still uses', () => {
  // The v1 preview (previewFrame) and the v2 clip maths must show the same frame for the same facing,
  // animation and time, so migrated characters look identical in the editor preview and in the game.
  const spritesDir = path.join(REPO, 'project', 'sprites');
  const metas = fs
    .readdirSync(spritesDir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('sprite.json'))
    .map((f) => [path.dirname(f).split(path.sep).join('/'), JSON.parse(fs.readFileSync(path.join(spritesDir, f), 'utf8')) as SpriteAssetMeta] as const);
  const ticks = [0, 40, 99, 100, 125, 126, 250, 333, 500, 999, 1000, 2400];

  it.each(metas.map(([id, meta]) => [id, meta] as [string, SpriteAssetMeta]))('%s', (id, meta) => {
    const migrated = migrateCharacter(id, meta);
    if (!migrated.ok) throw new Error(migrated.errors.join('; '));
    const def = migrated.value;
    for (const facing of FACINGS) {
      for (const animation of meta.kind === 'character' ? ['', 'idle', 'walk', 'run'] : ['', ...Object.keys(meta.animations ?? {})]) {
        const activity = animation === 'walk' || animation === 'run' ? animation : 'idle';
        const clipName = meta.kind === 'character' ? resolveClip(def, 'normal', activity) : animation === '' ? null : animation;
        for (const tick of ticks) {
          const v1 = previewFrame(meta, { facing, animation, frame: 0 }, tick, 4096);
          if (clipName === null) {
            expect(v1.frameIndex).toBe(def.still?.frame ?? 0);
            continue;
          }
          const clip = def.clips[clipName];
          const frames = clipFrames(clip, facing)!.frames;
          expect(clipFrameAt(clip, frames, tick)).toBe(v1.frameIndex);
          expect(v1.sheetRole).toBe(clip.sheet);
        }
      }
    }
  });

  it('effectiveFps without follow-speed or animSpeed is the v1 fixed fps for any entity speed', () => {
    for (const [id, meta] of metas) {
      const m = migrateCharacter(id, meta);
      if (!m.ok) throw new Error('unexpected');
      for (const clip of Object.values(m.value.clips)) {
        for (const speed of [0, 50, 100, 150, 1e6]) expect(effectiveFps(clip, speed, 1)).toBe(clip.fps);
      }
    }
  });
});
