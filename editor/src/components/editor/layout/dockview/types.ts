export type PanelId =
  | 'maps'
  | 'layers'
  | 'entities'
  | 'properties'
  | 'canvas'
  | 'tilesets'
  | 'preview'
  | 'activeSelection'
  | 'database'
  | 'sprites';

export interface PanelInfo {
  id: PanelId;
  title: string;
  column: 'left' | 'center' | 'right';
  shortcut?: string;
}

export const ALL_PANELS: PanelInfo[] = [
  { id: 'maps', title: 'Maps', column: 'left', shortcut: 'Alt+M' },
  { id: 'layers', title: 'Layers', column: 'left', shortcut: 'Alt+L' },
  { id: 'entities', title: 'Entities', column: 'left', shortcut: 'Alt+E' },
  { id: 'properties', title: 'Properties', column: 'left', shortcut: 'Alt+P' },
  { id: 'canvas', title: 'Canvas', column: 'center', shortcut: 'Alt+C' },
  { id: 'tilesets', title: 'Tileset Browser', column: 'right', shortcut: 'Alt+T' },
  { id: 'preview', title: 'Tileset Preview', column: 'right' },
  { id: 'activeSelection', title: 'Active Selection', column: 'right' },
  // Opened on demand (menu / shortcut), not part of the default layout.
  { id: 'database', title: 'Database', column: 'right', shortcut: 'Alt+D' },
  { id: 'sprites', title: 'Sprites', column: 'right', shortcut: 'Alt+S' },
];

/** Panels that exist in the default layout; the others are opened on demand. */
export const DEFAULT_PANEL_IDS: PanelId[] = ['maps', 'layers', 'entities', 'properties', 'canvas', 'tilesets', 'preview', 'activeSelection'];

export function getMapPanelId(folderPath: string | null, fileName: string): string {
  const folder = folderPath ? encodeURIComponent(folderPath) : '__root__';
  return `map:${folder}:${encodeURIComponent(fileName)}`;
}

export function isMapPanelId(id: string): boolean {
  return id.startsWith('map:');
}

export function parseMapPanelId(id: string): { folderPath: string | null; fileName: string } | null {
  if (!id.startsWith('map:')) return null;
  const rest = id.slice(4);
  const colonIndex = rest.indexOf(':');
  if (colonIndex === -1) return null;
  const folder = decodeURIComponent(rest.substring(0, colonIndex));
  const fileName = decodeURIComponent(rest.substring(colonIndex + 1));
  return {
    folderPath: folder === '__root__' ? null : folder,
    fileName,
  };
}

