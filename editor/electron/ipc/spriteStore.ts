import fs from 'fs';
import path from 'path';
import { atomicWriteJsonSync } from './atomicWrite.js';
import { pathExists, walkTree, type ListWarning } from './folderOps.js';
import { resolveInside, resolveStrictlyInside } from './pathSafety.js';
import { assertPngFile, readPngSizeFromFile } from './pngHeader.js';
import {
  CHARACTER_ROWS,
  SPRITE_KINDS,
  SPRITE_META_FILE,
  isValidSpriteId,
  normalizeSpriteMeta,
  sheetGrid,
  sheetNamesOf,
  slugifySpriteName,
  validateSpriteMeta,
  type SheetSize,
  type SpriteAssetMeta,
  type SpriteKind,
} from './spriteMeta.js';
import { TilesetCache } from './tilesetCache.js';

/**
 * Electron-free sprite asset storage (`project/sprites/<id>/sprite.json` + sheet PNGs).
 * Every function takes the sprites root explicitly and throws on failure; the IPC layer turns
 * exceptions into `{ success: false, error }`. The PNG data-URL cache is the tileset cache (mtime + size).
 */

export type SpriteCache = TilesetCache;

/** Mirrors `SpriteAssetInfo` in shared/engine/types.ts. */
export interface SpriteAssetInfo {
  id: string;
  meta: SpriteAssetMeta;
  /** data: URLs of each sheet file by file name. */
  sheets: Record<string, string>;
}

export interface SpriteListing {
  assets: SpriteAssetInfo[];
  warnings: ListWarning[];
}

export interface ImportSpriteOptions {
  /** Explicit asset id (directory path under project/sprites). Takes precedence over `name`. */
  id?: string;
  /** Display name; also used to derive the id (`characters/<slug>` or `objects/<slug>`) when no id is given. */
  name?: string;
  kind: SpriteKind;
  /** Default: the whole image (object/animated) or a quarter of it (character: 4 x 4 grid). */
  frameWidth?: number;
  frameHeight?: number;
}

const toId = (relFolder: string): string => relFolder.split(path.sep).join('/');

function assertSpriteId(id: unknown): string {
  if (!isValidSpriteId(id)) {
    throw new Error('Sprite id must be a "/"-separated path of letters, digits, "_" and "-"');
  }
  return id;
}

/** Directory of an existing asset (it has a sprite.json). */
function resolveAssetDir(spritesDir: string, id: string): string {
  assertSpriteId(id);
  const dir = resolveStrictlyInside(spritesDir, [id]);
  if (!pathExists(path.join(dir, SPRITE_META_FILE))) throw new Error(`Sprite "${id}" does not exist.`);
  return dir;
}

function readMeta(dir: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(dir, SPRITE_META_FILE), 'utf8'));
}

/** Sizes of the sheets `meta` refers to; sheets that are missing or not PNGs are left out. */
function sheetSizesOf(dir: string, sheetNames: string[]): Record<string, SheetSize> {
  const sizes: Record<string, SheetSize> = {};
  for (const name of sheetNames) {
    try {
      const file = resolveInside(dir, [name]);
      if (fs.statSync(file).isFile()) sizes[name] = readPngSizeFromFile(file);
    } catch {
      /* reported as "sheet does not exist" by the validator */
    }
  }
  return sizes;
}

/** Validate `raw` (a parsed sprite.json) against the files in `dir`; returns the clean meta. */
function loadValidMeta(dir: string, raw: unknown): SpriteAssetMeta {
  // Sheet names are only trustworthy after the structural validation.
  const structural = validateSpriteMeta(raw);
  if (!structural.ok) throw new Error(structural.errors.join('; '));
  const names = sheetNamesOf(raw as SpriteAssetMeta);
  return normalizeSpriteMeta(raw, sheetSizesOf(dir, names));
}

function buildInfo(dir: string, id: string, meta: SpriteAssetMeta, cache: SpriteCache): SpriteAssetInfo {
  const sheets: Record<string, string> = {};
  for (const name of sheetNamesOf(meta)) sheets[name] = cache.getDataUrl(path.join(dir, name));
  return { id, meta, sheets };
}

