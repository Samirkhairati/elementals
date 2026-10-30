import { ipcMain, dialog, BrowserWindow } from 'electron';
import path from 'path';
import { toResult } from './result.js';
import { TilesetCache } from './tilesetCache.js';
import * as tilesetStore from './tilesetStore.js';

export function registerTilesetHandlers(tilesetsDir: string): void {
  const cache = new TilesetCache();

  ipcMain.handle('get-tilesets', async () =>
    toResult(() => {
      const result = tilesetStore.listTilesets(tilesetsDir, cache);
      for (const w of result.warnings) console.warn(`[tilesets] ${w.file}: ${w.error}`);
      return result;
    })
  );

  ipcMain.handle('pick-tileset-file', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return { success: false, error: 'No window found' };

    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      title: 'Select Tileset Image',
      filters: [{ name: 'Images', extensions: ['png'] }],
      properties: ['openFile'],
    });

    if (canceled || filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const sourcePath = filePaths[0];
    const defaultName = path.parse(sourcePath).name;
    return { success: true, sourcePath, defaultName };
  });

  ipcMain.handle(
    'import-tileset',
    async (_event, sourcePath: string, name: string, folderPath: string | null = null) =>
      toResult(() => tilesetStore.importTileset(tilesetsDir, cache, sourcePath, name, folderPath))
  );

  ipcMain.handle('create-folder', async (_event, parentPath: string | null, folderName: string) =>
    toResult(() => tilesetStore.createTilesetFolder(tilesetsDir, parentPath, folderName))
  );

  ipcMain.handle('rename-folder', async (_event, oldFolderPath: string, newFolderName: string) =>
    toResult(() => tilesetStore.renameTilesetFolder(tilesetsDir, cache, oldFolderPath, newFolderName))
  );

  ipcMain.handle(
    'rename-tileset',
    async (_event, folderPath: string | null, fileName: string, newName: string) =>
      toResult(() => tilesetStore.renameTileset(tilesetsDir, folderPath, fileName, newName))
  );

  ipcMain.handle(
    'move-tileset',
    async (_event, fileName: string, oldFolder: string | null, newFolder: string | null) =>
      toResult(() => tilesetStore.moveTileset(tilesetsDir, cache, fileName, oldFolder, newFolder))
  );

  ipcMain.handle('delete-folder', async (_event, folderPath: string) =>
    toResult(() => tilesetStore.deleteTilesetFolder(tilesetsDir, cache, folderPath))
  );
}
