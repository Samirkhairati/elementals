import fs from 'fs';
import path from 'path';
import { atomicWriteJsonSync } from './atomicWrite.js';
import {
  createFolder,
  deleteFolder,
  pathExists,
  renameFolder,
  resolveExistingFolder,
  walkTree,
  type ListWarning,
} from './folderOps.js';
import { assertSafeFileName, resolveInside } from './pathSafety.js';
import { errorMessage } from './result.js';
import { TilesetCache } from './tilesetCache.js';

/**
 * Electron-free tileset storage. Every function takes the tilesets root explicitly and
 * throws on failure; the IPC layer turns exceptions into `{ success: false, error }`.
 */

const PNG_EXT = '.png';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface TilesetFile {
  name: string;
  fileName: string;
  folderPath: string | null;
  dataUrl: string;
}

export interface TilesetListing {
  folders: string[];
  tilesets: TilesetFile[];
  warnings: ListWarning[];
}

interface TilesetMetadata {
  name?: unknown;
  [key: string]: unknown;
}

const jsonSiblingOf = (pngPath: string): string => pngPath.slice(0, -PNG_EXT.length) + '.json';
const jsonNameOf = (pngFileName: string): string => pngFileName.slice(0, -PNG_EXT.length) + '.json';

function readMetadata(jsonPath: string): TilesetMetadata {
  const parsed: unknown = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Tileset metadata is not a JSON object');
  }
  return parsed as TilesetMetadata;
}

export function listTilesets(tilesetsDir: string, cache: TilesetCache): TilesetListing {
  const warnings: ListWarning[] = [];
  const tilesets: TilesetFile[] = [];
  const live = new Set<string>();

  const folders = walkTree(
    tilesetsDir,
    ({ name: fileName, fullPath, folderPath }) => {
      if (!fileName.endsWith(PNG_EXT)) return;

      let name = path.parse(fileName).name;
      const jsonPath = jsonSiblingOf(fullPath);
      if (pathExists(jsonPath)) {
        try {
          const meta = readMetadata(jsonPath);
          if (typeof meta.name === 'string' && meta.name) name = meta.name;
        } catch (error: unknown) {
          warnings.push({
            file: path.relative(tilesetsDir, jsonPath),
            error: errorMessage(error),
          });
        }
      }

      const dataUrl = cache.getDataUrl(fullPath);
      live.add(fullPath);
      tilesets.push({ name, fileName, folderPath, dataUrl });
    },
    warnings
  );

  cache.retainOnly(live);
  return { folders, tilesets, warnings };
}

/** Make sure `sourcePath` is an existing regular file with PNG content. */
function assertPngSource(sourcePath: string): void {
  if (typeof sourcePath !== 'string' || sourcePath.includes('\0') || !path.isAbsolute(sourcePath)) {
    throw new Error('Tileset source must be an absolute file path');
  }
  if (path.extname(sourcePath).toLowerCase() !== PNG_EXT) {
    throw new Error('Tileset source must be a .png file');
  }
  const stat = fs.statSync(sourcePath);
  if (!stat.isFile()) throw new Error('Tileset source is not a regular file');
  const fd = fs.openSync(sourcePath, 'r');
  try {
    const header = Buffer.alloc(PNG_SIGNATURE.length);
    const read = fs.readSync(fd, header, 0, header.length, 0);
    if (read < PNG_SIGNATURE.length || !header.equals(PNG_SIGNATURE)) {
      throw new Error('Tileset source is not a valid PNG image');
    }
  } finally {
    fs.closeSync(fd);
  }
}

