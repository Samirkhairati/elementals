import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listDir, makeTempDirTracker } from '../__testutils__/helpers';
import {
  createMap,
  createMapFolder,
  deleteMap,
  deleteMapFolder,
  listMaps,
  moveMap,
  renameMap,
  renameMapFolder,
  saveMap,
  slugifyMapName,
} from './mapStore';

const tmp = makeTempDirTracker();
let root: string; // temp sandbox containing maps/ plus a sibling file that must never be touched
let maps: string;

const readJson = (...p: string[]) => JSON.parse(fs.readFileSync(path.join(maps, ...p), 'utf8'));
const write = (rel: string, content: string | object) => {
  const full = path.join(maps, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content));
};

beforeEach(() => {
  root = tmp.create();
  maps = path.join(root, 'maps');
  fs.mkdirSync(maps);
  fs.writeFileSync(path.join(root, 'precious.json'), '{"precious":true}');
});
afterEach(() => tmp.cleanup());

const precious = () => fs.readFileSync(path.join(root, 'precious.json'), 'utf8');

describe('listMaps', () => {
  it('returns empty results for a missing directory', () => {
    expect(listMaps(path.join(root, 'nope'))).toEqual({ folders: [], maps: [], warnings: [] });
  });

  it('lists nested maps and folders with defaults filled in', () => {
    write('a.json', { name: 'Alpha', width: 10, height: 12, layers: [{ id: 1 }], entities: [{ id: 2 }] });
    write('town/b.json', {});
    write('town/inner/c.json', { name: 'C' });
    fs.mkdirSync(path.join(maps, 'empty'));
    write('readme.txt', 'ignored');

    const { folders, maps: found, warnings } = listMaps(maps);
    expect(warnings).toEqual([]);
    expect(folders).toEqual(['empty', 'town', path.join('town', 'inner')]);
    expect(found).toEqual([
      { fileName: 'a.json', folderPath: null, name: 'Alpha', width: 10, height: 12, layers: [{ id: 1 }], entities: [{ id: 2 }] },
      { fileName: 'b.json', folderPath: 'town', name: 'b', width: 50, height: 50, layers: [], entities: [] },
      { fileName: 'c.json', folderPath: path.join('town', 'inner'), name: 'C', width: 50, height: 50, layers: [], entities: [] },
    ]);
  });

  it('keeps readable maps and reports corrupt / invalid ones as warnings', () => {
    write('good.json', { name: 'Good' });
    write('bad.json', '{ not json');
    write('sub/array.json', '[1,2,3]');
    write('sub/null.json', 'null');

    const { maps: found, warnings } = listMaps(maps);
    expect(found.map((m) => m.fileName)).toEqual(['good.json']);
    expect(warnings.map((w) => w.file).sort()).toEqual(
      ['bad.json', path.join('sub', 'array.json'), path.join('sub', 'null.json')].sort()
    );
    for (const w of warnings) expect(w.error.length).toBeGreaterThan(0);
  });

  it('ignores hidden entries and leftover temp files', () => {
    write('.hidden.json', {});
    write('.hiddendir/x.json', {});
    write('a.json.123.abcdef.tmp', '{}');
    expect(listMaps(maps)).toEqual({ folders: [], maps: [], warnings: [] });
  });

  it('skips symlinks pointing outside the maps directory (with a warning)', () => {
    fs.symlinkSync(path.join(root, 'precious.json'), path.join(maps, 'leak.json'));
    fs.symlinkSync(root, path.join(maps, 'leakdir'));
    write('ok.json', {});

    const { maps: found, folders, warnings } = listMaps(maps);
    expect(found.map((m) => m.fileName)).toEqual(['ok.json']);
    expect(folders).toEqual([]);
    expect(warnings.map((w) => w.file).sort()).toEqual(['leak.json', 'leakdir']);
  });

  it('follows symlinks that stay inside and survives symlink cycles', () => {
    write('real/x.json', { name: 'X' });
    fs.symlinkSync(path.join(maps, 'real'), path.join(maps, 'alias'));
    fs.symlinkSync(maps, path.join(maps, 'real', 'loop'));

    const { folders, maps: found } = listMaps(maps);
    expect(folders).toContain('real');
    expect(found.some((m) => m.name === 'X')).toBe(true);
    expect(found.length).toBeLessThan(10); // terminates
  });

  it('skips broken symlinks with a warning', () => {
    fs.symlinkSync(path.join(maps, 'missing.json'), path.join(maps, 'dangling.json'));
    const { maps: found, warnings } = listMaps(maps);
    expect(found).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].file).toBe('dangling.json');
  });

  it('ignores directories whose name ends in .json', () => {
    fs.mkdirSync(path.join(maps, 'weird.json'));
    const { maps: found, folders } = listMaps(maps);
    expect(found).toEqual([]);
    expect(folders).toEqual(['weird.json']);
  });
});