export function listSprites(spritesDir: string, cache: SpriteCache): SpriteListing {
  const warnings: ListWarning[] = [];
  const assets: SpriteAssetInfo[] = [];
  const live = new Set<string>();

  walkTree(
    spritesDir,
    ({ name, fullPath, folderPath }) => {
      if (name !== SPRITE_META_FILE) return;
      if (folderPath === null) {
        warnings.push({ file: name, error: 'sprite.json must live inside an asset directory' });
        return;
      }
      const id = toId(folderPath);
      if (!isValidSpriteId(id)) {
        warnings.push({ file: path.join(folderPath, name), error: `"${id}" is not a valid sprite id` });
        return;
      }
      const dir = path.dirname(fullPath);
      const meta = loadValidMeta(dir, JSON.parse(fs.readFileSync(fullPath, 'utf8')));
      const info = buildInfo(dir, id, meta, cache);
      for (const sheetName of sheetNamesOf(meta)) live.add(path.join(dir, sheetName));
      assets.push(info);
    },
    warnings
  );

  assets.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  cache.retainOnly(live);
  return { assets, warnings };
}

export function getSprite(spritesDir: string, cache: SpriteCache, id: string): { asset: SpriteAssetInfo } {
  const dir = resolveAssetDir(spritesDir, id);
  return { asset: buildInfo(dir, id, loadValidMeta(dir, readMeta(dir)), cache) };
}

export function importSprite(
  spritesDir: string,
  cache: SpriteCache,
  sourcePath: string,
  options: ImportSpriteOptions
): { asset: SpriteAssetInfo } {
  if (typeof options !== 'object' || options === null) throw new Error('Import options are required');
  const size = assertPngFile(sourcePath, 'Sprite');
  const { kind } = options;
  if (!SPRITE_KINDS.includes(kind)) throw new Error(`Sprite kind must be one of ${SPRITE_KINDS.join(', ')}`);

  // Resolve id + display name.
  let id: string;
  let name: string;
  if (options.id !== undefined && options.id !== '') {
    id = assertSpriteId(options.id);
    name = typeof options.name === 'string' && options.name.trim() ? options.name.trim() : id.split('/').pop()!;
    if (pathExists(resolveStrictlyInside(spritesDir, [id]))) throw new Error(`A sprite with id "${id}" already exists`);
  } else {
    if (typeof options.name !== 'string' || options.name.trim() === '') {
      throw new Error('Provide a sprite id or a name');
    }
    name = options.name.trim();
    const base = `${kind === 'character' ? 'characters' : 'objects'}/${slugifySpriteName(name)}`;
    id = base;
    for (let n = 1; pathExists(resolveStrictlyInside(spritesDir, [id])); n++) id = `${base}_${n}`;
  }
  const dir = resolveStrictlyInside(spritesDir, [id]);

  // Build the meta from the image + options and validate it BEFORE touching the disk. The defaults match
  // `defaultSpriteMeta` in shared/engine/sprites.ts (editor/engine-parity.test.ts checks that they stay equal).
  const isChar = kind === 'character';
  const sheetFile = isChar ? 'walk.png' : 'sheet.png';
  const frameWidth = options.frameWidth ?? (isChar ? Math.floor(size.width / 4) : kind === 'animated' ? Math.min(size.width, size.height) : size.width);
  const frameHeight = options.frameHeight ?? (isChar ? Math.floor(size.height / CHARACTER_ROWS) : size.height);
  const base: SpriteAssetMeta = {
    version: 1,
    name,
    kind,
    frameWidth,
    frameHeight,
    margin: 0,
    spacing: 0,
    pivotX: 0.5,
    pivotY: 1,
  };
  const grid = sheetGrid(base, size);
  let draft: SpriteAssetMeta;
  if (isChar) {
    draft = {
      ...base,
      character: {
        sheets: { walk: sheetFile },
        framesPerDirection: options.frameWidth === undefined ? 4 : (grid?.cols ?? 4),
        idleFrame: 0,
        walkFps: 8,
        runFps: 12,
      },
    };
  } else if (kind === 'animated') {
    const count = Math.max(1, grid ? grid.cols : Math.floor(size.width / Math.max(1, frameWidth)));
    draft = { ...base, sheet: sheetFile, animations: { idle: { frames: Array.from({ length: count }, (_, i) => i), fps: 8, loop: true } } };
  } else {
    draft = { ...base, sheet: sheetFile, animations: {} };
  }
  const meta = normalizeSpriteMeta(draft, { [sheetFile]: size });

  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.mkdirSync(dir); // fails if it appeared in the meantime
  try {
    fs.copyFileSync(sourcePath, path.join(dir, sheetFile), fs.constants.COPYFILE_EXCL);
    atomicWriteJsonSync(path.join(dir, SPRITE_META_FILE), meta);
  } catch (error: unknown) {
    fs.rmSync(dir, { recursive: true, force: true }); // no half-imported asset remains
    throw error;
  }
  return { asset: buildInfo(dir, id, meta, cache) };
}

