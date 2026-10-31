import type { GameDatabase, SpriteAssetInfo, SpriteAssetMeta, SpriteKind } from '../../../shared/engine/types';

/** Result of every project-data call: `success: false` carries a readable `error`. */
type IpcFailure = { success: false; error: string; canceled?: boolean };

interface ImportSpriteOptions {
  /** Explicit asset id (directory path under project/sprites); wins over `name`. */
  id?: string;
  /** Display name; the id is derived from it (`characters/<slug>` / `objects/<slug>`) when no id is given. */
  name?: string;
  kind: SpriteKind;
  /** Default: the whole image (object/animated) or a quarter of it (character, 4 x 4 grid). */
  frameWidth?: number;
  frameHeight?: number;
}

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
  importTileset: (sourcePath: string, name: string, folderPath: string | null) => Promise<{ success: boolean; tileset?: TilesetData; error?: string }>;
  createFolder: (parentPath: string | null, folderName: string) => Promise<{ success: boolean; folderPath?: string; error?: string }>;
  renameFolder: (oldFolderPath: string, newFolderName: string) => Promise<{ success: boolean; newFolderPath?: string; error?: string }>;
  renameTileset: (folderPath: string | null, fileName: string, newName: string) => Promise<{ success: boolean; error?: string }>;
  moveTileset: (fileName: string, oldFolder: string | null, newFolder: string | null) => Promise<{ success: boolean; error?: string }>;
  deleteFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
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
  /** Absolute path of a dropped file. The browser harness stages the bytes and returns the staged path. */
  getPathForFile: (file: File) => string | Promise<string>;
  getSprites: () => Promise<({ success: true; assets: SpriteAssetInfo[]; folders: string[]; warnings: { file: string; error: string }[] }) | IpcFailure>;
  pickSpriteFile: () => Promise<({ success: true; sourcePath: string; defaultName: string }) | IpcFailure>;
  importSprite: (sourcePath: string, options: ImportSpriteOptions) => Promise<({ success: true; asset: SpriteAssetInfo }) | IpcFailure>;
  saveSpriteMeta: (id: string, meta: SpriteAssetMeta) => Promise<({ success: true; meta: SpriteAssetMeta }) | IpcFailure>;
  renameSprite: (id: string, newId: string) => Promise<({ success: true; id: string }) | IpcFailure>;
  deleteSprite: (id: string) => Promise<({ success: true }) | IpcFailure>;
  createSpriteFolder: (parentId: string | null, name: string) => Promise<({ success: true; folderId: string }) | IpcFailure>;
  renameSpriteFolder: (folderId: string, newName: string) => Promise<({ success: true; folderId: string }) | IpcFailure>;
  moveSpriteFolder: (folderId: string, newParentId: string | null) => Promise<({ success: true; folderId: string }) | IpcFailure>;
  deleteSpriteFolder: (folderId: string) => Promise<({ success: true }) | IpcFailure>;
  getDatabase: () => Promise<({ success: true; database: GameDatabase }) | IpcFailure>;
  saveDatabase: (database: GameDatabase) => Promise<({ success: true; database: GameDatabase }) | IpcFailure>;
  onTogglePanel?: (callback: (panelId: string) => void) => () => void;
  onResetLayout?: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export type { ImportSpriteOptions };
