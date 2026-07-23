"use strict";
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
    ping: () => ipcRenderer.invoke('ping'),
    getTilesets: () => ipcRenderer.invoke('get-tilesets'),
    pickTilesetFile: () => ipcRenderer.invoke('pick-tileset-file'),
    importTileset: (source, name, folder) => ipcRenderer.invoke('import-tileset', source, name, folder),
    createFolder: (parent, name) => ipcRenderer.invoke('create-folder', parent, name),
    renameFolder: (oldPath, newName) => ipcRenderer.invoke('rename-folder', oldPath, newName),
    renameTileset: (folder, file, newName) => ipcRenderer.invoke('rename-tileset', folder, file, newName),
    moveTileset: (file, oldFolder, newFolder) => ipcRenderer.invoke('move-tileset', file, oldFolder, newFolder),
    deleteFolder: (folderPath) => ipcRenderer.invoke('delete-folder', folderPath),
    getMaps: () => ipcRenderer.invoke('get-maps'),
    createMap: (name, width, height, folderPath) => ipcRenderer.invoke('create-map', name, width, height, folderPath),
    saveMap: (folderPath, fileName, mapData) => ipcRenderer.invoke('save-map', folderPath, fileName, mapData),
    deleteMap: (folderPath, fileName) => ipcRenderer.invoke('delete-map', folderPath, fileName),
    createMapFolder: (parentPath, folderName) => ipcRenderer.invoke('create-map-folder', parentPath, folderName),
    deleteMapFolder: (folderPath) => ipcRenderer.invoke('delete-map-folder', folderPath),
    renameMapFolder: (oldPath, newName) => ipcRenderer.invoke('rename-map-folder', oldPath, newName),
    renameMap: (folderPath, fileName, newName) => ipcRenderer.invoke('rename-map', folderPath, fileName, newName),
    moveMap: (fileName, oldFolder, newFolder) => ipcRenderer.invoke('move-map', fileName, oldFolder, newFolder)
});
