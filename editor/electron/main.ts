import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

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
    const gitPath = path.join(__dirname, '../../.git');
    if (fs.existsSync(gitPath) && fs.statSync(gitPath).isFile()) {
      const gitContent = fs.readFileSync(gitPath, 'utf-8');
      const match = gitContent.match(/worktrees[/\\]([^/\r\n]+)/);
      if (match) return match[1];
    }
  } catch {}
  return 'main';
}

function createWindow() {
  const port = process.env.PORT || '5174';
  const worktree = getWorktreeName();
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: `Elementals Editor — [${worktree}] (Port: ${port})`,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (!app.isPackaged) {
    win.loadURL(`http://localhost:${port}`);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  ensureDirectories();
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

// Helper for recursive tileset reading
function getTilesetsRecursive(dirPath: string, relativePath: string = '') {
  const folders: string[] = [];
  const tilesets: any[] = [];
  
  if (!fs.existsSync(dirPath)) return { folders, tilesets };
  
  const items = fs.readdirSync(dirPath);
  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      const folderRelPath = relativePath ? path.join(relativePath, item) : item;
      folders.push(folderRelPath);
      const sub = getTilesetsRecursive(fullPath, folderRelPath);
      folders.push(...sub.folders);
      tilesets.push(...sub.tilesets);
    } else if (item.endsWith('.png')) {
      // Look for paired JSON
      const jsonPath = fullPath.replace(/\.png$/, '.json');
      let name = path.parse(item).name;
      if (fs.existsSync(jsonPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          if (meta.name) name = meta.name;
        } catch(e) {}
      }
      
      const data = fs.readFileSync(fullPath, 'base64');
      tilesets.push({
        name,
        fileName: item,
        folderPath: relativePath || null, // null means root
        dataUrl: `data:image/png;base64,${data}`
      });
    }
  }
  return { folders, tilesets };
}