describe('createMap', () => {
  it('writes a map with the default layers and returns it', () => {
    const { map } = createMap(maps, 'Town Square', 20, 30);
    expect(map.fileName).toBe('town_square.json');
    expect(map.folderPath).toBeNull();
    expect(map.layers.map((l) => (l as { name: string }).name)).toEqual([
      'collisions',
      'terrain',
      'encounters',
      'decorations',
      'building',
      'ground',
    ]);
    const onDisk = readJson('town_square.json');
    expect(onDisk).toMatchObject({ name: 'Town Square', width: 20, height: 30, entities: [] });
    expect(onDisk.layers).toEqual(map.layers);
    expect(new Set(onDisk.layers.map((l: { id: string }) => l.id)).size).toBe(6);
  });

  it('generates unique file names', () => {
    expect(createMap(maps, 'town', 5, 5).map.fileName).toBe('town.json');
    expect(createMap(maps, 'town', 5, 5).map.fileName).toBe('town_1.json');
    expect(createMap(maps, 'Town', 5, 5).map.fileName).toBe('town_2.json');
    expect(listDir(maps)).toEqual(['town.json', 'town_1.json', 'town_2.json']);
  });

  it('creates the target folder on demand and never overwrites', () => {
    const { map } = createMap(maps, 'x', 5, 5, 'new/deep');
    expect(map.folderPath).toBe('new/deep');
    expect(fs.existsSync(path.join(maps, 'new', 'deep', 'x.json'))).toBe(true);
  });

  it('sanitises odd names into safe file names', () => {
    expect(createMap(maps, '../../evil name!', 5, 5).map.fileName).toBe('______evil_name_.json');
    expect(createMap(maps, 'ünï', 5, 5).map.fileName).toBe('_n_.json');
    expect(slugifyMapName('???')).toBe('___');
    expect(slugifyMapName('')).toBe('map');
    expect(precious()).toBe('{"precious":true}');
    expect(listDir(root)).toEqual(['maps', 'precious.json']);
  });

  it.each([['..'], ['../x'], ['/etc'], ['a/../../x'], ['link']])('refuses folder %j', (folder) => {
    fs.symlinkSync(root, path.join(maps, 'link'));
    expect(() => createMap(maps, 'x', 5, 5, folder)).toThrow();
    expect(listDir(root)).toEqual(['maps', 'precious.json']);
  });

  it.each([[0, 5], [5, -1], [NaN, 5], [5, Infinity], ['5' as unknown as number, 5], [1e9, 5]])(
    'rejects invalid dimensions %j x %j',
    (w, h) => {
      expect(() => createMap(maps, 'x', w, h)).toThrow(/positive number/);
      expect(listDir(maps)).toEqual([]);
    }
  );

  it('rejects blank names', () => {
    expect(() => createMap(maps, '   ', 5, 5)).toThrow(/name/);
    expect(() => createMap(maps, undefined as unknown as string, 5, 5)).toThrow(/name/);
  });

  it('leaves no temp files behind', () => {
    createMap(maps, 'x', 5, 5);
    expect(listDir(maps).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
});

describe('saveMap', () => {
  it('overwrites an existing map atomically', () => {
    write('a.json', { old: true });
    saveMap(maps, null, 'a.json', { name: 'New', width: 1 });
    expect(readJson('a.json')).toEqual({ name: 'New', width: 1 });
    expect(listDir(maps)).toEqual(['a.json']);
  });

  it('saves into sub folders and creates new files', () => {
    fs.mkdirSync(path.join(maps, 'town'));
    saveMap(maps, 'town', 'new.json', { name: 'N' });
    expect(readJson('town', 'new.json')).toEqual({ name: 'N' });
  });

  it.each([
    [null, '../precious.json'],
    [null, 'a/b.json'],
    [null, '/tmp/x.json'],
    [null, '.hidden.json'],
    [null, 'a.txt'],
    ['..', 'x.json'],
    ['../..', 'x.json'],
    ['a/../..', 'x.json'],
  ])('refuses folder=%j file=%j and writes nothing outside', (folder, file) => {
    expect(() => saveMap(maps, folder, file, { hacked: true })).toThrow();
    expect(precious()).toBe('{"precious":true}');
    expect(listDir(root)).toEqual(['maps', 'precious.json']);
    expect(listDir(maps)).toEqual([]);
  });

  it('refuses an absolute folder path', () => {
    expect(() => saveMap(maps, root, 'x.json', {})).toThrow(/Absolute/);
    expect(listDir(root)).toEqual(['maps', 'precious.json']);
  });

  it('refuses to write through a symlinked folder', () => {
    fs.symlinkSync(root, path.join(maps, 'link'));
    expect(() => saveMap(maps, 'link', 'x.json', {})).toThrow(/symlink/);
    expect(listDir(root)).toEqual(['maps', 'precious.json']);
  });

  it.each([[null], [undefined], ['str'], [[1]], [42]])('refuses non-object map data %j', (data) => {
    write('a.json', { keep: true });
    expect(() => saveMap(maps, null, 'a.json', data)).toThrow(/JSON object/);
    expect(readJson('a.json')).toEqual({ keep: true });
  });

  it('fails when the destination folder does not exist, leaving no files', () => {
    expect(() => saveMap(maps, 'ghost', 'a.json', {})).toThrow();
    expect(listDir(maps)).toEqual([]);
  });
});

describe('deleteMap', () => {
  it('deletes a map and is idempotent', () => {
    write('town/a.json', {});
    deleteMap(maps, 'town', 'a.json');
    expect(fs.existsSync(path.join(maps, 'town', 'a.json'))).toBe(false);
    expect(() => deleteMap(maps, 'town', 'a.json')).not.toThrow();
  });

  it('refuses traversal', () => {
    expect(() => deleteMap(maps, null, '../precious.json')).toThrow();
    expect(() => deleteMap(maps, '..', 'precious.json')).toThrow();
    expect(precious()).toBe('{"precious":true}');
  });

  it('refuses to delete a folder via a .json named directory path', () => {
    fs.mkdirSync(path.join(maps, 'dir.json'));
    // rmSync without recursive refuses directories
    expect(() => deleteMap(maps, null, 'dir.json')).toThrow();
    expect(fs.existsSync(path.join(maps, 'dir.json'))).toBe(true);
  });
});

describe('renameMap', () => {
  it('updates the display name only', () => {
    write('a.json', { name: 'Old', width: 3, layers: [1] });
    renameMap(maps, null, 'a.json', 'New');
    expect(readJson('a.json')).toEqual({ name: 'New', width: 3, layers: [1] });
    expect(listDir(maps)).toEqual(['a.json']);
  });

  it('errors on missing maps instead of silently succeeding', () => {
    expect(() => renameMap(maps, null, 'ghost.json', 'x')).toThrow(/does not exist/);
    expect(listDir(maps)).toEqual([]);
  });

  it('does not clobber a corrupt map', () => {
    write('a.json', '{ corrupt');
    expect(() => renameMap(maps, null, 'a.json', 'x')).toThrow();
    expect(fs.readFileSync(path.join(maps, 'a.json'), 'utf8')).toBe('{ corrupt');
  });

  it('rejects blank names and traversal', () => {
    write('a.json', { name: 'Old' });
    expect(() => renameMap(maps, null, 'a.json', '  ')).toThrow(/name/);
    expect(() => renameMap(maps, null, '../precious.json', 'x')).toThrow();
    expect(readJson('a.json')).toEqual({ name: 'Old' });
    expect(precious()).toBe('{"precious":true}');
  });
});

describe('moveMap', () => {
  it('moves between root and folders', () => {
    write('a.json', { name: 'A' });
    fs.mkdirSync(path.join(maps, 'town'));
    moveMap(maps, 'a.json', null, 'town');
    expect(fs.existsSync(path.join(maps, 'a.json'))).toBe(false);
    expect(readJson('town', 'a.json')).toEqual({ name: 'A' });
    moveMap(maps, 'a.json', 'town', null);
    expect(readJson('a.json')).toEqual({ name: 'A' });
  });

  it('refuses to overwrite an existing destination', () => {
    write('a.json', { name: 'src' });
    write('town/a.json', { name: 'dest' });
    expect(() => moveMap(maps, 'a.json', null, 'town')).toThrow(/already exists/);
    expect(readJson('a.json')).toEqual({ name: 'src' });
    expect(readJson('town', 'a.json')).toEqual({ name: 'dest' });
  });

  it('is a no-op when source and destination are the same folder', () => {
    write('town/a.json', { name: 'A' });
    moveMap(maps, 'a.json', 'town', 'town');
    expect(readJson('town', 'a.json')).toEqual({ name: 'A' });
  });

  it('errors for a missing source or a missing destination folder', () => {
    write('a.json', {});
    expect(() => moveMap(maps, 'ghost.json', null, null)).toThrow(/does not exist/);
    expect(() => moveMap(maps, 'a.json', null, 'ghost')).toThrow(/does not exist/);
    expect(fs.existsSync(path.join(maps, 'a.json'))).toBe(true);
  });

  it('refuses to move out of or into locations outside the maps dir', () => {
    write('a.json', {});
    expect(() => moveMap(maps, 'a.json', null, '..')).toThrow();
    expect(() => moveMap(maps, 'precious.json', '..', null)).toThrow();
    expect(() => moveMap(maps, '../precious.json', null, null)).toThrow();
    expect(precious()).toBe('{"precious":true}');
    expect(listDir(root)).toEqual(['maps', 'precious.json']);
  });
});

describe('map folders', () => {
  it('creates nested folders and returns their relative path', () => {
    expect(createMapFolder(maps, null, 'town')).toEqual({ folderPath: 'town' });
    expect(createMapFolder(maps, 'town', 'inner')).toEqual({ folderPath: path.join('town', 'inner') });
    expect(fs.statSync(path.join(maps, 'town', 'inner')).isDirectory()).toBe(true);
  });

  it('refuses duplicates, bad names and traversal', () => {
    createMapFolder(maps, null, 'town');
    expect(() => createMapFolder(maps, null, 'town')).toThrow(/already exists/);
    for (const bad of ['', '.', '..', 'a/b', '../x', '.hidden']) {
      expect(() => createMapFolder(maps, null, bad)).toThrow();
    }
    expect(() => createMapFolder(maps, '..', 'x')).toThrow();
    expect(() => createMapFolder(maps, '/tmp', 'x')).toThrow();
    expect(listDir(root)).toEqual(['maps', 'precious.json']);
    expect(listDir(maps)).toEqual(['town']);
  });

  it('renames a folder in place', () => {
    write('town/inner/a.json', { name: 'A' });
    expect(renameMapFolder(maps, 'town', 'city')).toEqual({ newFolderPath: 'city' });
    expect(renameMapFolder(maps, path.join('city', 'inner'), 'core')).toEqual({
      newFolderPath: path.join('city', 'core'),
    });
    expect(readJson('city', 'core', 'a.json')).toEqual({ name: 'A' });
    expect(fs.existsSync(path.join(maps, 'town'))).toBe(false);
  });

  it('refuses to rename onto an existing folder (no merge, no loss)', () => {
    write('a/x.json', { n: 'a' });
    write('b/x.json', { n: 'b' });
    expect(() => renameMapFolder(maps, 'a', 'b')).toThrow(/already exists/);
    expect(readJson('a', 'x.json')).toEqual({ n: 'a' });
    expect(readJson('b', 'x.json')).toEqual({ n: 'b' });
  });

  it('refuses to rename the root, missing folders, and bad new names', () => {
    fs.mkdirSync(path.join(maps, 'a'));
    for (const oldPath of ['', '.', '..', '../maps']) {
      expect(() => renameMapFolder(maps, oldPath, 'x')).toThrow();
    }
    expect(() => renameMapFolder(maps, 'ghost', 'x')).toThrow(/does not exist/);
    for (const bad of ['', '..', '../up', 'a/b', '/abs', '.dot']) {
      expect(() => renameMapFolder(maps, 'a', bad)).toThrow();
    }
    expect(listDir(maps)).toEqual(['a']);
    expect(listDir(root)).toEqual(['maps', 'precious.json']);
  });

  it('deletes folders recursively', () => {
    write('town/inner/a.json', {});
    write('keep/b.json', {});
    deleteMapFolder(maps, 'town');
    expect(listDir(maps)).toEqual(['keep']);
  });

  it('refuses to delete the maps root in any spelling', () => {
    write('a.json', {});
    write('town/b.json', {});
    for (const p of ['', '.', './', 'town/..', '..', '../maps', root, maps, '/']) {
      expect(() => deleteMapFolder(maps, p)).toThrow();
    }
    expect(() => deleteMapFolder(maps, undefined as unknown as string)).toThrow();
    expect(() => deleteMapFolder(maps, null as unknown as string)).toThrow();
    expect(fs.existsSync(path.join(maps, 'a.json'))).toBe(true);
    expect(fs.existsSync(path.join(maps, 'town', 'b.json'))).toBe(true);
    expect(precious()).toBe('{"precious":true}');
  });

  it('refuses to delete outside the maps dir', () => {
    fs.mkdirSync(path.join(root, 'sibling'));
    expect(() => deleteMapFolder(maps, '../sibling')).toThrow();
    expect(fs.existsSync(path.join(root, 'sibling'))).toBe(true);
  });

  it('refuses to delete through a symlink that points outside', () => {
    const outside = tmp.create();
    fs.writeFileSync(path.join(outside, 'x.txt'), 'x');
    fs.symlinkSync(outside, path.join(maps, 'link'));
    expect(() => deleteMapFolder(maps, 'link')).toThrow();
    expect(() => deleteMapFolder(maps, path.join('link', 'x.txt'))).toThrow();
    expect(fs.existsSync(path.join(outside, 'x.txt'))).toBe(true);
  });

  it('reports missing folders and refuses to treat files as folders', () => {
    write('a.json', {});
    expect(() => deleteMapFolder(maps, 'ghost')).toThrow(/does not exist/);
    expect(() => deleteMapFolder(maps, 'a.json')).toThrow(/not a folder/);
    expect(fs.existsSync(path.join(maps, 'a.json'))).toBe(true);
  });
});
