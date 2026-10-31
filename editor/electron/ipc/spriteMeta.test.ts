import { describe, expect, it } from 'vitest';
import {
  isSafeSheetName,
  isValidSpriteId,
  normalizeSpriteMeta,
  sheetGrid,
  slugifySpriteName,
  validateSpriteMeta,
  type SpriteAssetMeta,
} from './spriteMeta';

const character = (): SpriteAssetMeta => ({
  version: 1,
  name: 'Hero',
  kind: 'character',
  frameWidth: 32,
  frameHeight: 48,
  margin: 0,
  spacing: 0,
  pivotX: 0.5,
  pivotY: 1,
  character: { sheets: { walk: 'walk.png', run: 'run.png' }, framesPerDirection: 4, idleFrame: 0, walkFps: 10, runFps: 15 },
});
const object = (): SpriteAssetMeta => ({
  version: 1,
  name: 'Chest',
  kind: 'animated',
  frameWidth: 16,
  frameHeight: 16,
  margin: 0,
  spacing: 0,
  pivotX: 0.5,
  pivotY: 1,
  sheet: 'chest.png',
  animations: { open: { frames: [0, 1, 2], fps: 6, loop: false } },
});

const errorsOf = (m: unknown, sizes?: Parameters<typeof validateSpriteMeta>[1]) => validateSpriteMeta(m, sizes).errors.join(' | ');

describe('validateSpriteMeta (structure)', () => {
  it('accepts valid character and animated metas', () => {
    expect(validateSpriteMeta(character())).toEqual({ ok: true, errors: [] });
    expect(validateSpriteMeta(object())).toEqual({ ok: true, errors: [] });
  });

  it.each([
    ['not an object', 'x', /JSON object/],
    ['bad version', { ...character(), version: 2 }, /version must be 1/],
    ['empty name', { ...character(), name: '  ' }, /name/],
    ['bad kind', { ...character(), kind: 'monster' }, /kind must be one of/],
    ['zero frame width', { ...character(), frameWidth: 0 }, /frameWidth/],
    ['fractional frame height', { ...character(), frameHeight: 1.5 }, /frameHeight/],
    ['negative margin', { ...character(), margin: -1 }, /margin/],
    ['pivot out of range', { ...character(), pivotX: 1.5 }, /pivotX/],
    ['character without block', { ...character(), character: undefined }, /need a "character"/],
    ['character with sheet', { ...character(), sheet: 'a.png' }, /not "sheet"/],
    ['walk sheet with path', { ...character(), character: { ...character().character!, sheets: { walk: '../walk.png' } } }, /character.sheets.walk/],
    ['idleFrame beyond row', { ...character(), character: { ...character().character!, idleFrame: 4 } }, /idleFrame/],
    ['walkFps zero', { ...character(), character: { ...character().character!, walkFps: 0 } }, /walkFps/],
    ['object without sheet', { ...object(), sheet: undefined }, /sheet must be/],
    ['object with character block', { ...object(), character: character().character }, /cannot define "character"/],
    ['animation without frames', { ...object(), animations: { a: { frames: [], fps: 5, loop: true } } }, /frames/],
    ['animation bad fps', { ...object(), animations: { a: { frames: [0], fps: 0, loop: true } } }, /fps/],
    ['animation bad loop', { ...object(), animations: { a: { frames: [0], fps: 4, loop: 'yes' } } }, /loop/],
    ['character with animations', { ...character(), animations: {} }, /cannot define "animations"/],
  ])('rejects: %s', (_label, meta, pattern) => {
    expect(errorsOf(meta)).toMatch(pattern);
  });
});

describe('validateSpriteMeta (against sheet sizes)', () => {
  const sizes = { 'walk.png': { width: 128, height: 192 }, 'run.png': { width: 128, height: 192 } };

  it('accepts matching sheets', () => {
    expect(validateSpriteMeta(character(), sizes).ok).toBe(true);
  });

  it('reports a missing sheet', () => {
    expect(errorsOf(character(), { 'walk.png': sizes['walk.png'] })).toMatch(/sheet "run.png" does not exist/);
  });

  it('reports a frame size that does not tile the sheet', () => {
    expect(errorsOf({ ...character(), frameWidth: 30 }, sizes)).toMatch(/does not tile sheet "walk.png"/);
  });

  it('needs four rows and enough columns for a character', () => {
    expect(errorsOf(character(), { 'walk.png': { width: 128, height: 96 }, 'run.png': sizes['run.png'] })).toMatch(/needs 4/);
    expect(errorsOf({ ...character(), character: { ...character().character!, framesPerDirection: 5 } }, sizes)).toMatch(/framesPerDirection is 5/);
  });

  it('respects margin and spacing', () => {
    const m = { ...object(), margin: 1, spacing: 2 };
    // 2 columns: 1 + 16 + 2 + 16 + 1 = 36
    expect(sheetGrid(m, { width: 36, height: 18 })).toEqual({ cols: 2, rows: 1 });
    expect(sheetGrid(m, { width: 35, height: 18 })).toBeNull();
  });

  it('rejects animation frames outside the sheet', () => {
    expect(errorsOf(object(), { 'chest.png': { width: 32, height: 16 } })).toMatch(/outside the sheet \(2 frames\)/);
    expect(validateSpriteMeta(object(), { 'chest.png': { width: 48, height: 16 } }).ok).toBe(true);
  });
});

describe('normalizeSpriteMeta', () => {
  it('drops unknown keys, trims the name and uses a canonical key order', () => {
    const dirty = { ...object(), name: '  Chest ', extra: 1, animations: { open: { frames: [0], fps: 5, loop: true, junk: 1 } } };
    const clean = normalizeSpriteMeta(dirty);
    expect(Object.keys(clean)).toEqual(['version', 'name', 'kind', 'frameWidth', 'frameHeight', 'margin', 'spacing', 'pivotX', 'pivotY', 'sheet', 'animations']);
    expect(clean.name).toBe('Chest');
    expect(clean.animations).toEqual({ open: { frames: [0], fps: 5, loop: true } });
  });

  it('throws one readable error', () => {
    expect(() => normalizeSpriteMeta({ ...object(), kind: 'x' })).toThrow(/Invalid sprite: kind must be one of/);
  });
});

describe('ids and names', () => {
  it('validates sprite ids', () => {
    for (const ok of ['characters/player', 'a', 'objects/chest_2', 'x/y-z/w']) expect(isValidSpriteId(ok)).toBe(true);
    for (const bad of ['', '/a', 'a/', 'a//b', '../a', 'a/..', 'a b', '.hidden', 'a/.b', 'a\\b', 5, null]) expect(isValidSpriteId(bad)).toBe(false);
  });
  it('validates sheet names', () => {
    expect(isSafeSheetName('walk.png')).toBe(true);
    for (const bad of ['.png', 'walk', 'a/b.png', '..\\a.png', '.hidden.png', 'a.png\0', 7]) expect(isSafeSheetName(bad)).toBe(false);
  });
  it('slugifies', () => {
    expect(slugifySpriteName('Fire Ball!')).toBe('fire_ball');
    expect(slugifySpriteName('Café')).toBe('cafe');
    expect(slugifySpriteName('???')).toBe('sprite');
  });
});
