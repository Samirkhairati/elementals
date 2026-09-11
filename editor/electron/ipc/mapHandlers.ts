import { ipcMain, dialog, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

export function getMapsRecursive(dirPath: string, relativePath: string = '') {
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

export function registerMapHandlers(mapsDir: string) {
  ipcMain.handle('get-maps', async () => {
    try {
      const result = getMapsRecursive(mapsDir);
      return { success: true, ...result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(
    'create-map',
    async (event, name: string, width: number, height: number, folderPath: string | null = null) => {
      try {
        const targetDir = folderPath ? path.join(mapsDir, folderPath) : mapsDir;
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
            data: {},
          },
          {
            id: crypto.randomUUID(),
            name: 'building',
            type: 'tile',
            visible: true,
            locked: false,
            z: 10,
            data: {},
          },
          {
            id: crypto.randomUUID(),
            name: 'ground',
            type: 'tile',
            visible: true,
            locked: false,
            z: 1,
            data: {},
          },
          {
            id: crypto.randomUUID(),
            name: 'collisions',
            type: 'collision',
            visible: true,
            locked: false,
            data: {},
          },
          {
            id: crypto.randomUUID(),
            name: 'terrain',
            type: 'terrain',
            visible: true,
            locked: false,
            data: {},
          },
          {
            id: crypto.randomUUID(),
            name: 'encounters',
            type: 'encounters',
            visible: true,
            locked: false,
            data: {},
          },
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
            layers: defaultLayers,
          },
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  ipcMain.handle(
    'save-map',
    async (event, folderPath: string | null, fileName: string, mapData: any) => {
      try {
        const targetDir = folderPath ? path.join(mapsDir, folderPath) : mapsDir;
        const finalDest = path.join(targetDir, fileName);
        fs.writeFileSync(finalDest, JSON.stringify(mapData, null, 2));
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  ipcMain.handle('delete-map', async (event, folderPath: string | null, fileName: string) => {
    try {
      const targetDir = folderPath ? path.join(mapsDir, folderPath) : mapsDir;
      const finalDest = path.join(targetDir, fileName);
      if (fs.existsSync(finalDest)) fs.unlinkSync(finalDest);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(
    'create-map-folder',
    async (event, parentPath: string | null, folderName: string) => {
      try {
        const targetDir = parentPath
          ? path.join(mapsDir, parentPath, folderName)
          : path.join(mapsDir, folderName);
        if (fs.existsSync(targetDir))
          return { success: false, error: 'A folder with that name already exists' };
        fs.mkdirSync(targetDir, { recursive: true });
        return { success: true, folderPath: path.relative(mapsDir, targetDir) };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  ipcMain.handle('delete-map-folder', async (event, folderPath: string) => {
    try {
      const targetPath = path.join(mapsDir, folderPath);
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
        return { success: true };
      }
      return { success: false, error: 'Folder does not exist.' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(
    'rename-map-folder',
    async (event, oldFolderPath: string, newFolderName: string) => {
      try {
        const oldDir = path.join(mapsDir, oldFolderPath);
        const parentDir = path.dirname(oldDir);
        const newDir = path.join(parentDir, newFolderName);
        if (fs.existsSync(newDir))
          return { success: false, error: 'A folder with that name already exists' };
        fs.renameSync(oldDir, newDir);
        return { success: true, newFolderPath: path.relative(mapsDir, newDir) };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  ipcMain.handle(
    'rename-map',
    async (event, folderPath: string | null, fileName: string, newName: string) => {
      try {
        const targetDir = folderPath ? path.join(mapsDir, folderPath) : mapsDir;
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
    }
  );

  ipcMain.handle(
    'move-map',
    async (event, fileName: string, oldFolder: string | null, newFolder: string | null) => {
      try {
        const oldDir = oldFolder ? path.join(mapsDir, oldFolder) : mapsDir;
        const newDir = newFolder ? path.join(mapsDir, newFolder) : mapsDir;
        const oldJson = path.join(oldDir, fileName);
        const newJson = path.join(newDir, fileName);
        if (fs.existsSync(oldJson)) fs.renameSync(oldJson, newJson);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  ipcMain.handle('export-map', async (event, jsonData: string, defaultName: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return { success: false, error: 'No window found' };

    const { canceled, filePath } = await dialog.showSaveDialog(window, {
      title: 'Export Map',
      defaultPath: defaultName,
      filters: [{ name: 'Tiled Map JSON', extensions: ['json', 'tmj'] }],
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
}
