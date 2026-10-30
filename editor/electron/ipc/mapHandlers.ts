import { ipcMain, dialog, BrowserWindow } from 'electron';
import { atomicWriteFileSync } from './atomicWrite.js';
import * as mapStore from './mapStore.js';
import { errorMessage, toResult } from './result.js';

export function registerMapHandlers(mapsDir: string): void {
  ipcMain.handle('get-maps', async () =>
    toResult(() => {
      const result = mapStore.listMaps(mapsDir);
      for (const w of result.warnings) console.warn(`[maps] ${w.file}: ${w.error}`);
      return result;
    })
  );

  ipcMain.handle(
    'create-map',
    async (_event, name: string, width: number, height: number, folderPath: string | null = null) =>
      toResult(() => mapStore.createMap(mapsDir, name, width, height, folderPath))
  );

  ipcMain.handle(
    'save-map',
    async (_event, folderPath: string | null, fileName: string, mapData: unknown) =>
      toResult(() => mapStore.saveMap(mapsDir, folderPath, fileName, mapData))
  );

  ipcMain.handle('delete-map', async (_event, folderPath: string | null, fileName: string) =>
    toResult(() => mapStore.deleteMap(mapsDir, folderPath, fileName))
  );

  ipcMain.handle(
    'create-map-folder',
    async (_event, parentPath: string | null, folderName: string) =>
      toResult(() => mapStore.createMapFolder(mapsDir, parentPath, folderName))
  );

  ipcMain.handle('delete-map-folder', async (_event, folderPath: string) =>
    toResult(() => mapStore.deleteMapFolder(mapsDir, folderPath))
  );

  ipcMain.handle(
    'rename-map-folder',
    async (_event, oldFolderPath: string, newFolderName: string) =>
      toResult(() => mapStore.renameMapFolder(mapsDir, oldFolderPath, newFolderName))
  );

  ipcMain.handle(
    'rename-map',
    async (_event, folderPath: string | null, fileName: string, newName: string) =>
      toResult(() => mapStore.renameMap(mapsDir, folderPath, fileName, newName))
  );

  ipcMain.handle(
    'move-map',
    async (_event, fileName: string, oldFolder: string | null, newFolder: string | null) =>
      toResult(() => mapStore.moveMap(mapsDir, fileName, oldFolder, newFolder))
  );

  ipcMain.handle('export-map', async (event, jsonData: string, defaultName: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return { success: false, error: 'No window found' };
    if (typeof jsonData !== 'string') return { success: false, error: 'Export data must be a string' };

    try {
      const { canceled, filePath } = await dialog.showSaveDialog(window, {
        title: 'Export Map',
        defaultPath: typeof defaultName === 'string' ? defaultName : undefined,
        filters: [{ name: 'Tiled Map JSON', extensions: ['json', 'tmj'] }],
      });

      if (canceled || !filePath) {
        return { success: false, error: 'Canceled' };
      }

      atomicWriteFileSync(filePath, jsonData);
      return { success: true };
    } catch (error: unknown) {
      return { success: false, error: errorMessage(error) };
    }
  });
}
