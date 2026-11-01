// The preload runs as CommonJS inside the sandboxed preload loader (see sandbox note in main.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  // Absolute path of a file dropped onto the window (File.path no longer exists in sandboxed renderers).
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  getTilesets: () => ipcRenderer.invoke('get-tilesets'),
  pickTilesetFile: () => ipcRenderer.invoke('pick-tileset-file'),
  importTileset: (source: string, name: string, folder: string | null) => ipcRenderer.invoke('import-tileset', source, name, folder),
  createFolder: (parent: string | null, name: string) => ipcRenderer.invoke('create-folder', parent, name),
  renameFolder: (oldPath: string, newName: string) => ipcRenderer.invoke('rename-folder', oldPath, newName),
  renameTileset: (folder: string | null, file: string, newName: string) => ipcRenderer.invoke('rename-tileset', folder, file, newName),
  moveTileset: (file: string, oldFolder: string | null, newFolder: string | null) => ipcRenderer.invoke('move-tileset', file, oldFolder, newFolder),
  deleteFolder: (folderPath: string) => ipcRenderer.invoke('delete-folder', folderPath),
  getMaps: () => ipcRenderer.invoke('get-maps'),
  createMap: (name: string, width: number, height: number, folderPath: string | null) => ipcRenderer.invoke('create-map', name, width, height, folderPath),
  saveMap: (folderPath: string | null, fileName: string, mapData: unknown) => ipcRenderer.invoke('save-map', folderPath, fileName, mapData),
  deleteMap: (folderPath: string | null, fileName: string) => ipcRenderer.invoke('delete-map', folderPath, fileName),
  createMapFolder: (parentPath: string | null, folderName: string) => ipcRenderer.invoke('create-map-folder', parentPath, folderName),
  deleteMapFolder: (folderPath: string) => ipcRenderer.invoke('delete-map-folder', folderPath),
  renameMapFolder: (oldPath: string, newName: string) => ipcRenderer.invoke('rename-map-folder', oldPath, newName),
  renameMap: (folderPath: string | null, fileName: string, newName: string) => ipcRenderer.invoke('rename-map', folderPath, fileName, newName),
  moveMap: (fileName: string, oldFolder: string | null, newFolder: string | null) => ipcRenderer.invoke('move-map', fileName, oldFolder, newFolder),
  exportMap: (jsonData: string, defaultName: string) => ipcRenderer.invoke('export-map', jsonData, defaultName),
  getCharacters: () => ipcRenderer.invoke('get-characters'),
  pickSpriteFile: () => ipcRenderer.invoke('pick-sprite-file'),
  saveCharacter: (id: string, def: unknown) => ipcRenderer.invoke('save-character', id, def),
  renameCharacter: (id: string, newId: string) => ipcRenderer.invoke('rename-character', id, newId),
  deleteCharacter: (id: string) => ipcRenderer.invoke('delete-character', id),
  importGraphic: (sourcePath: string, graphicId: string) => ipcRenderer.invoke('import-graphic', sourcePath, graphicId),
  createCharacterFolder: (parentId: string | null, name: string) => ipcRenderer.invoke('create-character-folder', parentId, name),
  renameCharacterFolder: (folderId: string, newName: string) => ipcRenderer.invoke('rename-character-folder', folderId, newName),
  moveCharacterFolder: (folderId: string, newParentId: string | null) => ipcRenderer.invoke('move-character-folder', folderId, newParentId),
  deleteCharacterFolder: (folderId: string) => ipcRenderer.invoke('delete-character-folder', folderId),
  getDatabase: () => ipcRenderer.invoke('get-database'),
  saveDatabase: (database: unknown) => ipcRenderer.invoke('save-database', database),
  getCommonEvents: () => ipcRenderer.invoke('get-common-events'),
  saveCommonEvent: (event: unknown) => ipcRenderer.invoke('save-common-event', event),
  deleteCommonEvent: (id: string) => ipcRenderer.invoke('delete-common-event', id),
  onTogglePanel: (callback: (panelId: string) => void) => {
    const handler = (_event: unknown, panelId: string) => callback(panelId);
    ipcRenderer.on('dockview-toggle-panel', handler);
    return () => ipcRenderer.removeListener('dockview-toggle-panel', handler);
  },
  onResetLayout: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('dockview-reset-layout', handler);
    return () => ipcRenderer.removeListener('dockview-reset-layout', handler);
  }
});

