import { ipcMain, dialog, BrowserWindow } from 'electron';
import path from 'path';

/** Tileset channels that need a native dialog. The pure ones live in projectApi.ts. */
export function registerTilesetHandlers(): void {
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
}
