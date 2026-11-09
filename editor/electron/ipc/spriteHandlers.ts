import { app, ipcMain, dialog, BrowserWindow } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { scanImageFolder } from './imageFolder';

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
      filters: [{ name: 'Images', extensions: ['png', 'gif'] }],
      properties: ['openFile', 'multiSelections'],
    });
    if (canceled || filePaths.length === 0) return { success: false, canceled: true };

    const files = filePaths.map((sourcePath) => ({
      sourcePath,
      defaultName: path.parse(sourcePath).name,
      ext: path.extname(sourcePath).toLowerCase() === '.gif' ? ('gif' as const) : ('png' as const),
      previewUrl: previewOf(sourcePath),
    }));
    return { success: true, files };
  });

  // A whole folder: every PNG below it with its place in the folder, previews included while the total stays small.
  ipcMain.handle('pick-image-folder', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return { success: false, error: 'No window found' };

    const { canceled, filePaths } = await dialog.showOpenDialog(window, { title: 'Select a Folder of Images', properties: ['openDirectory'] });
    if (canceled || filePaths.length === 0) return { success: false, canceled: true };

    const scan = scanImageFolder(filePaths[0]);
    if (scan.files.length === 0) return { success: false, error: 'That folder has no PNG or GIF images in it.' };
    let budget = PREVIEW_BUDGET;
    const files = scan.files.map((f) => {
      const previewUrl = previewOf(f.sourcePath, budget);
      budget -= previewUrl.length;
      return { ...f, previewUrl };
    });
    return { success: true, files, skipped: scan.skipped, truncated: scan.truncated };
  });

  // A picture that only exists in memory (pasted from the clipboard): written to a temp file so the importers can copy it.
  ipcMain.handle('stage-image', (_event, name: unknown, bytes: unknown) => {
    try {
      if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw new Error('The picture is empty');
      const dir = path.join(app.getPath('temp'), 'elementals-paste', crypto.randomBytes(6).toString('hex'));
      fs.mkdirSync(dir, { recursive: true });
      const sourcePath = path.join(dir, stagedName(name));
      fs.writeFileSync(sourcePath, bytes);
      return { success: true, sourcePath };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
}

/** A safe `<stem>.png` (or `.gif`, when the page sent a GIF) for whatever name the page sent. */
export function stagedName(name: unknown): string {
  const stem = (typeof name === 'string' ? path.parse(name).name : '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  const ext = typeof name === 'string' && path.extname(name).toLowerCase() === '.gif' ? 'gif' : 'png';
  return `${stem || 'pasted'}.${ext}`;
}

/** What a folder import may spend on inline previews in all (the rest show a blank thumbnail). */
const PREVIEW_BUDGET = 48 * 1024 * 1024;

/** `data:` URL of a PNG for a preview; empty when it cannot be read, is huge or would not fit in `budget`. */
function previewOf(file: string, budget = Infinity): string {
  try {
    const size = fs.statSync(file).size;
    if (size > 16 * 1024 * 1024 || size * 1.4 > budget) return '';
    // a GIF previews as itself (it animates); the data URL's type has to match
    const mime = path.extname(file).toLowerCase() === '.gif' ? 'image/gif' : 'image/png';
    return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  } catch {
    return '';
  }
}
