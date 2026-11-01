import fs from 'fs';
import path from 'path';
import { atomicWriteJsonSync } from './atomicWrite.js';
import { createFolder, deleteFolder, pathExists, renameFolder, walkTree, type ListWarning } from './folderOps.js';
import { resolveInside, resolveStrictlyInside } from './pathSafety.js';
import { assertPngFile, readPngSizeFromFile } from './pngHeader.js';
import { TilesetCache } from './tilesetCache.js';

/**
 * Electron-free character + graphics storage:
 *   project/database/characters/<id>.json   Character v2 (docs/database-and-characters-spec.md §5)
 *   project/graphics/<graphicId>            the images (graphic id = path under project/graphics, with extension)
 * Every function takes the roots explicitly and throws on failure; the IPC layer turns exceptions into
 * `{ success: false, error }`. Deep validation (clips, frames, bindings) lives in shared/engine/characters.ts,
 * which the renderer runs before saving and the asset sync runs again; this module checks what it needs
 * to touch the disk safely. editor/engine-parity.test.ts pins the id rules to the shared ones.
 */

export type ImageCache = TilesetCache;

const SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const FILE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*\.png$/i;

export function isValidCharacterId(id: unknown): id is string {
  return typeof id === 'string' && id !== '' && id.split('/').every((p) => SEGMENT.test(p));
}

