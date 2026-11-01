import path from 'path';
import * as commonStore from './commonStore.js';
import * as databaseStore from './databaseStore.js';
import * as mapStore from './mapStore.js';
import { toResult } from './result.js';
import * as characterStore from './characterStore.js';
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
  charactersDir: string;
  graphicsDir: string;
}

export function projectDirs(projectDir: string): ProjectDirs {
  const root = path.resolve(projectDir);
  return {
    projectDir: root,
    mapsDir: path.join(root, 'maps'),
    tilesetsDir: path.join(root, 'tilesets'),
    charactersDir: path.join(root, 'database', 'characters'),
    graphicsDir: path.join(root, 'graphics'),
  };
}

export function createProjectChannels(projectDir: string): Record<string, ChannelFn> {
  const { projectDir: root, mapsDir, tilesetsDir, charactersDir, graphicsDir } = projectDirs(projectDir);
  const roots = { charactersDir, graphicsDir };
  const tilesetCache = new TilesetCache();
  const imageCache = new TilesetCache();

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

    // ── characters + graphics ──
    'get-characters': () =>
      toResult(() => {
        const result = characterStore.listCharacters(roots, imageCache);
        for (const w of result.warnings) console.warn(`[characters] ${w.file}: ${w.error}`);
        return result;
      }),
    'save-character': (id: string, def: unknown) => toResult(() => characterStore.saveCharacter(roots, imageCache, id, def)),
    'rename-character': (id: string, newId: string) => toResult(() => characterStore.renameCharacter(roots, id, newId)),
    'delete-character': (id: string) => toResult(() => characterStore.deleteCharacter(roots, id)),
    'import-graphic': (sourcePath: string, graphicId: string) =>
      toResult(() => characterStore.importGraphic(graphicsDir, imageCache, sourcePath, graphicId)),
    'create-character-folder': (parentId: string | null, name: string) =>
      toResult(() => characterStore.createCharacterFolder(charactersDir, parentId ?? null, name)),
    'rename-character-folder': (folderId: string, newName: string) =>
      toResult(() => characterStore.renameCharacterFolder(charactersDir, folderId, newName)),
    'move-character-folder': (folderId: string, newParentId: string | null) =>
      toResult(() => characterStore.moveCharacterFolder(charactersDir, folderId, newParentId ?? null)),
    'delete-character-folder': (folderId: string) => toResult(() => characterStore.deleteCharacterFolder(charactersDir, folderId)),

    // ── database ──
    'get-database': () => toResult(() => databaseStore.getDatabase(root)),
    'save-database': (database: unknown) => toResult(() => databaseStore.saveDatabase(root, database)),

    // ── common events ──
    'get-common-events': () =>
      toResult(() => {
        const result = commonStore.listCommonEvents(root);
        for (const w of result.warnings) console.warn(`[common] ${w.file}: ${w.error}`);
        return result;
      }),
    'save-common-event': (event: unknown) => toResult(() => commonStore.saveCommonEvent(root, event)),
    'delete-common-event': (id: string) => toResult(() => commonStore.deleteCommonEvent(root, id)),
  };
}

/** Channels that need a native dialog / window and therefore live in the main process only. */
export const DIALOG_CHANNELS = ['pick-tileset-file', 'pick-sprite-file', 'export-map'] as const;