/** Validate against the sheets on disk and write sprite.json. Returns the normalised meta. */
export function saveSpriteMeta(spritesDir: string, id: string, meta: unknown): { meta: SpriteAssetMeta } {
  const dir = resolveAssetDir(spritesDir, id);
  const structural = validateSpriteMeta(meta);
  if (!structural.ok) throw new Error(`Invalid sprite: ${structural.errors.join('; ')}`);
  const clean = normalizeSpriteMeta(meta, sheetSizesOf(dir, sheetNamesOf(meta as SpriteAssetMeta)));
  atomicWriteJsonSync(path.join(dir, SPRITE_META_FILE), clean);
  return { meta: clean };
}

/** Remove now-empty parent directories of `dir` up to (not including) `spritesDir`. */
function pruneEmptyParents(spritesDir: string, dir: string): void {
  const root = path.resolve(spritesDir);
  for (let parent = path.dirname(dir); parent !== root && parent.startsWith(root + path.sep); parent = path.dirname(parent)) {
    try {
      if (fs.readdirSync(parent).length > 0) return;
      fs.rmdirSync(parent);
    } catch {
      return;
    }
  }
}

function containsNestedAsset(dir: string): boolean {
  const warnings: ListWarning[] = [];
  let nested = false;
  walkTree(
    dir,
    ({ name, fullPath }) => {
      if (name === SPRITE_META_FILE && path.dirname(fullPath) !== dir) nested = true;
    },
    warnings
  );
  return nested;
}

/** Rename and/or move an asset to another id. Refuses to overwrite anything. */
export function renameSprite(spritesDir: string, cache: SpriteCache, id: string, newId: string): { id: string } {
  const from = resolveAssetDir(spritesDir, id);
  assertSpriteId(newId);
  if (newId === id) return { id };
  if (newId.startsWith(`${id}/`)) throw new Error('A sprite cannot be moved into itself');
  const to = resolveStrictlyInside(spritesDir, [newId]);

  if (pathExists(to)) {
    // A case-only rename on a case-insensitive file system resolves to the very same directory.
    const same = fs.statSync(from).ino === fs.statSync(to).ino && from.toLowerCase() === to.toLowerCase();
    if (!same) throw new Error(`A sprite with id "${newId}" already exists`);
  }
  // Moving below an existing asset would nest assets inside each other.
  const parentAsset = newId.split('/').slice(0, -1);
  for (let i = 1; i <= parentAsset.length; i++) {
    const ancestor = resolveInside(spritesDir, parentAsset.slice(0, i));
    if (pathExists(path.join(ancestor, SPRITE_META_FILE))) {
      throw new Error(`Cannot place a sprite inside the asset "${parentAsset.slice(0, i).join('/')}"`);
    }
  }

  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
  cache.invalidateTree(from);
  pruneEmptyParents(spritesDir, from);
  return { id: newId };
}

export function deleteSprite(spritesDir: string, cache: SpriteCache, id: string): void {
  const dir = resolveAssetDir(spritesDir, id);
  if (containsNestedAsset(dir)) throw new Error(`Sprite "${id}" contains other sprites; delete those first`);
  fs.rmSync(dir, { recursive: true, force: true });
  cache.invalidateTree(dir);
  pruneEmptyParents(spritesDir, dir);
}

