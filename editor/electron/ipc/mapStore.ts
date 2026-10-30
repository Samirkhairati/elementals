import crypto from 'crypto';
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

/**
 * Electron-free map storage. Every function takes the maps root directory explicitly and
 * throws on failure; the IPC layer turns exceptions into `{ success: false, error }`.
 */

const MAP_EXT = '.json';
const MAX_MAP_DIMENSION = 100_000;

export interface MapFile {
  fileName: string;
  folderPath: string | null;
  name: string;
  width: number;
  height: number;
  layers: unknown[];
  entities: unknown[];
}

export interface MapListing {
  folders: string[];
  maps: MapFile[];
  warnings: ListWarning[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMapJson(fullPath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  if (!isPlainObject(parsed)) throw new Error('Map file does not contain a JSON object');
  return parsed;
}

/** Resolve an existing map file; `folderPath` null means the root. */
function resolveMapFile(mapsDir: string, folderPath: string | null, fileName: string): string {
  assertSafeFileName(fileName, MAP_EXT);
  return resolveInside(mapsDir, [folderPath, fileName]);
}

export function listMaps(mapsDir: string): MapListing {
  const warnings: ListWarning[] = [];
  const maps: MapFile[] = [];

  const folders = walkTree(
    mapsDir,
    ({ name, fullPath, folderPath }) => {
      if (!name.endsWith(MAP_EXT)) return;
      const data = readMapJson(fullPath);
      maps.push({
        fileName: name,
        folderPath,
        name: typeof data.name === 'string' && data.name ? data.name : path.parse(name).name,
        width: typeof data.width === 'number' && data.width ? data.width : 50,
        height: typeof data.height === 'number' && data.height ? data.height : 50,
        layers: Array.isArray(data.layers) ? data.layers : [],
        entities: Array.isArray(data.entities) ? data.entities : [],
      });
    },
    warnings
  );

  return { folders, maps, warnings };
}

function defaultLayers(): Record<string, unknown>[] {
  const layer = (
    name: string,
    type: string,
    extra: Record<string, unknown> = {}
  ): Record<string, unknown> => ({
    id: crypto.randomUUID(),
    name,
    type,
    visible: true,
    locked: false,
    ...extra,
    data: {},
  });
  return [
    layer('collisions', 'collision'),
    layer('terrain', 'terrain'),
    layer('encounters', 'encounters'),
    layer('decorations', 'tile', { z: 20 }),
    layer('building', 'tile', { z: 10 }),
    layer('ground', 'tile', { z: 1 }),
  ];
}

function assertDimension(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > MAX_MAP_DIMENSION) {
    throw new Error(`Map ${what} must be a positive number`);
  }
  return value;
}

/** File-system friendly slug used for the new map's file name. */
export function slugifyMapName(name: string): string {
  return name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase() || 'map';
}

export function createMap(
  mapsDir: string,
  name: string,
  width: number,
  height: number,
  folderPath: string | null = null
): { map: MapFile } {
  if (typeof name !== 'string' || name.trim() === '') throw new Error('Map name must not be empty');
  assertDimension(width, 'width');
  assertDimension(height, 'height');

  const targetDir = resolveInside(mapsDir, [folderPath]);
  fs.mkdirSync(targetDir, { recursive: true });

  const slug = slugifyMapName(name);
  let finalDest = path.join(targetDir, `${slug}${MAP_EXT}`);
  for (let counter = 1; pathExists(finalDest); counter++) {
    finalDest = path.join(targetDir, `${slug}_${counter}${MAP_EXT}`);
  }

  const layers = defaultLayers();
  atomicWriteJsonSync(finalDest, { name, width, height, layers, entities: [] });

  return {
    map: {
      fileName: path.basename(finalDest),
      folderPath,
      name,
      width,
      height,
      layers,
      entities: [],
    },
  };
}

export function saveMap(
  mapsDir: string,
  folderPath: string | null,
  fileName: string,
  mapData: unknown
): void {
  if (!isPlainObject(mapData)) throw new Error('Map data must be a JSON object');
  const dest = resolveMapFile(mapsDir, folderPath, fileName);
  atomicWriteJsonSync(dest, mapData);
}

/** Deleting a map that is already gone is not an error. */
export function deleteMap(mapsDir: string, folderPath: string | null, fileName: string): void {
  const dest = resolveMapFile(mapsDir, folderPath, fileName);
  fs.rmSync(dest, { force: true });
}

export function renameMap(
  mapsDir: string,
  folderPath: string | null,
  fileName: string,
  newName: string
): void {
  if (typeof newName !== 'string' || newName.trim() === '') throw new Error('Map name must not be empty');
  const dest = resolveMapFile(mapsDir, folderPath, fileName);
  if (!pathExists(dest)) throw new Error('Map does not exist.');
  const data = readMapJson(dest);
  data.name = newName;
  atomicWriteJsonSync(dest, data);
}

/** Move a map between folders. Refuses to overwrite and to move a map that does not exist. */
export function moveMap(
  mapsDir: string,
  fileName: string,
  oldFolder: string | null,
  newFolder: string | null
): void {
  const from = resolveMapFile(mapsDir, oldFolder, fileName);
  if (!pathExists(from)) throw new Error('Map does not exist.');
  const toDir = resolveExistingFolder(mapsDir, newFolder);
  const to = path.join(toDir, fileName);
  if (to === from) return;
  if (pathExists(to)) throw new Error('A map with that file name already exists in the destination folder');
  fs.renameSync(from, to);
}

export const createMapFolder = createFolder;
export const renameMapFolder = (
  mapsDir: string,
  oldFolderPath: string,
  newFolderName: string
): { newFolderPath: string } => {
  const { newFolderPath } = renameFolder(mapsDir, oldFolderPath, newFolderName);
  return { newFolderPath };
};
export const deleteMapFolder = (mapsDir: string, folderPath: string): void => {
  deleteFolder(mapsDir, folderPath);
};
