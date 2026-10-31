import { ipcMain, dialog, BrowserWindow } from 'electron';
import { atomicWriteFileSync } from './atomicWrite.js';
import { errorMessage } from './result.js';

/** Map channels that need a native dialog. The pure ones live in projectApi.ts. */
export function registerMapHandlers(): void {
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
