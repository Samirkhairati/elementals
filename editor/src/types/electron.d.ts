import type { CommonEvent } from '../../../shared/engine/common';
import type { CharacterDef } from '../../../shared/engine/characters';
import type { CharacterInfo, GraphicInfo } from '../../../shared/engine/graphics';
import type { GameDatabase } from '../../../shared/engine/types';

/** Result of every project-data call: `success: false` carries a readable `error`. */
type IpcFailure = { success: false; error: string; canceled?: boolean };

interface TilesetData {
  name: string;
  fileName: string;
  folderPath: string | null;
  dataUrl: string;
}

interface ElectronAPI {
  ping: () => Promise<void>;
  getTilesets: () => Promise<{ success: boolean; folders?: string[]; tilesets?: TilesetData[]; warnings?: { file: string; error: string }[]; error?: string }>;
  pickTilesetFile: () => Promise<{ success: boolean; canceled?: boolean; sourcePath?: string; defaultName?: string; error?: string }>;
  importTileset: (sourcePath: string, name: string, folderPath: string | null, fileStem?: string) => Promise<{ success: boolean; tileset?: TilesetData; error?: string }>;
  createFolder: (parentPath: string | null, folderName: string) => Promise<{ success: boolean; folderPath?: string; error?: string }>;
  renameFolder: (oldFolderPath: string, newFolderName: string) => Promise<{ success: boolean; newFolderPath?: string; error?: string }>;
  renameTileset: (folderPath: string | null, fileName: string, newName: string) => Promise<{ success: boolean; error?: string }>;
  moveTileset: (fileName: string, oldFolder: string | null, newFolder: string | null) => Promise<{ success: boolean; error?: string }>;
  deleteFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
  renameTilesetFile: (folderPath: string | null, fileName: string, newStem: string) => Promise<{ success: boolean; fileName?: string; error?: string }>;
  deleteTileset: (folderPath: string | null, fileName: string) => Promise<{ success: boolean; error?: string }>;
  moveTilesetFolder: (folderPath: string, newParent: string | null) => Promise<{ success: boolean; newFolderPath?: string; error?: string }>;
  getMaps: () => Promise<{ success: boolean; folders?: string[]; maps?: any[]; warnings?: { file: string; error: string }[]; error?: string }>;
  createMap: (name: string, width: number, height: number, folderPath: string | null) => Promise<{ success: boolean; map?: any; error?: string }>;
  saveMap: (folderPath: string | null, fileName: string, mapData: any) => Promise<{ success: boolean; error?: string }>;
  deleteMap: (folderPath: string | null, fileName: string) => Promise<{ success: boolean; error?: string }>;
  createMapFolder: (parentPath: string | null, folderName: string) => Promise<{ success: boolean; folderPath?: string; error?: string }>;
  deleteMapFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
  renameMapFolder: (oldPath: string, newName: string) => Promise<{ success: boolean; newFolderPath?: string; error?: string }>;
  renameMap: (folderPath: string | null, fileName: string, newName: string) => Promise<{ success: boolean; error?: string }>;
  moveMap: (fileName: string, oldFolder: string | null, newFolder: string | null) => Promise<{ success: boolean; error?: string }>;
  exportMap: (jsonData: string, defaultName: string) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
  /** Writes the converted map straight into the game's maps folder (no dialog). `fileName` is the editor map file name. */
  exportMapToGame: (fileName: string, json: string) => Promise<({ success: true; id: string; filePath: string; changed: boolean; assets?: { written: number; skipped?: string } }) | IpcFailure>;
  /** Absolute path of a dropped file. The browser harness stages the bytes and returns the staged path. */
  getPathForFile: (file: File) => string | Promise<string>;
  getCharacters: () => Promise<({ success: true; characters: CharacterInfo[]; graphics: GraphicInfo[]; images: Record<string, string>; folders: string[]; graphicFolders: string[]; warnings: { file: string; error: string }[] }) | IpcFailure>;
  /** Native multi-select picker for PNGs; every file carries a data/blob URL to preview it by (empty when too big). */
  pickImageFiles: () => Promise<({ success: true; files: { sourcePath: string; defaultName: string; previewUrl: string }[] }) | IpcFailure>;
  pickSpriteFile: () => Promise<({ success: true; sourcePath: string; defaultName: string }) | IpcFailure>;
  saveCharacter: (id: string, def: CharacterDef) => Promise<({ success: true; character: CharacterInfo }) | IpcFailure>;
  renameCharacter: (id: string, newId: string) => Promise<({ success: true; id: string }) | IpcFailure>;
  deleteCharacter: (id: string) => Promise<({ success: true }) | IpcFailure>;
  importGraphic: (sourcePath: string, graphicId: string) => Promise<({ success: true; graphic: GraphicInfo; image: string }) | IpcFailure>;
  renameGraphic: (id: string, newId: string) => Promise<({ success: true; id: string }) | IpcFailure>;
  deleteGraphic: (id: string) => Promise<({ success: true }) | IpcFailure>;
  createGraphicFolder: (parentId: string | null, name: string) => Promise<({ success: true; folderId: string }) | IpcFailure>;
  renameGraphicFolder: (folderId: string, newName: string) => Promise<({ success: true; folderId: string }) | IpcFailure>;
  moveGraphicFolder: (folderId: string, newParentId: string | null) => Promise<({ success: true; folderId: string }) | IpcFailure>;
  deleteGraphicFolder: (folderId: string) => Promise<({ success: true }) | IpcFailure>;
  createCharacterFolder: (parentId: string | null, name: string) => Promise<({ success: true; folderId: string }) | IpcFailure>;
  renameCharacterFolder: (folderId: string, newName: string) => Promise<({ success: true; folderId: string }) | IpcFailure>;
  moveCharacterFolder: (folderId: string, newParentId: string | null) => Promise<({ success: true; folderId: string }) | IpcFailure>;
  deleteCharacterFolder: (folderId: string) => Promise<({ success: true }) | IpcFailure>;
  getDatabase: () => Promise<({ success: true; database: GameDatabase }) | IpcFailure>;
  saveDatabase: (database: GameDatabase) => Promise<({ success: true; database: GameDatabase }) | IpcFailure>;
  getGameSettings: () => Promise<({ success: true; settings: unknown | null }) | IpcFailure>;
  saveGameSettings: (settings: unknown) => Promise<({ success: true; settings: unknown; assets?: { written: number; skipped?: string } }) | IpcFailure>;
  getCommonEvents: () => Promise<({ success: true; events: CommonEvent[]; warnings: { file: string; error: string }[] }) | IpcFailure>;
  saveCommonEvent: (event: CommonEvent) => Promise<({ success: true; event: CommonEvent }) | IpcFailure>;
  deleteCommonEvent: (id: string) => Promise<({ success: true }) | IpcFailure>;
  onTogglePanel?: (callback: (panelId: string) => void) => () => void;
  onResetLayout?: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
