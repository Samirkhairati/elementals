import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listDir, makePng, makeTempDirTracker } from '../__testutils__/helpers';
import {
  createSpriteFolder,
  deleteSprite,
  deleteSpriteFolder,
  getSprite,
  importSprite,
  listSprites,
  moveSpriteFolder,
  renameSprite,
  renameSpriteFolder,
  saveSpriteMeta,
  type SpriteCache,
} from './spriteStore';
import { TilesetCache } from './tilesetCache';
import type { SpriteAssetMeta } from './spriteMeta';

const tmp = makeTempDirTracker();
let root: string;
let sprites: string;
let source: string;
let cache: SpriteCache;

const b64 = (buf: Buffer) => `data:image/png;base64,${buf.toString('base64')}`;
const WALK = makePng(128, 192);

function put(rel: string, content: Buffer | string | object): string {
  const full = path.join(sprites, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Buffer.isBuffer(content) || typeof content === 'string' ? content : JSON.stringify(content));
  return full;
}
const charMeta = (): SpriteAssetMeta => ({
  version: 1,
  name: 'Hero',
  kind: 'character',
  frameWidth: 32,
  frameHeight: 48,
  margin: 0,
  spacing: 0,
  pivotX: 0.5,
  pivotY: 1,
  character: { sheets: { walk: 'walk.png' }, framesPerDirection: 4, idleFrame: 0, walkFps: 10, runFps: 15 },
});
const objMeta = (): SpriteAssetMeta => ({
  version: 1,
  name: 'Ball',
  kind: 'object',
  frameWidth: 24,
  frameHeight: 24,
  margin: 0,
  spacing: 0,
  pivotX: 0.5,
  pivotY: 1,
  sheet: 'ball.png',
});
const seedHero = () => {
  put('characters/hero/sprite.json', charMeta());
  put('characters/hero/walk.png', WALK);
};
const seedBall = () => {
  put('objects/ball/sprite.json', objMeta());
  put('objects/ball/ball.png', makePng(24, 24));
};
const src = (name: string, w: number, h: number) => {
  const file = path.join(source, name);
  fs.writeFileSync(file, makePng(w, h));
  return file;
};

beforeEach(() => {
  root = tmp.create();
  sprites = path.join(root, 'sprites');
  source = path.join(root, 'source');
  fs.mkdirSync(sprites);
  fs.mkdirSync(source);
  cache = new TilesetCache();
});
afterEach(() => tmp.cleanup());

describe('listSprites', () => {
  it('returns [] for a missing directory', () => {
    expect(listSprites(path.join(root, 'nope'), cache)).toEqual({ assets: [], folders: [], warnings: [] });
  });

  it('lists assets sorted by id with meta and sheet data URLs', () => {
    seedBall();
    seedHero();
    const { assets, warnings } = listSprites(sprites, cache);
    expect(warnings).toEqual([]);
    expect(assets.map((a) => a.id)).toEqual(['characters/hero', 'objects/ball']);
    expect(assets[0].meta.name).toBe('Hero');
    expect(assets[0].sheets).toEqual({ 'walk.png': b64(WALK) });
  });

  it('uses the mtime cache for unchanged sheets', () => {
    seedHero();
    listSprites(sprites, cache);
    listSprites(sprites, cache);
    expect(cache.misses).toBe(1);
    expect(cache.hits).toBe(1);
  });

  it('skips invalid assets with a warning but keeps the good ones', () => {
    seedHero();
    put('broken/json/sprite.json', '{nope');
    put('missing/sheet/sprite.json', objMeta());
    put('badsize/sprite.json', { ...objMeta(), frameWidth: 10 });
    put('badsize/ball.png', makePng(24, 24));
    put('sprite.json', objMeta());
    const { assets, warnings } = listSprites(sprites, cache);
    expect(assets.map((a) => a.id)).toEqual(['characters/hero']);
    const text = warnings.map((w) => `${w.file}: ${w.error}`).join('\n');
    expect(text).toMatch(/broken[\\/]json[\\/]sprite.json/);
    expect(text).toMatch(/sheet "ball.png" does not exist/);
    expect(text).toMatch(/does not tile/);
    expect(text).toMatch(/must live inside an asset directory/);
  });

  it('forgets cache entries of deleted sheets', () => {
    seedHero();
    seedBall();
    listSprites(sprites, cache);
    expect(cache.size).toBe(2);
    fs.rmSync(path.join(sprites, 'objects'), { recursive: true });
    listSprites(sprites, cache);
    expect(cache.size).toBe(1);
  });
});

