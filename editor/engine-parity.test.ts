// The Electron main process cannot import shared/ (its tsconfig has rootDir "electron"), so the sprite and
// database rules it enforces are re-implemented in electron/ipc/{spriteMeta,databaseStore,spriteStore}.ts.
// This test pins those copies to shared/engine so the editor's IPC, the sync script and the game agree.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { previewFrame, validateSpriteMeta as sharedValidateSpriteMeta } from '../shared/engine/sprites';
import { clipFrameAt, clipFrames, effectiveFps, resolveClip } from '../shared/engine/characters';
import { migrateCharacter } from '../shared/engine/characterMigrate';
import { FACINGS } from '../shared/engine/constants';
import type { SpriteAssetMeta } from '../shared/engine/types';
import { isValidCharacterId as sharedIsValidCharacterId, isValidGraphicId as sharedIsValidGraphicId } from '../shared/engine/graphics';
import { normalizeDatabase as sharedNormalizeDatabase, validateDatabase as sharedValidateDatabase } from '../shared/engine/database';
import { makeTempDirTracker } from './electron/__testutils__/helpers';
import { normalizeDatabase, validateDatabase } from './electron/ipc/databaseStore';
import { isValidCharacterId, isValidGraphicId } from './electron/ipc/characterStore';

const REPO = path.resolve(__dirname, '..');
const tmp = makeTempDirTracker();
beforeEach(() => undefined);
afterEach(() => tmp.cleanup());

describe('id rules agree with shared/engine', () => {
  const ids = ['characters/player', 'a', 'a/b-c_d', '', '/a', 'a/', 'a//b', '../x', 'a/../b', '-a', 'a b', 'a.png', 'Ünï', 'a/B9', 'x\0y', 5, null, undefined];
  it.each(ids.map((i) => [i] as [unknown]))('character id %j', (id) => {
    expect(isValidCharacterId(id)).toBe(sharedIsValidCharacterId(id));
  });
  const graphics = ['sprites/player/walk.png', 'a.png', 'a.PNG', 'a/b.png', 'a.gif', 'a', '.png', '../a.png', 'a/../b.png', 'a b.png', '/a.png', 'a//b.png', 'a/.png', 5, null];
  it.each(graphics.map((i) => [i] as [unknown]))('graphic id %j', (id) => {
    expect(isValidGraphicId(id)).toBe(sharedIsValidGraphicId(id));
  });
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

describe('the committed project data passes the validators', () => {
  it('database.json', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(REPO, 'project', 'database.json'), 'utf8'));
    expect(sharedValidateDatabase(raw)).toMatchObject({ ok: true, warnings: [] });
    expect(validateDatabase(raw)).toEqual([]);
  });
});

describe('character v2 rules agree with the v1 preview the editor still uses', () => {
  // The v1 preview (previewFrame) and the v2 clip maths must show the same frame for the same facing,
  // animation and time, so migrated characters look identical in the editor preview and in the game.
  const spritesDir = path.join(REPO, 'shared', 'fixtures', 'sprites-v1');
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
