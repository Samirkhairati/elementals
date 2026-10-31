import { app, BrowserWindow, powerSaveBlocker } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { setupMenu } from './menu.js';
import { registerProjectHandlers } from './ipc/projectHandlers.js';
import { projectDirs } from './ipc/projectApi.js';
import { getWorktreeName } from './worktreeName.js';
import { isAllowedNavigation, parsePort } from './devServer.js';

// Dev-only workaround for editor freezes: prevent macOS App Nap & idle process suspension.
// Packaged builds should behave like a normal app and not keep the machine awake.
if (!app.isPackaged) {
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// dist-electron/ lives in editor/, which lives in the repo root
const REPO_ROOT = path.resolve(__dirname, '../..');
// The project directory is located beside the 'editor' folder. ELEMENTALS_PROJECT_DIR points the
// editor at another copy of it (QA, experiments) without touching the real authored data.
const PROJECT_DIR = process.env.ELEMENTALS_PROJECT_DIR
  ? path.resolve(process.env.ELEMENTALS_PROJECT_DIR)
  : path.join(REPO_ROOT, 'project');
const { mapsDir: MAPS_DIR, tilesetsDir: TILESETS_DIR, spritesDir: SPRITES_DIR } = projectDirs(PROJECT_DIR);
const DIST_DIR = path.join(__dirname, '../dist');

function ensureDirectories(): void {
  // recursive mkdir is a no-op for existing directories and also creates PROJECT_DIR
  fs.mkdirSync(MAPS_DIR, { recursive: true });
  fs.mkdirSync(TILESETS_DIR, { recursive: true });
  fs.mkdirSync(SPRITES_DIR, { recursive: true });
}

function createWindow(): void {
  const port = parsePort(process.env.PORT);
  const worktree = getWorktreeName(REPO_ROOT);
  const title = `Elementals Editor — [${worktree}] (Port: ${port})`;
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: title,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Must stay true: the preload is a CommonJS script (`require('electron')`) inside a
      // "type": "module" package. Only the sandboxed preload loader runs it as CJS; with
      // sandbox:false Electron treats preload.js as ESM, `require` is undefined and
      // window.electronAPI is never exposed.
      sandbox: true,
      // Part of the dev-only freeze workaround above.
      backgroundThrottling: app.isPackaged,
    },
  });

  win.on('page-title-updated', (e) => {
    e.preventDefault();
  });

  win.setTitle(title);
  setupMenu(win);

  const policy = { isPackaged: app.isPackaged, port, distDir: DIST_DIR };
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, policy)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (!app.isPackaged) {
    win.loadURL(`http://localhost:${port}`);
  } else {
    win.loadFile(path.join(DIST_DIR, 'index.html'));
  }
}

app.whenReady().then(() => {
  if (!app.isPackaged) {
    const blockerId = powerSaveBlocker.start('prevent-app-suspension');
    app.on('will-quit', () => {
      if (powerSaveBlocker.isStarted(blockerId)) powerSaveBlocker.stop(blockerId);
    });
  }
  ensureDirectories();
  registerProjectHandlers(PROJECT_DIR);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // In dev the runner (scripts/dev.mjs) treats Electron exiting as "stop everything",
  // so quit on macOS too; packaged builds keep the usual macOS behaviour.
  if (process.platform !== 'darwin' || !app.isPackaged) {
    app.quit();
  }
});