describe('getSprite', () => {
  it('returns one asset', () => {
    seedHero();
    expect(getSprite(sprites, cache, 'characters/hero').asset.meta.kind).toBe('character');
  });
  it('rejects unknown ids and traversal', () => {
    expect(() => getSprite(sprites, cache, 'characters/none')).toThrow(/does not exist/);
    expect(() => getSprite(sprites, cache, '../x')).toThrow();
    expect(() => getSprite(sprites, cache, '/etc')).toThrow();
  });
});

describe('importSprite', () => {
  it('imports a character with defaults derived from the image', () => {
    const { asset } = importSprite(sprites, cache, src('hero.png', 128, 192), { name: 'Super Hero', kind: 'character' });
    expect(asset.id).toBe('characters/super_hero');
    expect(asset.meta).toMatchObject({
      name: 'Super Hero',
      kind: 'character',
      frameWidth: 32,
      frameHeight: 48,
      pivotX: 0.5,
      pivotY: 1,
      character: { sheets: { walk: 'walk.png' }, framesPerDirection: 4, idleFrame: 0, walkFps: 8, runFps: 12 },
    });
    expect(listDir(path.join(sprites, 'characters/super_hero'))).toEqual(['sprite.json', 'walk.png']);
    expect(asset.sheets['walk.png']).toBe(b64(makePng(128, 192)));
    expect(JSON.parse(fs.readFileSync(path.join(sprites, 'characters/super_hero/sprite.json'), 'utf8'))).toEqual(asset.meta);
  });

  it('imports an object as one whole frame and honours an explicit id', () => {
    const { asset } = importSprite(sprites, cache, src('x.png', 24, 24), { id: 'items/ball', kind: 'object' });
    expect(asset.id).toBe('items/ball');
    expect(asset.meta).toMatchObject({ name: 'ball', frameWidth: 24, frameHeight: 24, sheet: 'sheet.png', animations: {} });
  });

  it('creates an idle animation for animated sprites', () => {
    const { asset } = importSprite(sprites, cache, src('f.png', 48, 16), { name: 'Flame', kind: 'animated', frameWidth: 16, frameHeight: 16 });
    expect(asset.id).toBe('objects/flame');
    expect(asset.meta).toMatchObject({ frameWidth: 16, frameHeight: 16, sheet: 'sheet.png' });
    expect(asset.meta.animations).toEqual({ idle: { frames: [0, 1, 2], fps: 8, loop: true } });
  });

  it('derives unique ids from names', () => {
    const a = importSprite(sprites, cache, src('a.png', 16, 16), { name: 'Rock', kind: 'object' });
    const b = importSprite(sprites, cache, src('a.png', 16, 16), { name: 'Rock', kind: 'object' });
    expect([a.asset.id, b.asset.id]).toEqual(['objects/rock', 'objects/rock_1']);
  });

  it('refuses an existing explicit id', () => {
    seedBall();
    expect(() => importSprite(sprites, cache, src('a.png', 24, 24), { id: 'objects/ball', kind: 'object' })).toThrow(/already exists/);
  });

  it('refuses bad input without leaving anything behind', () => {
    const ok = src('ok.png', 24, 24);
    const text = path.join(source, 'fake.png');
    fs.writeFileSync(text, 'not a png at all, just text');
    const jpg = path.join(source, 'x.jpg');
    fs.writeFileSync(jpg, makePng(8, 8));
    expect(() => importSprite(sprites, cache, text, { name: 'X', kind: 'object' })).toThrow(/not a valid PNG/);
    expect(() => importSprite(sprites, cache, jpg, { name: 'X', kind: 'object' })).toThrow(/\.png/);
    expect(() => importSprite(sprites, cache, 'relative.png', { name: 'X', kind: 'object' })).toThrow(/absolute/);
    expect(() => importSprite(sprites, cache, path.join(source, 'nope.png'), { name: 'X', kind: 'object' })).toThrow();
    expect(() => importSprite(sprites, cache, source + '.png', { name: 'X', kind: 'object' })).toThrow();
    expect(() => importSprite(sprites, cache, ok, { name: 'X', kind: 'monster' as never })).toThrow(/kind/);
    expect(() => importSprite(sprites, cache, ok, { kind: 'object' })).toThrow(/id or a name/);
    expect(() => importSprite(sprites, cache, ok, { id: '../evil', kind: 'object' })).toThrow();
    expect(() => importSprite(sprites, cache, ok, { id: '/abs', kind: 'object' })).toThrow();
    expect(() => importSprite(sprites, cache, ok, { name: 'X', kind: 'object', frameWidth: 7 })).toThrow(/does not tile/);
    expect(() => importSprite(sprites, cache, ok, { name: 'X', kind: 'object', frameWidth: 0 })).toThrow(/frameWidth/);
    expect(fs.readdirSync(sprites)).toEqual([]);
  });
});