export function isValidGraphicId(id: unknown): id is string {
  if (typeof id !== 'string' || id === '') return false;
  const parts = id.split('/');
  const file = parts.pop() as string;
  return FILE.test(file) && parts.every((p) => SEGMENT.test(p));
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const toId = (rel: string): string => rel.split(path.sep).join('/');

export interface CharacterInfo {
  id: string;
  /** The parsed record (a CharacterDef when valid). */
  def: unknown;
  /** data: URLs of the graphics its sheets use, by graphic id. */
  images: Record<string, string>;
}

export interface GraphicInfo {
  id: string;
  width: number;
  height: number;
  bytes: number;
  mtimeMs: number;
}

export interface CharacterListing {
  characters: CharacterInfo[];
  graphics: GraphicInfo[];
  /** Every plain folder under project/database/characters (ids, "/"-separated, sorted). */
  folders: string[];
  warnings: ListWarning[];
}

export interface CharacterRoots {
  charactersDir: string;
  graphicsDir: string;
}

function characterFile(charactersDir: string, id: string): string {
  if (!isValidCharacterId(id)) throw new Error('Character id must be a "/"-separated path of letters, digits, "_" and "-"');
  return resolveStrictlyInside(charactersDir, [`${id}.json`]);
}

function existingCharacterFile(charactersDir: string, id: string): string {
  const file = characterFile(charactersDir, id);
  if (!pathExists(file)) throw new Error(`Character "${id}" does not exist.`);
  return file;
}

function sheetImages(def: unknown): string[] {
  if (!isRecord(def) || !isRecord(def.sheets)) return [];
  const out: string[] = [];
  for (const s of Object.values(def.sheets)) if (isRecord(s) && typeof s.image === 'string' && !out.includes(s.image)) out.push(s.image);
  return out;
}

function imagesOf(graphicsDir: string, def: unknown, cache: ImageCache): Record<string, string> {
  const images: Record<string, string> = {};
  for (const id of sheetImages(def)) {
    if (!isValidGraphicId(id)) continue;
    try {
      images[id] = cache.getDataUrl(resolveInside(graphicsDir, [id]));
    } catch {
      /* a missing graphic is reported by validation */
    }
  }
  return images;
}

/** Lists graphics (id, size) below project/graphics. */
export function listGraphics(graphicsDir: string, warnings: ListWarning[] = []): GraphicInfo[] {
  const graphics: GraphicInfo[] = [];
  walkTree(
    graphicsDir,
    ({ name, fullPath, folderPath }) => {
      if (!name.toLowerCase().endsWith('.png')) return;
      const id = toId(folderPath ? path.join(folderPath, name) : name);
      if (!isValidGraphicId(id)) {
        warnings.push({ file: id, error: `"${id}" is not a valid graphic id (letters, digits, "_" and "-", ending in .png)` });
        return;
      }
      const stat = fs.statSync(fullPath);
      const { width, height } = readPngSizeFromFile(fullPath);
      graphics.push({ id, width, height, bytes: stat.size, mtimeMs: stat.mtimeMs });
    },
    warnings,
  );
  return graphics.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function listCharacters(roots: CharacterRoots, cache: ImageCache): CharacterListing {
  const warnings: ListWarning[] = [];
  const characters: CharacterInfo[] = [];
  const live = new Set<string>();
  const walked = walkTree(
    roots.charactersDir,
    ({ name, fullPath, folderPath }) => {
      if (!name.endsWith('.json')) return;
      const id = toId(folderPath ? path.join(folderPath, name) : name).replace(/\.json$/, '');
      if (!isValidCharacterId(id)) {
        warnings.push({ file: `${id}.json`, error: `"${id}" is not a valid character id` });
        return;
      }
      const def = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const images = imagesOf(roots.graphicsDir, def, cache);
      for (const g of Object.keys(images)) live.add(path.join(roots.graphicsDir, g));
      characters.push({ id, def, images });
    },
    warnings,
  );
  characters.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const graphics = listGraphics(roots.graphicsDir, warnings);
  // keep cached images of unused graphics too (the Graphics table shows them); only forget deleted files
  for (const g of graphics) live.add(path.join(roots.graphicsDir, g.id));
  cache.retainOnly(live);
  return { characters, graphics, folders: walked.map(toId).sort(), warnings };
}

/** Shape checks needed to write safely; semantic validation happens in the renderer and in the sync. */
function assertCharacterRecord(roots: CharacterRoots, def: unknown): asserts def is Record<string, unknown> {
  if (!isRecord(def)) throw new Error('A character must be an object');
  if (def.version !== 2) throw new Error('Character version must be 2');
  if (typeof def.name !== 'string' || def.name.trim() === '') throw new Error('A character needs a name');
  if (!isRecord(def.sheets) || !isRecord(def.clips) || !isRecord(def.bindings)) throw new Error('A character needs sheets, clips and bindings objects');
  for (const image of sheetImages(def)) {
    if (!isValidGraphicId(image)) throw new Error(`"${image}" is not a valid graphic id`);
    if (!pathExists(resolveInside(roots.graphicsDir, [image]))) throw new Error(`Graphic "${image}" does not exist in project/graphics`);
  }
}

/** Creates or overwrites a character record. */
export function saveCharacter(roots: CharacterRoots, cache: ImageCache, id: string, def: unknown): { character: CharacterInfo } {
  const file = characterFile(roots.charactersDir, id);
  assertCharacterRecord(roots, def);
  // A character may not sit where a folder is, nor inside another character's name.
  if (pathExists(file) && fs.lstatSync(file).isDirectory()) throw new Error(`"${id}" is a folder`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  atomicWriteJsonSync(file, def);
  return { character: { id, def, images: imagesOf(roots.graphicsDir, def, cache) } };
}

export function deleteCharacter(roots: CharacterRoots, id: string): void {
  fs.rmSync(existingCharacterFile(roots.charactersDir, id));
}

/** Renames and/or moves the record. The id of sprites on maps is NOT rewritten here (that is the rename flow's job). */
export function renameCharacter(roots: CharacterRoots, id: string, newId: string): { id: string } {
  const from = existingCharacterFile(roots.charactersDir, id);
  const to = characterFile(roots.charactersDir, newId);
  if (newId === id) return { id };
  if (pathExists(to)) throw new Error(`A character with id "${newId}" already exists`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
  return { id: newId };
}

/** Copies an image into the library under `graphicId`. Refuses to overwrite. */
export function importGraphic(graphicsDir: string, cache: ImageCache, sourcePath: string, graphicId: string): { graphic: GraphicInfo; image: string } {
  if (!isValidGraphicId(graphicId)) throw new Error('Graphic id must be a "/"-separated path of letters, digits, "_" and "-" ending in .png');
  const size = assertPngFile(sourcePath, 'Graphic');
  const target = resolveStrictlyInside(graphicsDir, [graphicId]);
  if (pathExists(target)) throw new Error(`A graphic with id "${graphicId}" already exists`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(sourcePath, target, fs.constants.COPYFILE_EXCL);
  const stat = fs.statSync(target);
  return {
    graphic: { id: graphicId, width: size.width, height: size.height, bytes: stat.size, mtimeMs: stat.mtimeMs },
    image: cache.getDataUrl(target),
  };
}

// ── folders (directories below project/database/characters) ─────────────────────────────────────

function assertFolderSegment(name: unknown): string {
  if (typeof name !== 'string' || !SEGMENT.test(name)) throw new Error('Folder names use letters, digits, "_" and "-" only');
  return name;
}

function folderDir(charactersDir: string, folderId: string): string {
  if (!isValidCharacterId(folderId)) throw new Error('Invalid folder id');
  const dir = resolveStrictlyInside(charactersDir, [folderId]);
  if (!pathExists(dir) || !fs.lstatSync(dir).isDirectory()) throw new Error(`Folder "${folderId}" does not exist.`);
  return dir;
}

export function createCharacterFolder(charactersDir: string, parentId: string | null, name: string): { folderId: string } {
  assertFolderSegment(name);
  if (parentId) folderDir(charactersDir, parentId);
  fs.mkdirSync(charactersDir, { recursive: true });
  const { folderPath } = createFolder(charactersDir, parentId, name);
  return { folderId: toId(folderPath) };
}

export function renameCharacterFolder(charactersDir: string, folderId: string, newName: string): { folderId: string } {
  assertFolderSegment(newName);
  folderDir(charactersDir, folderId);
  return { folderId: toId(renameFolder(charactersDir, folderId, newName).newFolderPath) };
}

export function moveCharacterFolder(charactersDir: string, folderId: string, newParentId: string | null): { folderId: string } {
  const from = folderDir(charactersDir, folderId);
  if (newParentId !== null) {
    folderDir(charactersDir, newParentId);
    if (newParentId === folderId || newParentId.startsWith(`${folderId}/`)) throw new Error('A folder cannot be moved into itself');
  }
  const leaf = folderId.split('/').pop() as string;
  const newId = newParentId ? `${newParentId}/${leaf}` : leaf;
  if (newId === folderId) return { folderId };
  const to = resolveStrictlyInside(charactersDir, [newId]);
  if (pathExists(to)) throw new Error(`"${newId}" already exists`);
  fs.renameSync(from, to);
  return { folderId: newId };
}

export function deleteCharacterFolder(charactersDir: string, folderId: string): void {
  folderDir(charactersDir, folderId);
  deleteFolder(charactersDir, folderId);
}
