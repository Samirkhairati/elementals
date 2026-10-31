import { ipcMain, dialog, BrowserWindow } from 'electron';
import path from 'path';

/** Sprite channels that need a native dialog. The pure ones live in projectApi.ts. */
export function registerSpriteHandlers(): void {
  ipcMain.handle('pick-sprite-file', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return { success: false, error: 'No window found' };

    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      title: 'Select Sprite Sheet',
      filters: [{ name: 'Images', extensions: ['png'] }],
      properties: ['openFile'],
    });

    if (canceled || filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const sourcePath = filePaths[0];
    return { success: true, sourcePath, defaultName: path.parse(sourcePath).name };
  });
}