describe('saveSpriteMeta', () => {
  it('validates and writes the normalised meta', () => {
    seedHero();
    const { meta } = saveSpriteMeta(sprites, 'characters/hero', { ...charMeta(), name: ' Renamed ', pivotY: 0.9, extra: 1 });
    expect(meta.name).toBe('Renamed');
    const onDisk = JSON.parse(fs.readFileSync(path.join(sprites, 'characters/hero/sprite.json'), 'utf8'));
    expect(onDisk).toEqual(meta);
    expect(onDisk.extra).toBeUndefined();
    expect(listDir(path.join(sprites, 'characters/hero'))).toEqual(['sprite.json', 'walk.png']);
  });

  it('refuses invalid or sheet-incompatible metas and keeps the file', () => {
    seedHero();
    const file = path.join(sprites, 'characters/hero/sprite.json');
    const before = fs.readFileSync(file, 'utf8');
    expect(() => saveSpriteMeta(sprites, 'characters/hero', { ...charMeta(), kind: 'x' })).toThrow(/kind/);
    expect(() => saveSpriteMeta(sprites, 'characters/hero', { ...charMeta(), frameWidth: 31 })).toThrow(/does not tile/);
    expect(() =>
      saveSpriteMeta(sprites, 'characters/hero', { ...charMeta(), character: { ...charMeta().character!, sheets: { walk: 'ghost.png' } } })
    ).toThrow(/does not exist/);
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  it('refuses unknown assets and traversal', () => {
    expect(() => saveSpriteMeta(sprites, 'characters/none', charMeta())).toThrow(/does not exist/);
    expect(() => saveSpriteMeta(sprites, '../outside', charMeta())).toThrow();
  });

  it('refuses a sheet reference that escapes the asset directory', () => {
    seedHero();
    put('../secret.png', WALK);
    expect(() =>
      saveSpriteMeta(sprites, 'characters/hero', { ...charMeta(), character: { ...charMeta().character!, sheets: { walk: '../../secret.png' } } })
    ).toThrow(/walk/);
  });
});

describe('renameSprite', () => {
  it('renames and moves an asset, creating folders and leaving the emptied one in place', () => {
    seedHero();
    expect(renameSprite(sprites, cache, 'characters/hero', 'npcs/town/hero')).toEqual({ id: 'npcs/town/hero' });
    // folders are managed by the user now: an emptied folder stays until it is deleted
    expect(fs.existsSync(path.join(sprites, 'characters'))).toBe(true);
    const listing = listSprites(sprites, cache);
    expect(listing.assets.map((a) => a.id)).toEqual(['npcs/town/hero']);
    expect(listing.folders).toEqual(['characters', 'npcs', 'npcs/town']);
  });

  it('keeps non-empty parent folders', () => {
    seedHero();
    seedBall();
    put('characters/other/sprite.json', charMeta());
    put('characters/other/walk.png', WALK);
    renameSprite(sprites, cache, 'characters/hero', 'characters/zed');
    expect(listSprites(sprites, cache).assets.map((a) => a.id)).toEqual(['characters/other', 'characters/zed', 'objects/ball']);
  });

  it('refuses to overwrite', () => {
    seedHero();
    seedBall();
    expect(() => renameSprite(sprites, cache, 'characters/hero', 'objects/ball')).toThrow(/already exists/);
    expect(listSprites(sprites, cache).assets).toHaveLength(2);
  });

  it('refuses unsafe, missing and self-nested targets', () => {
    seedHero();
    seedBall();
    expect(() => renameSprite(sprites, cache, 'characters/hero', '../x')).toThrow();
    expect(() => renameSprite(sprites, cache, 'characters/hero', 'a b')).toThrow(/Sprite id/);
    expect(() => renameSprite(sprites, cache, 'nope', 'x')).toThrow(/does not exist/);
    expect(() => renameSprite(sprites, cache, 'characters/hero', 'characters/hero/inner')).toThrow(/into itself/);
    expect(() => renameSprite(sprites, cache, 'characters/hero', 'objects/ball/inner')).toThrow(/inside the asset/);
  });

  it('is a no-op for the same id and invalidates the cache for the old path', () => {
    seedHero();
    listSprites(sprites, cache);
    expect(renameSprite(sprites, cache, 'characters/hero', 'characters/hero')).toEqual({ id: 'characters/hero' });
    renameSprite(sprites, cache, 'characters/hero', 'characters/hero2');
    expect(cache.size).toBe(0);
  });
});

describe('deleteSprite', () => {
  it('removes the asset directory but keeps its folder', () => {
    seedHero();
    seedBall();
    deleteSprite(sprites, cache, 'characters/hero');
    expect(fs.existsSync(path.join(sprites, 'characters/hero'))).toBe(false);
    expect(fs.existsSync(path.join(sprites, 'characters'))).toBe(true);
    expect(listSprites(sprites, cache).assets.map((a) => a.id)).toEqual(['objects/ball']);
  });

  it('refuses unknown ids, traversal and assets that contain other assets', () => {
    seedHero();
    put('characters/hero/variants/red/sprite.json', charMeta());
    put('characters/hero/variants/red/walk.png', WALK);
    expect(() => deleteSprite(sprites, cache, 'nope')).toThrow(/does not exist/);
    expect(() => deleteSprite(sprites, cache, '..')).toThrow();
    expect(() => deleteSprite(sprites, cache, 'characters')).toThrow(/does not exist/); // not an asset
    expect(() => deleteSprite(sprites, cache, 'characters/hero')).toThrow(/contains other sprites/);
    expect(fs.existsSync(path.join(sprites, 'characters/hero/walk.png'))).toBe(true);
  });

  it('never follows a symlink out of the sprites directory', () => {
    seedHero();
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'keep.txt'), 'x');
    fs.writeFileSync(path.join(outside, 'sprite.json'), JSON.stringify(charMeta()));
    fs.symlinkSync(outside, path.join(sprites, 'evil'));
    expect(() => deleteSprite(sprites, cache, 'evil')).toThrow(/escapes/);
    expect(fs.existsSync(path.join(outside, 'keep.txt'))).toBe(true);
  });
});

