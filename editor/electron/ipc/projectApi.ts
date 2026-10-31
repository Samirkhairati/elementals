import path from 'path';
import * as databaseStore from './databaseStore.js';
import * as mapStore from './mapStore.js';
import { toResult } from './result.js';
import * as spriteStore from './spriteStore.js';
import { TilesetCache } from './tilesetCache.js';
import * as tilesetStore from './tilesetStore.js';

/**
 * Every IPC channel that only needs the project directory (no dialogs, no window), as a table of
 * `channel -> (...args) => IpcResult`. The Electron main process registers this table with
 * `ipcMain.handle`, and the browser harness (editor/vite-plugin-project-api.ts) serves the very
 * same table over HTTP, so the two can never drift apart.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChannelFn = (...args: any[]) => unknown;

export interface ProjectDirs {
  projectDir: string;
  mapsDir: string;
  tilesetsDir: string;
  spritesDir: string;
}

export function projectDirs(projectDir: string): ProjectDirs {
  const root = path.resolve(projectDir);
  return {
    projectDir: root,
    mapsDir: path.join(root, 'maps'),
    tilesetsDir: path.join(root, 'tilesets'),
    spritesDir: path.join(root, 'sprites'),
  };
}

export function createProjectChannels(projectDir: string): Record<string, ChannelFn> {
  const { projectDir: root, mapsDir, tilesetsDir, spritesDir } = projectDirs(projectDir);
  const tilesetCache = new TilesetCache();
  const spriteCache = new TilesetCache();

  return {
    // ── tilesets ──
    'get-tilesets': () =>
      toResult(() => {
        const result = tilesetStore.listTilesets(tilesetsDir, tilesetCache);
        for (const w of result.warnings) console.warn(`[tilesets] ${w.file}: ${w.error}`);
        return result;
      }),
    'import-tileset': (sourcePath: string, name: string, folderPath: string | null = null) =>
      toResult(() => tilesetStore.importTileset(tilesetsDir, tilesetCache, sourcePath, name, folderPath)),
    'create-folder': (parentPath: string | null, folderName: string) =>
      toResult(() => tilesetStore.createTilesetFolder(tilesetsDir, parentPath, folderName)),
    'rename-folder': (oldFolderPath: string, newFolderName: string) =>
      toResult(() => tilesetStore.renameTilesetFolder(tilesetsDir, tilesetCache, oldFolderPath, newFolderName)),
    'rename-tileset': (folderPath: string | null, fileName: string, newName: string) =>
      toResult(() => tilesetStore.renameTileset(tilesetsDir, folderPath, fileName, newName)),
    'move-tileset': (fileName: string, oldFolder: string | null, newFolder: string | null) =>
      toResult(() => tilesetStore.moveTileset(tilesetsDir, tilesetCache, fileName, oldFolder, newFolder)),
    'delete-folder': (folderPath: string) =>
      toResult(() => tilesetStore.deleteTilesetFolder(tilesetsDir, tilesetCache, folderPath)),

    // ── maps ──
    'get-maps': () =>
      toResult(() => {
        const result = mapStore.listMaps(mapsDir);
        for (const w of result.warnings) console.warn(`[maps] ${w.file}: ${w.error}`);
        return result;
      }),
    'create-map': (name: string, width: number, height: number, folderPath: string | null = null) =>
      toResult(() => mapStore.createMap(mapsDir, name, width, height, folderPath)),
    'save-map': (folderPath: string | null, fileName: string, mapData: unknown) =>
      toResult(() => mapStore.saveMap(mapsDir, folderPath, fileName, mapData)),
    'delete-map': (folderPath: string | null, fileName: string) =>
      toResult(() => mapStore.deleteMap(mapsDir, folderPath, fileName)),
    'create-map-folder': (parentPath: string | null, folderName: string) =>
      toResult(() => mapStore.createMapFolder(mapsDir, parentPath, folderName)),
    'delete-map-folder': (folderPath: string) => toResult(() => mapStore.deleteMapFolder(mapsDir, folderPath)),
    'rename-map-folder': (oldFolderPath: string, newFolderName: string) =>
      toResult(() => mapStore.renameMapFolder(mapsDir, oldFolderPath, newFolderName)),
    'rename-map': (folderPath: string | null, fileName: string, newName: string) =>
      toResult(() => mapStore.renameMap(mapsDir, folderPath, fileName, newName)),
    'move-map': (fileName: string, oldFolder: string | null, newFolder: string | null) =>
      toResult(() => mapStore.moveMap(mapsDir, fileName, oldFolder, newFolder)),

    // ── sprites ──
    'get-sprites': () =>
      toResult(() => {
        const result = spriteStore.listSprites(spritesDir, spriteCache);
        for (const w of result.warnings) console.warn(`[sprites] ${w.file}: ${w.error}`);
        return result;
      }),
    'import-sprite': (sourcePath: string, options: spriteStore.ImportSpriteOptions) =>
      toResult(() => spriteStore.importSprite(spritesDir, spriteCache, sourcePath, options)),
    'save-sprite-meta': (id: string, meta: unknown) => toResult(() => spriteStore.saveSpriteMeta(spritesDir, id, meta)),
    'rename-sprite': (id: string, newId: string) =>
      toResult(() => spriteStore.renameSprite(spritesDir, spriteCache, id, newId)),
    'delete-sprite': (id: string) => toResult(() => spriteStore.deleteSprite(spritesDir, spriteCache, id)),

    // ── database ──
    'get-database': () => toResult(() => databaseStore.getDatabase(root)),
    'save-database': (database: unknown) => toResult(() => databaseStore.saveDatabase(root, database)),
  };
}

/** Channels that need a native dialog / window and therefore live in the main process only. */
export const DIALOG_CHANNELS = ['pick-tileset-file', 'pick-sprite-file', 'export-map'] as const;
