import { ipcMain, dialog, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';

export function getTilesetsRecursive(dirPath: string, relativePath: string = '') {
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
      const jsonPath = fullPath.replace(/\.png$/, '.json');
      let name = path.parse(item).name;
      if (fs.existsSync(jsonPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          if (meta.name) name = meta.name;
        } catch (e) {}
      }

      const data = fs.readFileSync(fullPath, 'base64');
      tilesets.push({
        name,
        fileName: item,
        folderPath: relativePath || null,
        dataUrl: `data:image/png;base64,${data}`,
      });
    }
  }
  return { folders, tilesets };
}

export function registerTilesetHandlers(tilesetsDir: string) {
  ipcMain.handle('get-tilesets', async () => {
    try {
      const result = getTilesetsRecursive(tilesetsDir);
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
      properties: ['openFile'],
    });

    if (canceled || filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const sourcePath = filePaths[0];
    const defaultName = path.parse(sourcePath).name;
    return { success: true, sourcePath, defaultName };
  });

  ipcMain.handle(
    'import-tileset',
    async (event, sourcePath: string, name: string, folderPath: string | null = null) => {
      try {
        const fileName = path.basename(sourcePath);
        const targetDir = folderPath ? path.join(tilesetsDir, folderPath) : tilesetsDir;

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
            dataUrl: `data:image/png;base64,${data}`,
          },
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  ipcMain.handle('create-folder', async (event, parentPath: string | null, folderName: string) => {
    try {
      const targetDir = parentPath
        ? path.join(tilesetsDir, parentPath, folderName)
        : path.join(tilesetsDir, folderName);

      if (fs.existsSync(targetDir)) {
        return { success: false, error: 'A folder with that name already exists' };
      }

      fs.mkdirSync(targetDir, { recursive: true });
      const relPath = path.relative(tilesetsDir, targetDir);
      return { success: true, folderPath: relPath };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('rename-folder', async (event, oldFolderPath: string, newFolderName: string) => {
    try {
      const oldDir = path.join(tilesetsDir, oldFolderPath);
      const parentDir = path.dirname(oldDir);
      const newDir = path.join(parentDir, newFolderName);

      if (fs.existsSync(newDir)) {
        return { success: false, error: 'A folder with that name already exists' };
      }

      fs.renameSync(oldDir, newDir);
      return { success: true, newFolderPath: path.relative(tilesetsDir, newDir) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(
    'rename-tileset',
    async (event, folderPath: string | null, fileName: string, newName: string) => {
      try {
        const targetDir = folderPath ? path.join(tilesetsDir, folderPath) : tilesetsDir;
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
    }
  );

  ipcMain.handle(
    'move-tileset',
    async (event, fileName: string, oldFolder: string | null, newFolder: string | null) => {
      try {
        const oldDir = oldFolder ? path.join(tilesetsDir, oldFolder) : tilesetsDir;
        const newDir = newFolder ? path.join(tilesetsDir, newFolder) : tilesetsDir;

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
    }
  );

  ipcMain.handle('delete-folder', async (event, folderPath: string) => {
    try {
      const targetPath = path.join(tilesetsDir, folderPath);
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
        return { success: true };
      }
      return { success: false, error: 'Folder does not exist.' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