describe('sprite folders', () => {
  it('lists plain folders (empty ones too) but not asset directories', () => {
    seedHero();
    seedBall();
    fs.mkdirSync(path.join(sprites, 'npcs/town'), { recursive: true });
    fs.mkdirSync(path.join(sprites, 'characters/hero/extra')); // inside an asset: not a folder
    expect(listSprites(sprites, cache).folders).toEqual(['characters', 'npcs', 'npcs/town', 'objects']);
  });

  it('creates folders below the root or another folder', () => {
    expect(createSpriteFolder(sprites, null, 'npcs')).toEqual({ folderId: 'npcs' });
    expect(createSpriteFolder(sprites, 'npcs', 'town')).toEqual({ folderId: 'npcs/town' });
    expect(fs.statSync(path.join(sprites, 'npcs/town')).isDirectory()).toBe(true);
    expect(listSprites(sprites, cache).folders).toEqual(['npcs', 'npcs/town']);
  });

  it('refuses bad, duplicate and misplaced folders', () => {
    seedHero();
    createSpriteFolder(sprites, null, 'npcs');
    expect(() => createSpriteFolder(sprites, null, 'npcs')).toThrow(/already exists/);
    expect(() => createSpriteFolder(sprites, null, 'a b')).toThrow(/letters, digits/);
    expect(() => createSpriteFolder(sprites, null, 'a/b')).toThrow(/letters, digits/);
    expect(() => createSpriteFolder(sprites, null, '..')).toThrow();
    expect(() => createSpriteFolder(sprites, 'missing', 'x')).toThrow(/does not exist/);
    expect(() => createSpriteFolder(sprites, 'characters/hero', 'x')).toThrow(/sprite/);
  });

  it('renames a folder, which changes the ids of the sprites inside', () => {
    seedHero();
    expect(renameSpriteFolder(sprites, cache, 'characters', 'people')).toEqual({ folderId: 'people' });
    expect(listSprites(sprites, cache).assets.map((a) => a.id)).toEqual(['people/hero']);
    expect(() => renameSpriteFolder(sprites, cache, 'people/hero', 'x')).toThrow(/sprite/);
    createSpriteFolder(sprites, null, 'other');
    expect(() => renameSpriteFolder(sprites, cache, 'other', 'people')).toThrow(/already exists/);
  });

  it('moves a folder below another one and refuses to move it into itself', () => {
    seedHero();
    createSpriteFolder(sprites, null, 'npcs');
    expect(moveSpriteFolder(sprites, cache, 'characters', 'npcs')).toEqual({ folderId: 'npcs/characters' });
    expect(listSprites(sprites, cache).assets.map((a) => a.id)).toEqual(['npcs/characters/hero']);
    expect(moveSpriteFolder(sprites, cache, 'npcs/characters', null)).toEqual({ folderId: 'characters' });
    expect(() => moveSpriteFolder(sprites, cache, 'npcs', 'npcs')).toThrow(/into itself/);
    createSpriteFolder(sprites, 'npcs', 'inner');
    expect(() => moveSpriteFolder(sprites, cache, 'npcs', 'npcs/inner')).toThrow(/into itself/);
    createSpriteFolder(sprites, 'npcs', 'characters');
    expect(() => moveSpriteFolder(sprites, cache, 'characters', 'npcs')).toThrow(/already exists/);
  });

  it('deletes a folder with its sprites and drops them from the cache', () => {
    seedHero();
    seedBall();
    listSprites(sprites, cache);
    deleteSpriteFolder(sprites, cache, 'characters');
    expect(fs.existsSync(path.join(sprites, 'characters'))).toBe(false);
    expect(listSprites(sprites, cache).assets.map((a) => a.id)).toEqual(['objects/ball']);
    expect(() => deleteSpriteFolder(sprites, cache, 'characters')).toThrow(/does not exist/);
    expect(() => deleteSpriteFolder(sprites, cache, 'objects/ball')).toThrow(/sprite/);
    expect(() => deleteSpriteFolder(sprites, cache, '..')).toThrow();
  });
});
