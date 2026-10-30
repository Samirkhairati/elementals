import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakePng, listDir, makeTempDirTracker } from '../__testutils__/helpers';
import { TilesetCache } from './tilesetCache';
import {
  createTilesetFolder,
  deleteTilesetFolder,
  importTileset,
  listTilesets,
  moveTileset,
  renameTileset,
  renameTilesetFolder,
} from './tilesetStore';

const tmp = makeTempDirTracker();
let root: string;
let sets: string;
let source: string; // directory with importable PNGs
let cache: TilesetCache;

const b64 = (buf: Buffer) => `data:image/png;base64,${buf.toString('base64')}`;
const put = (rel: string, content: Buffer | string | object) => {
  const full = path.join(sets, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Buffer.isBuffer(content) || typeof content === 'string' ? content : JSON.stringify(content));
  return full;
};
const readJson = (...p: string[]) => JSON.parse(fs.readFileSync(path.join(sets, ...p), 'utf8'));

beforeEach(() => {
  root = tmp.create();
  sets = path.join(root, 'tilesets');
  source = path.join(root, 'source');
  fs.mkdirSync(sets);
  fs.mkdirSync(source);
  cache = new TilesetCache();
});
afterEach(() => tmp.cleanup());

describe('TilesetCache', () => {
  it('serves unchanged files from memory', () => {
    const file = put('a.png', fakePng('one'));
    expect(cache.getDataUrl(file)).toBe(b64(fakePng('one')));
    expect(cache.getDataUrl(file)).toBe(b64(fakePng('one')));
    expect(cache.getDataUrl(file)).toBe(b64(fakePng('one')));
    expect({ hits: cache.hits, misses: cache.misses }).toEqual({ hits: 2, misses: 1 });
  });

  it('does not re-read the file on a hit', () => {
    const file = put('a.png', fakePng('one'));
    cache.getDataUrl(file);
    const readSpy = vi.spyOn(fs, 'readFileSync');
    try {
      cache.getDataUrl(file);
      expect(readSpy).not.toHaveBeenCalled();
    } finally {
      readSpy.mockRestore();
    }
  });

  it('misses after the mtime changes (same size)', () => {
    const file = put('a.png', fakePng('aaaa'));
    cache.getDataUrl(file);
    fs.writeFileSync(file, fakePng('bbbb'));
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(file, future, future);
    expect(cache.getDataUrl(file)).toBe(b64(fakePng('bbbb')));
    expect(cache.misses).toBe(2);
    expect(cache.hits).toBe(0);
  });

  it('misses after the size changes (same mtime)', () => {
    const file = put('a.png', fakePng('short'));
    const { atime, mtime } = fs.statSync(file);
    cache.getDataUrl(file);
    fs.writeFileSync(file, fakePng('much longer content'));
    fs.utimesSync(file, atime, mtime);
    expect(cache.getDataUrl(file)).toBe(b64(fakePng('much longer content')));
    expect(cache.misses).toBe(2);
  });

  it('keys entries by absolute path', () => {
    const a = put('a.png', fakePng('A'));
    const b = put('sub/a.png', fakePng('B'));
    expect(cache.getDataUrl(a)).not.toBe(cache.getDataUrl(b));
    expect(cache.size).toBe(2);
  });

  it('invalidate, invalidateTree, retainOnly and clear drop entries', () => {
    const a = put('a.png', fakePng());
    const b = put('dir/b.png', fakePng());
    const c = put('dir/deep/c.png', fakePng());
    const d = put('dirty/d.png', fakePng());
    for (const f of [a, b, c, d]) cache.getDataUrl(f);
    expect(cache.size).toBe(4);

    cache.invalidate(a);
    expect(cache.size).toBe(3);

    cache.invalidateTree(path.join(sets, 'dir')); // must not drop sibling "dirty"
    expect(cache.size).toBe(1);

    cache.getDataUrl(a);
    cache.retainOnly(new Set([a]));
    expect(cache.size).toBe(1);

    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('throws for files that disappeared', () => {
    expect(() => cache.getDataUrl(path.join(sets, 'ghost.png'))).toThrow(/ENOENT/);
  });
});

describe('listTilesets', () => {
  it('lists nested tilesets with names from metadata and caches the encoding', () => {
    put('grass.png', fakePng('g'));
    put('grass.json', { name: 'Grass Tiles' });
    put('town/house.png', fakePng('h')); // no metadata
    put('town/deep/tree.png', fakePng('t'));
    put('town/deep/tree.json', '{}'); // no name
    put('notes.txt', 'x');

    const first = listTilesets(sets, cache);
    expect(first.warnings).toEqual([]);
    expect(first.folders).toEqual(['town', path.join('town', 'deep')]);
    expect([...first.tilesets].sort((x, y) => x.fileName.localeCompare(y.fileName))).toEqual([
      { name: 'Grass Tiles', fileName: 'grass.png', folderPath: null, dataUrl: b64(fakePng('g')) },
      { name: 'house', fileName: 'house.png', folderPath: 'town', dataUrl: b64(fakePng('h')) },
      { name: 'tree', fileName: 'tree.png', folderPath: path.join('town', 'deep'), dataUrl: b64(fakePng('t')) },
    ]);
    expect(cache.misses).toBe(3);

    const second = listTilesets(sets, cache);
    expect(second.tilesets).toEqual(first.tilesets);
    expect(cache.misses).toBe(3);
    expect(cache.hits).toBe(3);
  });

  it('re-reads only the file that changed', () => {
    const a = put('a.png', fakePng('a1'));
    put('b.png', fakePng('b1'));
    listTilesets(sets, cache);

    fs.writeFileSync(a, fakePng('a2'));
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(a, future, future);

    const { tilesets } = listTilesets(sets, cache);
    expect(tilesets[0].dataUrl).toBe(b64(fakePng('a2')));
    expect(cache.misses).toBe(3); // 2 initial + 1 changed
    expect(cache.hits).toBe(1);
  });

  it('prunes cache entries for deleted files', () => {
    const a = put('a.png', fakePng());
    put('b.png', fakePng());
    listTilesets(sets, cache);
    expect(cache.size).toBe(2);
    fs.rmSync(a);
    listTilesets(sets, cache);
    expect(cache.size).toBe(1);
  });

  it('warns about corrupt metadata but still lists the tileset', () => {
    put('a.png', fakePng());
    put('a.json', '{ nope');
    const { tilesets, warnings } = listTilesets(sets, cache);
    expect(tilesets.map((t) => t.name)).toEqual(['a']);
    expect(warnings.map((w) => w.file)).toEqual(['a.json']);
  });

  it('skips symlinks pointing outside', () => {
    const outside = tmp.create();
    fs.writeFileSync(path.join(outside, 'x.png'), fakePng());
    fs.symlinkSync(path.join(outside, 'x.png'), path.join(sets, 'x.png'));
    const { tilesets, warnings } = listTilesets(sets, cache);
    expect(tilesets).toEqual([]);
    expect(warnings.map((w) => w.file)).toEqual(['x.png']);
  });

  it('returns nothing for a missing directory', () => {
    expect(listTilesets(path.join(root, 'ghost'), cache)).toEqual({ folders: [], tilesets: [], warnings: [] });
  });
});

describe('importTileset', () => {
  const src = (name = 'tiles.png', content: Buffer = fakePng('img')) => {
    const p = path.join(source, name);
    fs.writeFileSync(p, content);
    return p;
  };

  it('copies the PNG, writes metadata and returns the tileset', () => {
    const { tileset } = importTileset(sets, cache, src(), 'My Tiles', null);
    expect(tileset).toEqual({ name: 'My Tiles', fileName: 'tiles.png', folderPath: null, dataUrl: b64(fakePng('img')) });
    expect(readJson('tiles.json')).toEqual({ name: 'My Tiles' });
    expect(listDir(sets)).toEqual(['tiles.json', 'tiles.png']);
  });

  it('picks unique names without overwriting', () => {
    const p = src();
    expect(importTileset(sets, cache, p, 'one').tileset.fileName).toBe('tiles.png');
    expect(importTileset(sets, cache, p, 'two').tileset.fileName).toBe('tiles_1.png');
    expect(importTileset(sets, cache, p, 'three').tileset.fileName).toBe('tiles_2.png');
    expect(readJson('tiles.json')).toEqual({ name: 'one' });
    expect(readJson('tiles_1.json')).toEqual({ name: 'two' });
  });

  it('does not clobber an orphan metadata file', () => {
    put('tiles.json', { name: 'orphan' });
    expect(importTileset(sets, cache, src(), 'x').tileset.fileName).toBe('tiles_1.png');
    expect(readJson('tiles.json')).toEqual({ name: 'orphan' });
  });

  it('imports into (new) folders and normalises odd file names', () => {
    const { tileset } = importTileset(sets, cache, src('.Hidden.PNG'), 'H', 'town/deep');
    expect(tileset.fileName).toBe('Hidden.png');
    expect(tileset.folderPath).toBe('town/deep');
    expect(fs.existsSync(path.join(sets, 'town', 'deep', 'Hidden.png'))).toBe(true);
  });

  it('falls back to the file name when no display name is given', () => {
    expect(importTileset(sets, cache, src(), '  ').tileset.name).toBe('tiles');
  });

  it('refuses non-PNG sources and sources that are not images', () => {
    const txt = path.join(source, 'secret.txt');
    fs.writeFileSync(txt, 'secret');
    expect(() => importTileset(sets, cache, txt, 'x')).toThrow(/\.png/);
    const fake = src('fake.png', Buffer.from('not a png at all'));
    expect(() => importTileset(sets, cache, fake, 'x')).toThrow(/valid PNG/);
    expect(() => importTileset(sets, cache, 'relative.png', 'x')).toThrow(/absolute/);
    expect(() => importTileset(sets, cache, path.join(source, 'ghost.png'), 'x')).toThrow(/ENOENT/);
    fs.mkdirSync(path.join(source, 'dir.png'));
    expect(() => importTileset(sets, cache, path.join(source, 'dir.png'), 'x')).toThrow(/regular file/);
    expect(listDir(sets)).toEqual([]);
  });

  it('refuses target folders outside the tilesets dir', () => {
    const p = src();
    for (const folder of ['..', '../x', '/tmp', 'a/../..']) {
      expect(() => importTileset(sets, cache, p, 'x', folder)).toThrow();
    }
    expect(listDir(root)).toEqual(['source', 'tilesets']);
    expect(listDir(sets)).toEqual([]);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('cleans up the PNG when writing metadata fails', () => {
    // make the .json target impossible to create: a directory with that name
    // (importTileset checks sibling existence, so simulate via a read-only folder instead)
    const dir = path.join(sets, 'ro');
    fs.mkdirSync(dir);
    const p = src();
    fs.chmodSync(dir, 0o555);
    try {
      expect(() => importTileset(sets, cache, p, 'x', 'ro')).toThrow();
    } finally {
      fs.chmodSync(dir, 0o755);
    }
    expect(listDir(dir)).toEqual([]);
  });
});

describe('renameTileset', () => {
  it('updates only the display name in the metadata, preserving other keys', () => {
    put('a.png', fakePng());
    put('a.json', { name: 'Old', tileSize: 16 });
    renameTileset(sets, null, 'a.png', 'New');
    expect(readJson('a.json')).toEqual({ name: 'New', tileSize: 16 });
  });

  it('creates metadata when none existed', () => {
    put('town/a.png', fakePng());
    renameTileset(sets, 'town', 'a.png', 'Named');
    expect(readJson('town', 'a.json')).toEqual({ name: 'Named' });
  });

  it('errors for missing tilesets, corrupt metadata, blank names and traversal', () => {
    put('a.png', fakePng());
    put('a.json', '{ corrupt');
    expect(() => renameTileset(sets, null, 'ghost.png', 'x')).toThrow(/does not exist/);
    expect(() => renameTileset(sets, null, 'a.png', 'x')).toThrow();
    expect(fs.readFileSync(path.join(sets, 'a.json'), 'utf8')).toBe('{ corrupt');
    expect(() => renameTileset(sets, null, 'a.png', '')).toThrow(/name/);
    expect(() => renameTileset(sets, null, '../a.png', 'x')).toThrow();
    expect(() => renameTileset(sets, '..', 'a.png', 'x')).toThrow();
    expect(() => renameTileset(sets, null, 'a.json', 'x')).toThrow();
  });
});

describe('moveTileset', () => {
  it('moves PNG and metadata together and invalidates the cache', () => {
    const png = put('a.png', fakePng());
    put('a.json', { name: 'A' });
    fs.mkdirSync(path.join(sets, 'town'));
    cache.getDataUrl(png);

    moveTileset(sets, cache, 'a.png', null, 'town');
    expect(listDir(sets)).toEqual(['town']);
    expect(listDir(path.join(sets, 'town'))).toEqual(['a.json', 'a.png']);
    expect(cache.size).toBe(0);
  });

  it('moves a PNG that has no metadata', () => {
    put('a.png', fakePng());
    fs.mkdirSync(path.join(sets, 'town'));
    moveTileset(sets, cache, 'a.png', null, 'town');
    expect(listDir(path.join(sets, 'town'))).toEqual(['a.png']);
  });

  it('refuses to overwrite either file at the destination', () => {
    put('a.png', fakePng('src'));
    put('a.json', { name: 'src' });
    put('town/a.png', fakePng('dest'));
    expect(() => moveTileset(sets, cache, 'a.png', null, 'town')).toThrow(/already exists/);
    expect(fs.readFileSync(path.join(sets, 'town', 'a.png'))).toEqual(fakePng('dest'));
    expect(listDir(sets).sort()).toEqual(['a.json', 'a.png', 'town']);

    fs.rmSync(path.join(sets, 'town', 'a.png'));
    put('town/a.json', { name: 'orphan' });
    expect(() => moveTileset(sets, cache, 'a.png', null, 'town')).toThrow(/already exists/);
    expect(readJson('town', 'a.json')).toEqual({ name: 'orphan' });
    expect(fs.existsSync(path.join(sets, 'a.png'))).toBe(true);
  });

  it('is a no-op when moving into the same folder', () => {
    put('town/a.png', fakePng());
    moveTileset(sets, cache, 'a.png', 'town', 'town');
    expect(listDir(path.join(sets, 'town'))).toEqual(['a.png']);
  });

  it('errors for missing source / destination and refuses traversal', () => {
    put('a.png', fakePng());
    expect(() => moveTileset(sets, cache, 'ghost.png', null, null)).toThrow(/does not exist/);
    expect(() => moveTileset(sets, cache, 'a.png', null, 'ghost')).toThrow(/does not exist/);
    expect(() => moveTileset(sets, cache, 'a.png', null, '..')).toThrow();
    expect(() => moveTileset(sets, cache, '../a.png', null, null)).toThrow();
    expect(() => moveTileset(sets, cache, 'a.json', null, null)).toThrow();
    expect(listDir(sets)).toEqual(['a.png']);
    expect(listDir(root)).toEqual(['source', 'tilesets']);
  });
});

describe('tileset folders', () => {
  it('creates, renames and deletes folders, invalidating cached children', () => {
    expect(createTilesetFolder(sets, null, 'town')).toEqual({ folderPath: 'town' });
    expect(createTilesetFolder(sets, 'town', 'deep')).toEqual({ folderPath: path.join('town', 'deep') });
    const png = put('town/deep/a.png', fakePng());
    cache.getDataUrl(png);

    expect(renameTilesetFolder(sets, cache, 'town', 'city')).toEqual({ newFolderPath: 'city' });
    expect(cache.size).toBe(0);
    expect(fs.existsSync(path.join(sets, 'city', 'deep', 'a.png'))).toBe(true);

    const moved = path.join(sets, 'city', 'deep', 'a.png');
    cache.getDataUrl(moved);
    deleteTilesetFolder(sets, cache, 'city');
    expect(cache.size).toBe(0);
    expect(listDir(sets)).toEqual([]);
  });

  it('refuses duplicates, bad names, and renaming onto an existing folder', () => {
    createTilesetFolder(sets, null, 'a');
    createTilesetFolder(sets, null, 'b');
    expect(() => createTilesetFolder(sets, null, 'a')).toThrow(/already exists/);
    expect(() => renameTilesetFolder(sets, cache, 'a', 'b')).toThrow(/already exists/);
    for (const bad of ['', '..', 'x/y', '../x']) {
      expect(() => createTilesetFolder(sets, null, bad)).toThrow();
      expect(() => renameTilesetFolder(sets, cache, 'a', bad)).toThrow();
    }
    expect(listDir(sets)).toEqual(['a', 'b']);
  });

  it('refuses to delete or rename the tilesets root', () => {
    put('a.png', fakePng());
    for (const p of ['', '.', '..', '../tilesets', sets, root]) {
      expect(() => deleteTilesetFolder(sets, cache, p)).toThrow();
      expect(() => renameTilesetFolder(sets, cache, p, 'x')).toThrow();
    }
    expect(fs.existsSync(path.join(sets, 'a.png'))).toBe(true);
    expect(fs.existsSync(sets)).toBe(true);
  });

  it('reports a missing folder on delete', () => {
    expect(() => deleteTilesetFolder(sets, cache, 'ghost')).toThrow(/does not exist/);
  });
});
