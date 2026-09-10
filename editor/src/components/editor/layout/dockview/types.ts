export type PanelId =
  | 'maps'
  | 'layers'
  | 'properties'
  | 'canvas'
  | 'tilesets'
  | 'preview'
  | 'activeSelection';

export interface PanelInfo {
  id: PanelId;
  title: string;
  column: 'left' | 'center' | 'right';
  shortcut?: string;
}

export const ALL_PANELS: PanelInfo[] = [
  { id: 'maps', title: 'Maps', column: 'left', shortcut: 'Alt+M' },
  { id: 'layers', title: 'Layers', column: 'left', shortcut: 'Alt+L' },
  { id: 'properties', title: 'Properties', column: 'left', shortcut: 'Alt+P' },
  { id: 'tilesets', title: 'Tileset Browser', column: 'right', shortcut: 'Alt+T' },
  { id: 'preview', title: 'Tileset Preview', column: 'right' },
  { id: 'activeSelection', title: 'Active Selection', column: 'right' },
];
