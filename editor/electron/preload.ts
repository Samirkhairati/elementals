// The preload runs as CommonJS inside the sandboxed preload loader (see sandbox note in main.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
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

