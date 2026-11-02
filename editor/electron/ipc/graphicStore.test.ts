import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makePng, makeTempDirTracker } from '../__testutils__/helpers';
import { listCharacters } from './characterStore';
import { createGraphicFolder, deleteGraphic, deleteGraphicFolder, moveGraphicFolder, renameGraphic, renameGraphicFolder, replaceGraphic } from './graphicStore';
import { TilesetCache } from './tilesetCache';

const tmp = makeTempDirTracker();
let graphicsDir: string;
let cache: TilesetCache;

const put = (rel: string) => {
  const full = path.join(graphicsDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, makePng(32, 32));
};
const has = (rel: string) => fs.existsSync(path.join(graphicsDir, rel));

beforeEach(() => {
  const root = tmp.create();
  graphicsDir = path.join(root, 'graphics');
  fs.mkdirSync(graphicsDir);
  cache = new TilesetCache();
});
afterEach(() => tmp.cleanup());

describe('renameGraphic', () => {
  it('renames and moves an image, creating the folders it needs', () => {
    put('a/walk.png');
    expect(renameGraphic(graphicsDir, cache, 'a/walk.png', 'b/c/run.png')).toEqual({ id: 'b/c/run.png' });
    expect(has('a/walk.png')).toBe(false);
    expect(has('b/c/run.png')).toBe(true);
  });

  it('refuses to overwrite, to rename what is missing and to use a bad id', () => {
    put('a.png');
    put('b.png');
    expect(() => renameGraphic(graphicsDir, cache, 'a.png', 'b.png')).toThrow(/already exists/);
    expect(() => renameGraphic(graphicsDir, cache, 'nope.png', 'c.png')).toThrow(/does not exist/);
    expect(() => renameGraphic(graphicsDir, cache, 'a.png', '../x.png')).toThrow();
    expect(() => renameGraphic(graphicsDir, cache, 'a.png', 'x.jpg')).toThrow();
    expect(has('a.png')).toBe(true);
  });
});

describe('deleteGraphic', () => {
  it('removes the image only', () => {
    put('a/one.png');
    put('a/two.png');
    deleteGraphic(graphicsDir, cache, 'a/one.png');
    expect(has('a/one.png')).toBe(false);
    expect(has('a/two.png')).toBe(true);
    expect(() => deleteGraphic(graphicsDir, cache, 'a/one.png')).toThrow(/does not exist/);
  });
});

describe('graphic folders', () => {
  it('creates, lists (empty ones too), renames, moves and deletes', () => {
    put('a/one.png');
    expect(createGraphicFolder(graphicsDir, null, 'b')).toEqual({ folderId: 'b' });
    expect(createGraphicFolder(graphicsDir, 'b', 'inner')).toEqual({ folderId: 'b/inner' });
    const listing = listCharacters({ charactersDir: path.join(graphicsDir, '..', 'chars'), graphicsDir }, cache);
    expect(listing.graphicFolders).toEqual(['a', 'b', 'b/inner']);

    expect(renameGraphicFolder(graphicsDir, cache, 'a', 'z')).toEqual({ folderId: 'z' });
    expect(has('z/one.png')).toBe(true);
    expect(moveGraphicFolder(graphicsDir, cache, 'z', 'b')).toEqual({ folderId: 'b/z' });
    expect(has('b/z/one.png')).toBe(true);
    expect(() => moveGraphicFolder(graphicsDir, cache, 'b', 'b/z')).toThrow(/into itself/);
    deleteGraphicFolder(graphicsDir, cache, 'b');
    expect(has('b')).toBe(false);
  });
});

describe('replaceGraphic', () => {
  it('swaps the file under the same id and reports the new size and picture', () => {
    put('a/walk.png');
    const old = cache.getDataUrl(path.join(graphicsDir, 'a/walk.png'));
    const source = path.join(tmp.create(), 'new.png');
    fs.writeFileSync(source, makePng(64, 16));
    const r = replaceGraphic(graphicsDir, cache, source, 'a/walk.png');
    expect(r.graphic).toMatchObject({ id: 'a/walk.png', width: 64, height: 16 });
    expect(r.image).not.toBe(old); // the cache was refreshed
    expect(fs.readFileSync(path.join(graphicsDir, 'a/walk.png')).equals(fs.readFileSync(source))).toBe(true);
    expect(fs.readdirSync(path.join(graphicsDir, 'a'))).toEqual(['walk.png']); // no temp file left
  });

  it('refuses a missing graphic, a bad id and a file that is not a PNG, leaving the old picture alone', () => {
    put('a.png');
    const dir = tmp.create();
    const good = path.join(dir, 'good.png');
    fs.writeFileSync(good, makePng(8, 8));
    const bad = path.join(dir, 'bad.png');
    fs.writeFileSync(bad, 'not a png');
    expect(() => replaceGraphic(graphicsDir, cache, good, 'nope.png')).toThrow(/does not exist/);
    expect(() => replaceGraphic(graphicsDir, cache, good, '../x.png')).toThrow();
    const before = fs.readFileSync(path.join(graphicsDir, 'a.png'));
    expect(() => replaceGraphic(graphicsDir, cache, bad, 'a.png')).toThrow();
    expect(fs.readFileSync(path.join(graphicsDir, 'a.png')).equals(before)).toBe(true);
  });
});
