import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
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

  // Several PNGs at once (the Database's "Import..."): each comes back with a data URL to preview it by.
  ipcMain.handle('pick-image-files', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return { success: false, error: 'No window found' };

    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      title: 'Select Images',
      filters: [{ name: 'Images', extensions: ['png'] }],
      properties: ['openFile', 'multiSelections'],
    });
    if (canceled || filePaths.length === 0) return { success: false, canceled: true };

    const files = filePaths.map((sourcePath) => ({
      sourcePath,
      defaultName: path.parse(sourcePath).name,
      previewUrl: previewOf(sourcePath),
    }));
    return { success: true, files };
  });
}

/** `data:` URL of a PNG for a preview; empty when it cannot be read or is huge. */
function previewOf(file: string): string {
  try {
    if (fs.statSync(file).size > 16 * 1024 * 1024) return '';
    return `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
  } catch {
    return '';
  }
}
