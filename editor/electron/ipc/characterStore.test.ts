import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listDir, makePng, makeTempDirTracker } from '../__testutils__/helpers';
import {
  createCharacterFolder,
  deleteCharacter,
  deleteCharacterFolder,
  importGraphic,
  isValidCharacterId,
  isValidGraphicId,
  listCharacters,
  listGraphics,
  moveCharacterFolder,
  renameCharacter,
  renameCharacterFolder,
  saveCharacter,
  type ImageCache,
} from './characterStore';
import { TilesetCache } from './tilesetCache';

const tmp = makeTempDirTracker();
let roots: { charactersDir: string; graphicsDir: string };
let cache: ImageCache;
let source: string;

beforeEach(() => {
  const root = tmp.create();
  roots = { charactersDir: path.join(root, 'database', 'characters'), graphicsDir: path.join(root, 'graphics') };
  cache = new TilesetCache();
  source = path.join(root, 'src.png');
  fs.writeFileSync(source, makePng(128, 192));
});
afterEach(() => tmp.cleanup());

const def = (image = 'sprites/hero/walk.png', over: object = {}) => ({
  version: 2, name: 'Hero', tags: [], facing: 'four', pivot: { x: 0.5, y: 1 },
  sheets: { walk: { image, frameWidth: 32, frameHeight: 48, margin: 0, spacing: 0 } },
  clips: {}, bindings: {}, ...over,
});

describe('ids', () => {
  it('accepts slash-separated slugs and .png graphic paths only', () => {
    expect(isValidCharacterId('characters/hero')).toBe(true);
    expect(isValidCharacterId('../x')).toBe(false);
    expect(isValidCharacterId('a//b')).toBe(false);
    expect(isValidGraphicId('sprites/hero/walk.png')).toBe(true);
    expect(isValidGraphicId('walk.gif')).toBe(false);
    expect(isValidGraphicId('../walk.png')).toBe(false);
  });
});

describe('graphics', () => {
  it('imports an image under its id, refuses to overwrite and lists it with its size', () => {
    const { graphic, image } = importGraphic(roots.graphicsDir, cache, source, 'sprites/hero/walk.png');
    expect(graphic).toMatchObject({ id: 'sprites/hero/walk.png', width: 128, height: 192 });
    expect(image).toMatch(/^data:image\/png;base64,/);
    expect(() => importGraphic(roots.graphicsDir, cache, source, 'sprites/hero/walk.png')).toThrow(/already exists/);
    expect(() => importGraphic(roots.graphicsDir, cache, source, '../escape.png')).toThrow(/Graphic id/);
    expect(() => importGraphic(roots.graphicsDir, cache, path.join(roots.graphicsDir, 'nope.png'), 'x.png')).toThrow();
    expect(listGraphics(roots.graphicsDir).map((g) => g.id)).toEqual(['sprites/hero/walk.png']);
    expect(listDir(roots.graphicsDir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
});

describe('characters', () => {
  beforeEach(() => {
    importGraphic(roots.graphicsDir, cache, source, 'sprites/hero/walk.png');
  });

  it('saves, lists with pictures, renames and deletes', () => {
    const saved = saveCharacter(roots, cache, 'characters/hero', def());
    expect(Object.keys(saved.character.images)).toEqual(['sprites/hero/walk.png']);
    expect(fs.existsSync(path.join(roots.charactersDir, 'characters/hero.json'))).toBe(true);

    saveCharacter(roots, cache, 'a', def());
    const listing = listCharacters(roots, cache);
    expect(listing.characters.map((c) => c.id)).toEqual(['a', 'characters/hero']);
    expect(listing.folders).toEqual(['characters']);
    expect(listing.warnings).toEqual([]);

    expect(renameCharacter(roots, 'a', 'props/a')).toEqual({ id: 'props/a' });
    expect(() => renameCharacter(roots, 'props/a', 'characters/hero')).toThrow(/already exists/);
    expect(() => renameCharacter(roots, 'nope', 'x')).toThrow(/does not exist/);
    deleteCharacter(roots, 'props/a');
    expect(listCharacters(roots, cache).characters.map((c) => c.id)).toEqual(['characters/hero']);
  });

  it('refuses unsafe ids and records that would break the game', () => {
    expect(() => saveCharacter(roots, cache, '../x', def())).toThrow(/Character id/);
    expect(() => saveCharacter(roots, cache, 'a', null)).toThrow(/object/);
    expect(() => saveCharacter(roots, cache, 'a', def('sprites/hero/walk.png', { version: 1 }))).toThrow(/version/);
    expect(() => saveCharacter(roots, cache, 'a', def('sprites/hero/walk.png', { name: ' ' }))).toThrow(/name/);
    expect(() => saveCharacter(roots, cache, 'a', def('missing.png'))).toThrow(/does not exist/);
    expect(() => saveCharacter(roots, cache, 'a', def('../x.png'))).toThrow(/not a valid graphic id/);
    expect(() => deleteCharacter(roots, '../x')).toThrow();
    expect(fs.existsSync(roots.charactersDir)).toBe(false);
  });

  it('a broken record becomes a warning, not a crash', () => {
    fs.mkdirSync(roots.charactersDir, { recursive: true });
    fs.writeFileSync(path.join(roots.charactersDir, 'bad.json'), '{nope');
    saveCharacter(roots, cache, 'good', def());
    const listing = listCharacters(roots, cache);
    expect(listing.characters.map((c) => c.id)).toEqual(['good']);
    expect(listing.warnings.map((w) => w.file)).toEqual(['bad.json']);
  });

  it('folders: create, rename, move and delete', () => {
    expect(createCharacterFolder(roots.charactersDir, null, 'npcs')).toEqual({ folderId: 'npcs' });
    expect(createCharacterFolder(roots.charactersDir, 'npcs', 'town')).toEqual({ folderId: 'npcs/town' });
    expect(() => createCharacterFolder(roots.charactersDir, null, 'bad name')).toThrow(/Folder names/);
    saveCharacter(roots, cache, 'npcs/town/mia', def());
    expect(renameCharacterFolder(roots.charactersDir, 'npcs/town', 'city')).toEqual({ folderId: 'npcs/city' });
    expect(moveCharacterFolder(roots.charactersDir, 'npcs/city', null)).toEqual({ folderId: 'city' });
    expect(() => moveCharacterFolder(roots.charactersDir, 'city', 'city')).toThrow(/itself/);
    expect(listCharacters(roots, cache).characters.map((c) => c.id)).toEqual(['city/mia']);
    deleteCharacterFolder(roots.charactersDir, 'city');
    expect(listCharacters(roots, cache).characters).toEqual([]);
  });
});