export function importTileset(
  tilesetsDir: string,
  cache: TilesetCache,
  sourcePath: string,
  name: string,
  folderPath: string | null = null
): { tileset: TilesetFile } {
  assertPngSource(sourcePath);

  const parsed = path.parse(path.basename(sourcePath));
  const stem = parsed.name.replace(/^\.+/, '') || 'tileset';
  const displayName = typeof name === 'string' && name.trim() !== '' ? name : stem;

  const targetDir = resolveInside(tilesetsDir, [folderPath]);
  fs.mkdirSync(targetDir, { recursive: true });

  let fileName = `${stem}${PNG_EXT}`;
  for (let counter = 1; ; counter++) {
    const candidate = path.join(targetDir, fileName);
    if (!pathExists(candidate) && !pathExists(jsonSiblingOf(candidate))) break;
    fileName = `${stem}_${counter}${PNG_EXT}`;
  }
  assertSafeFileName(fileName, PNG_EXT);

  const finalDest = path.join(targetDir, fileName);
  fs.copyFileSync(sourcePath, finalDest, fs.constants.COPYFILE_EXCL);
  try {
    atomicWriteJsonSync(jsonSiblingOf(finalDest), { name: displayName });
  } catch (error: unknown) {
    fs.rmSync(finalDest, { force: true }); // roll back so no half-imported tileset remains
    throw error;
  }

  cache.invalidate(finalDest);
  return {
    tileset: { name: displayName, fileName, folderPath, dataUrl: cache.getDataUrl(finalDest) },
  };
}

/** Change the display name stored in the tileset's metadata file. */
export function renameTileset(
  tilesetsDir: string,
  folderPath: string | null,
  fileName: string,
  newName: string
): void {
  assertSafeFileName(fileName, PNG_EXT);
  if (typeof newName !== 'string' || newName.trim() === '') {
    throw new Error('Tileset name must not be empty');
  }
  const pngPath = resolveInside(tilesetsDir, [folderPath, fileName]);
  if (!pathExists(pngPath)) throw new Error('Tileset does not exist.');

  const jsonPath = jsonSiblingOf(pngPath);
  const metadata = pathExists(jsonPath) ? readMetadata(jsonPath) : {};
  atomicWriteJsonSync(jsonPath, { ...metadata, name: newName });
}

/** Move a tileset (PNG + metadata) to another folder. Refuses to overwrite anything. */
export function moveTileset(
  tilesetsDir: string,
  cache: TilesetCache,
  fileName: string,
  oldFolder: string | null,
  newFolder: string | null
): void {
  assertSafeFileName(fileName, PNG_EXT);
  const oldPng = resolveInside(tilesetsDir, [oldFolder, fileName]);
  if (!pathExists(oldPng)) throw new Error('Tileset does not exist.');

  const newDir = resolveExistingFolder(tilesetsDir, newFolder);
  const newPng = path.join(newDir, fileName);
  if (newPng === oldPng) return;

  const oldJson = jsonSiblingOf(oldPng);
  const newJson = path.join(newDir, jsonNameOf(fileName));
  if (pathExists(newPng) || pathExists(newJson)) {
    throw new Error('A tileset with that file name already exists in the destination folder');
  }

  fs.renameSync(oldPng, newPng);
  if (pathExists(oldJson)) {
    try {
      fs.renameSync(oldJson, newJson);
    } catch (error: unknown) {
      fs.renameSync(newPng, oldPng); // roll back so PNG and metadata stay together
      throw error;
    }
  }
  cache.invalidate(oldPng);
  cache.invalidate(newPng);
}

export function createTilesetFolder(
  tilesetsDir: string,
  parentPath: string | null,
  folderName: string
): { folderPath: string } {
  return createFolder(tilesetsDir, parentPath, folderName);
}

export function renameTilesetFolder(
  tilesetsDir: string,
  cache: TilesetCache,
  oldFolderPath: string,
  newFolderName: string
): { newFolderPath: string } {
  const { newFolderPath, from } = renameFolder(tilesetsDir, oldFolderPath, newFolderName);
  cache.invalidateTree(from);
  return { newFolderPath };
}

export function deleteTilesetFolder(tilesetsDir: string, cache: TilesetCache, folderPath: string): void {
  const { removed } = deleteFolder(tilesetsDir, folderPath);
  cache.invalidateTree(removed);
}
