import path from 'path';
import * as commonStore from './commonStore.js';
import * as databaseStore from './databaseStore.js';
import * as mapStore from './mapStore.js';
import { toResult } from './result.js';
import * as characterStore from './characterStore.js';
import { TilesetCache } from './tilesetCache.js';
import { syncGameAssets, type AssetSyncSummary } from './gameAssets.js';
import * as gameSettingsStore from './gameSettingsStore.js';
import * as tilesetStore from './tilesetStore.js';
import * as graphicStore from './graphicStore.js';

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

/** Where "Export to game" writes: the game's committed maps, beside the project folder (`<repo>/game/public/data/maps`). */
export function defaultGameMapsDir(projectDir: string): string {
  return path.join(path.resolve(projectDir), '..', 'game', 'public', 'data', 'maps');
}

export function createProjectChannels(
  projectDir: string,
  options: { gameMapsDir?: string } = {}
): Record<string, ChannelFn> {
  const { projectDir: root, mapsDir, tilesetsDir, charactersDir, graphicsDir } = projectDirs(projectDir);
  const gameMapsDir = options.gameMapsDir ?? defaultGameMapsDir(projectDir);
  const roots = { charactersDir, graphicsDir };
  const tilesetCache = new TilesetCache();
  const imageCache = new TilesetCache();

  /**
   * What the author adds to the project (a picture, a tileset, a setting) reaches the game right away: a successful
   * result gets the asset sync (what `npm run assets:sync` does) and carries its summary as `assets`. A sync that cannot
   * run (a project copy, a packaged editor) or finds problems never turns the result into a failure.
   */
  const withAssetSync = async <T extends { success: boolean }>(result: T): Promise<T | (T & { assets: AssetSyncSummary })> => {
    if (!result.success) return result;
    const assets = await syncGameAssets(root, gameMapsDir);
    if (assets.skipped) console.warn(`[assets] ${assets.skipped}`);
    return { ...result, assets };
  };

  return {
    // ── tilesets ──
    'get-tilesets': () =>
      toResult(() => {
        const result = tilesetStore.listTilesets(tilesetsDir, tilesetCache);
        for (const w of result.warnings) console.warn(`[tilesets] ${w.file}: ${w.error}`);
        return result;
      }),
    'import-tileset': async (sourcePath: string, name: string, folderPath: string | null = null, fileStem?: string) =>
      withAssetSync(toResult(() => tilesetStore.importTileset(tilesetsDir, tilesetCache, sourcePath, name, folderPath, fileStem))),
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
    'rename-tileset-file': (folderPath: string | null, fileName: string, newStem: string) =>
      toResult(() => tilesetStore.renameTilesetFile(tilesetsDir, tilesetCache, folderPath, fileName, newStem)),
    'delete-tileset': (folderPath: string | null, fileName: string) =>
      toResult(() => tilesetStore.deleteTileset(tilesetsDir, tilesetCache, folderPath, fileName)),
    'move-tileset-folder': (folderPath: string, newParent: string | null) =>
      toResult(() => tilesetStore.moveTilesetFolder(tilesetsDir, tilesetCache, folderPath, newParent)),

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
    // The pictures, tilesets and sprites the map uses go to the game with it.
    'export-map-to-game': async (fileName: string, json: string) =>
      withAssetSync(toResult(() => mapStore.exportMapToGame(gameMapsDir, fileName, json))),
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
    'save-character': async (id: string, def: unknown) => withAssetSync(toResult(() => characterStore.saveCharacter(roots, imageCache, id, def))),
    'rename-character': async (id: string, newId: string) => withAssetSync(toResult(() => characterStore.renameCharacter(roots, id, newId))),
    'delete-character': async (id: string) => withAssetSync(toResult(() => characterStore.deleteCharacter(roots, id))),
    'import-graphic': async (sourcePath: string, graphicId: string) =>
      withAssetSync(toResult(() => characterStore.importGraphic(graphicsDir, imageCache, sourcePath, graphicId))),
    // The new picture reaches the game's copy right away, like an import.
    'replace-graphic': async (sourcePath: string, graphicId: string) =>
      withAssetSync(toResult(() => graphicStore.replaceGraphic(graphicsDir, imageCache, sourcePath, graphicId))),
    'rename-graphic': (id: string, newId: string) => toResult(() => graphicStore.renameGraphic(graphicsDir, imageCache, id, newId)),
    'delete-graphic': (id: string) => toResult(() => graphicStore.deleteGraphic(graphicsDir, imageCache, id)),
    'create-graphic-folder': (parentId: string | null, name: string) => toResult(() => graphicStore.createGraphicFolder(graphicsDir, parentId ?? null, name)),
    'rename-graphic-folder': (folderId: string, newName: string) => toResult(() => graphicStore.renameGraphicFolder(graphicsDir, imageCache, folderId, newName)),
    'move-graphic-folder': (folderId: string, newParentId: string | null) => toResult(() => graphicStore.moveGraphicFolder(graphicsDir, imageCache, folderId, newParentId ?? null)),
    'delete-graphic-folder': (folderId: string) => toResult(() => graphicStore.deleteGraphicFolder(graphicsDir, imageCache, folderId)),
    'create-character-folder': (parentId: string | null, name: string) =>
      toResult(() => characterStore.createCharacterFolder(charactersDir, parentId ?? null, name)),
    'rename-character-folder': (folderId: string, newName: string) =>
      toResult(() => characterStore.renameCharacterFolder(charactersDir, folderId, newName)),
    'move-character-folder': (folderId: string, newParentId: string | null) =>
      toResult(() => characterStore.moveCharacterFolder(charactersDir, folderId, newParentId ?? null)),
    'delete-character-folder': (folderId: string) => toResult(() => characterStore.deleteCharacterFolder(charactersDir, folderId)),

    // ── database (saving also refreshes the game's copies of characters, switches/variables and common events) ──
    'get-database': () => toResult(() => databaseStore.getDatabase(root)),
    'save-database': async (database: unknown) => withAssetSync(toResult(() => databaseStore.saveDatabase(root, database))),

    // ── game settings (project/game-settings.json; saving also writes game/public/data/settings.json) ──
    'get-game-settings': () => toResult(() => gameSettingsStore.getGameSettings(root)),
    'save-game-settings': async (settings: unknown) => withAssetSync(toResult(() => gameSettingsStore.saveGameSettings(root, settings))),

    // ── common events ──
    'get-common-events': () =>
      toResult(() => {
        const result = commonStore.listCommonEvents(root);
        for (const w of result.warnings) console.warn(`[common] ${w.file}: ${w.error}`);
        return result;
      }),
    'save-common-event': async (event: unknown) => withAssetSync(toResult(() => commonStore.saveCommonEvent(root, event))),
    'delete-common-event': async (id: string) => withAssetSync(toResult(() => commonStore.deleteCommonEvent(root, id))),
  };
}

/** Channels that need a native dialog / window and therefore live in the main process only. */
export const DIALOG_CHANNELS = ['pick-tileset-file', 'pick-sprite-file', 'pick-image-files', 'pick-image-folder', 'stage-image', 'export-map'] as const;
