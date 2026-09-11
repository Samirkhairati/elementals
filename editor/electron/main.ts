import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { setupMenu } from './menu.js';
import { registerTilesetHandlers } from './ipc/tilesetHandlers.js';
import { registerMapHandlers } from './ipc/mapHandlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The project directory is located beside the 'editor' folder
const PROJECT_DIR = path.join(__dirname, '../../project');
const MAPS_DIR = path.join(PROJECT_DIR, 'maps');
const TILESETS_DIR = path.join(PROJECT_DIR, 'tilesets');

function ensureDirectories() {
  if (!fs.existsSync(PROJECT_DIR)) fs.mkdirSync(PROJECT_DIR, { recursive: true });
  if (!fs.existsSync(MAPS_DIR)) fs.mkdirSync(MAPS_DIR, { recursive: true });
  if (!fs.existsSync(TILESETS_DIR)) fs.mkdirSync(TILESETS_DIR, { recursive: true });
}

function getWorktreeName(): string {
  if (process.env.WORKTREE_NAME) return process.env.WORKTREE_NAME;
  try {
    const rootDir = path.resolve(__dirname, '../..');
    const gitPath = path.join(rootDir, '.git');
    if (fs.existsSync(gitPath)) {
      if (fs.statSync(gitPath).isFile()) {
        const gitContent = fs.readFileSync(gitPath, 'utf-8');
        const gitDirMatch = gitContent.match(/gitdir:\s*(.+)/i);
        if (gitDirMatch) {
          const gitDir = gitDirMatch[1].trim();
          const headPath = path.join(gitDir, 'HEAD');
          if (fs.existsSync(headPath)) {
            const headContent = fs.readFileSync(headPath, 'utf-8').trim();
            const branchMatch = headContent.match(/ref:\s*refs\/heads\/(.+)/);
            if (branchMatch) return branchMatch[1];
          }
        }
        return path.basename(rootDir);
      }
    }
    return path.basename(rootDir);
  } catch {}
  return 'main';
}

function createWindow() {
  const port = process.env.PORT || '5174';
  const worktree = getWorktreeName();
  const title = `Elementals Editor — [${worktree}] (Port: ${port})`;
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: title,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.on('page-title-updated', (e) => {
    e.preventDefault();
  });

  win.setTitle(title);
  setupMenu(win);

  if (!app.isPackaged) {
    win.loadURL(`http://localhost:${port}`);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  ensureDirectories();
  registerTilesetHandlers(TILESETS_DIR);
  registerMapHandlers(MAPS_DIR);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
