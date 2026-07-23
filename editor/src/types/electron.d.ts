interface TilesetData {
  name: string;
  fileName: string;
  folderPath: string | null;
  dataUrl: string;
}

interface ElectronAPI {
  ping: () => Promise<void>;
  getTilesets: () => Promise<{ success: boolean; folders?: string[]; tilesets?: TilesetData[]; error?: string }>;
  pickTilesetFile: () => Promise<{ success: boolean; canceled?: boolean; sourcePath?: string; defaultName?: string; error?: string }>;
  importTileset: (sourcePath: string, name: string, folderPath: string | null) => Promise<{ success: boolean; tileset?: TilesetData; error?: string }>;
  createFolder: (parentPath: string | null, folderName: string) => Promise<{ success: boolean; folderPath?: string; error?: string }>;
  renameFolder: (oldFolderPath: string, newFolderName: string) => Promise<{ success: boolean; newFolderPath?: string; error?: string }>;
  renameTileset: (folderPath: string | null, fileName: string, newName: string) => Promise<{ success: boolean; error?: string }>;
  moveTileset: (fileName: string, oldFolder: string | null, newFolder: string | null) => Promise<{ success: boolean; error?: string }>;
  deleteFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
  getMaps: () => Promise<{ success: boolean; folders?: string[]; maps?: any[]; error?: string }>;
  createMap: (name: string, width: number, height: number, folderPath: string | null) => Promise<{ success: boolean; map?: any; error?: string }>;
  saveMap: (folderPath: string | null, fileName: string, mapData: any) => Promise<{ success: boolean; error?: string }>;
  deleteMap: (folderPath: string | null, fileName: string) => Promise<{ success: boolean; error?: string }>;
  createMapFolder: (parentPath: string | null, folderName: string) => Promise<{ success: boolean; folderPath?: string; error?: string }>;
  deleteMapFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
  renameMapFolder: (oldPath: string, newName: string) => Promise<{ success: boolean; newFolderPath?: string; error?: string }>;
  renameMap: (folderPath: string | null, fileName: string, newName: string) => Promise<{ success: boolean; error?: string }>;
  moveMap: (fileName: string, oldFolder: string | null, newFolder: string | null) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