// IPC Handlers
ipcMain.handle('get-tilesets', async () => {
  try {
    const result = getTilesetsRecursive(TILESETS_DIR);
    return { success: true, ...result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('pick-tileset-file', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return { success: false, error: 'No window found' };

  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: 'Select Tileset Image',
    filters: [{ name: 'Images', extensions: ['png'] }],
    properties: ['openFile']
  });

  if (canceled || filePaths.length === 0) {
    return { success: false, canceled: true };
  }

  const sourcePath = filePaths[0];
  const defaultName = path.parse(sourcePath).name;
  return { success: true, sourcePath, defaultName };
});

ipcMain.handle('import-tileset', async (event, sourcePath: string, name: string, folderPath: string | null = null) => {
  try {
    const fileName = path.basename(sourcePath);
    const targetDir = folderPath ? path.join(TILESETS_DIR, folderPath) : TILESETS_DIR;
    
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    let finalDest = path.join(targetDir, fileName);
    let counter = 1;
    while (fs.existsSync(finalDest)) {
      const parsed = path.parse(fileName);
      finalDest = path.join(targetDir, `${parsed.name}_${counter}${parsed.ext}`);
      counter++;
    }

    const finalFileName = path.basename(finalDest);
    fs.copyFileSync(sourcePath, finalDest);
    
    // Create JSON metadata
    const jsonPath = finalDest.replace(/\.png$/, '.json');
    const metadata = { name };
    fs.writeFileSync(jsonPath, JSON.stringify(metadata, null, 2));

    const data = fs.readFileSync(finalDest, 'base64');
    return { 
      success: true, 
      tileset: {
        name,
        fileName: finalFileName,
        folderPath,
        dataUrl: `data:image/png;base64,${data}`
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('create-folder', async (event, parentPath: string | null, folderName: string) => {
  try {
    const targetDir = parentPath ? path.join(TILESETS_DIR, parentPath, folderName) : path.join(TILESETS_DIR, folderName);
    
    if (fs.existsSync(targetDir)) {
      return { success: false, error: 'A folder with that name already exists' };
    }
    
    fs.mkdirSync(targetDir, { recursive: true });
    
    // Calculate relative path for frontend
    const relPath = path.relative(TILESETS_DIR, targetDir);
    return { success: true, folderPath: relPath };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('rename-folder', async (event, oldFolderPath: string, newFolderName: string) => {
  try {
    const oldDir = path.join(TILESETS_DIR, oldFolderPath);
    const parentDir = path.dirname(oldDir);
    const newDir = path.join(parentDir, newFolderName);
    
    if (fs.existsSync(newDir)) {
      return { success: false, error: 'A folder with that name already exists' };
    }
    
    fs.renameSync(oldDir, newDir);
    return { success: true, newFolderPath: path.relative(TILESETS_DIR, newDir) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('rename-tileset', async (event, folderPath: string | null, fileName: string, newName: string) => {
  try {
    const targetDir = folderPath ? path.join(TILESETS_DIR, folderPath) : TILESETS_DIR;
    const jsonPath = path.join(targetDir, fileName.replace(/\.png$/, '.json'));
    
    let metadata = {};
    if (fs.existsSync(jsonPath)) {
      metadata = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    }
    
    metadata = { ...metadata, name: newName };
    fs.writeFileSync(jsonPath, JSON.stringify(metadata, null, 2));
    
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('move-tileset', async (event, fileName: string, oldFolder: string | null, newFolder: string | null) => {
  try {
    const oldDir = oldFolder ? path.join(TILESETS_DIR, oldFolder) : TILESETS_DIR;
    const newDir = newFolder ? path.join(TILESETS_DIR, newFolder) : TILESETS_DIR;
    
    const oldPng = path.join(oldDir, fileName);
    const newPng = path.join(newDir, fileName);
    
    const oldJson = path.join(oldDir, fileName.replace(/\.png$/, '.json'));
    const newJson = path.join(newDir, fileName.replace(/\.png$/, '.json'));
    
    if (fs.existsSync(oldPng)) fs.renameSync(oldPng, newPng);
    if (fs.existsSync(oldJson)) fs.renameSync(oldJson, newJson);
    
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-folder', async (event, folderPath: string) => {
  try {
    const targetPath = path.join(TILESETS_DIR, folderPath);
    if (fs.existsSync(targetPath)) {
      // Use rmdirSync which naturally fails if directory is not empty
      fs.rmdirSync(targetPath);
      return { success: true };
    }
    return { success: false, error: 'Folder does not exist.' };
  } catch (error: any) {
    if (error.code === 'ENOTEMPTY') {
      return { success: false, error: 'Cannot delete folder because it is not empty.' };
    }
    return { success: false, error: error.message };
  }
});

// Map Management Helpers
function getMapsRecursive(dirPath: string, relativePath: string = '') {
  const folders: string[] = [];
  const maps: any[] = [];
  
  if (!fs.existsSync(dirPath)) return { folders, maps };
  
  const items = fs.readdirSync(dirPath);
  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      const folderRelPath = relativePath ? path.join(relativePath, item) : item;
      folders.push(folderRelPath);
      const sub = getMapsRecursive(fullPath, folderRelPath);
      folders.push(...sub.folders);
      maps.push(...sub.maps);
    } else if (item.endsWith('.json')) {
      try {
        const raw = fs.readFileSync(fullPath, 'utf8');
        const data = JSON.parse(raw);
        // Migration: If it's the old default_map which was just { layers: [] }
        maps.push({
          fileName: item,
          folderPath: relativePath || null,
          name: data.name || path.parse(item).name,
          width: data.width || 50,
          height: data.height || 50,
          layers: data.layers || [],
        });
      } catch (e) {}
    }
  }
  return { folders, maps };
}

ipcMain.handle('get-maps', async () => {
  try {
    const result = getMapsRecursive(MAPS_DIR);
    return { success: true, ...result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('create-map', async (event, name: string, width: number, height: number, folderPath: string | null = null) => {
  try {
    const targetDir = folderPath ? path.join(MAPS_DIR, folderPath) : MAPS_DIR;
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const safeName = name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    let finalDest = path.join(targetDir, `${safeName}.json`);
    let counter = 1;
    while (fs.existsSync(finalDest)) {
      finalDest = path.join(targetDir, `${safeName}_${counter}.json`);
      counter++;
    }

    const defaultLayers = [
      {
        id: crypto.randomUUID(),
        name: 'decorations',
        type: 'tile',
        visible: true,
        locked: false,
        z: 20,
        data: {}
      },
      {
        id: crypto.randomUUID(),
        name: 'building',
        type: 'tile',
        visible: true,
        locked: false,
        z: 10,
        data: {}
      },
      {
        id: crypto.randomUUID(),
        name: 'ground',
        type: 'tile',
        visible: true,
        locked: false,
        z: 1,
        data: {}
      },
      {
        id: crypto.randomUUID(),
        name: 'collisions',
        type: 'collision',
        visible: true,
        locked: false,
        data: {}
      },
      {
        id: crypto.randomUUID(),
        name: 'terrain',
        type: 'terrain',
        visible: true,
        locked: false,
        data: {}
      },
      {
        id: crypto.randomUUID(),
        name: 'encounters',
        type: 'encounters',
        visible: true,
        locked: false,
        data: {}
      }
    ];
    const mapData = { name, width, height, layers: defaultLayers };
    fs.writeFileSync(finalDest, JSON.stringify(mapData, null, 2));

    return { 
      success: true, 
      map: {
        fileName: path.basename(finalDest),
        folderPath,
        name,
        width,
        height,
        layers: defaultLayers
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-map', async (event, folderPath: string | null, fileName: string, mapData: any) => {
  try {
    const targetDir = folderPath ? path.join(MAPS_DIR, folderPath) : MAPS_DIR;
    const finalDest = path.join(targetDir, fileName);
    fs.writeFileSync(finalDest, JSON.stringify(mapData, null, 2));
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-map', async (event, folderPath: string | null, fileName: string) => {
  try {
    const targetDir = folderPath ? path.join(MAPS_DIR, folderPath) : MAPS_DIR;
    const finalDest = path.join(targetDir, fileName);
    if (fs.existsSync(finalDest)) fs.unlinkSync(finalDest);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('create-map-folder', async (event, parentPath: string | null, folderName: string) => {
  try {
    const targetDir = parentPath ? path.join(MAPS_DIR, parentPath, folderName) : path.join(MAPS_DIR, folderName);
    if (fs.existsSync(targetDir)) return { success: false, error: 'A folder with that name already exists' };
    fs.mkdirSync(targetDir, { recursive: true });
    return { success: true, folderPath: path.relative(MAPS_DIR, targetDir) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-map-folder', async (event, folderPath: string) => {
  try {
    const targetPath = path.join(MAPS_DIR, folderPath);
    if (fs.existsSync(targetPath)) {
      fs.rmdirSync(targetPath);
      return { success: true };
    }
    return { success: false, error: 'Folder does not exist.' };
  } catch (error: any) {
    if (error.code === 'ENOTEMPTY') return { success: false, error: 'Cannot delete folder because it is not empty.' };
    return { success: false, error: error.message };
  }
});

ipcMain.handle('rename-map-folder', async (event, oldFolderPath: string, newFolderName: string) => {
  try {
    const oldDir = path.join(MAPS_DIR, oldFolderPath);
    const parentDir = path.dirname(oldDir);
    const newDir = path.join(parentDir, newFolderName);
    if (fs.existsSync(newDir)) return { success: false, error: 'A folder with that name already exists' };
    fs.renameSync(oldDir, newDir);
    return { success: true, newFolderPath: path.relative(MAPS_DIR, newDir) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('rename-map', async (event, folderPath: string | null, fileName: string, newName: string) => {
  try {
    const targetDir = folderPath ? path.join(MAPS_DIR, folderPath) : MAPS_DIR;
    const jsonPath = path.join(targetDir, fileName);
    if (fs.existsSync(jsonPath)) {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      data.name = newName;
      fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
    }
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('move-map', async (event, fileName: string, oldFolder: string | null, newFolder: string | null) => {
  try {
    const oldDir = oldFolder ? path.join(MAPS_DIR, oldFolder) : MAPS_DIR;
    const newDir = newFolder ? path.join(MAPS_DIR, newFolder) : MAPS_DIR;
    const oldJson = path.join(oldDir, fileName);
    const newJson = path.join(newDir, fileName);
    if (fs.existsSync(oldJson)) fs.renameSync(oldJson, newJson);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('export-map', async (event, jsonData: string, defaultName: string) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return { success: false, error: 'No window found' };

  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    title: 'Export Map',
    defaultPath: defaultName,
    filters: [{ name: 'Tiled Map JSON', extensions: ['json', 'tmj'] }]
  });

  if (canceled || !filePath) {
    return { success: false, error: 'Canceled' };
  }

  try {
    fs.writeFileSync(filePath, jsonData, 'utf8');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});
