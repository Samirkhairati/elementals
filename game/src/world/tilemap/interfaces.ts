export interface LayerProperty {
  name: string;
  type?: string;
  value: unknown;
}

export interface LayerData {
  id: number;
  name: string;
  type: string; // 'tilelayer' | 'objectgroup' | 'imagelayer'
  visible: boolean;
  opacity: number;
  x: number;
  y: number;
  width?: number; // Tilelayer only
  height?: number; // Tilelayer only
  data?: number[]; // Tilelayer only, 1D array of GIDs
  objects?: unknown[]; // Objectgroup only
  properties?: LayerProperty[]; // Custom properties
}

export interface TilesetData {
  firstgid: number;
  name: string;
  image: string;
  imagewidth: number;
  imageheight: number;
  tilewidth: number;
  tileheight: number;
  margin: number;
  spacing: number;
  columns: number;
  tilecount: number;
}

export interface TilemapData {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  layers: LayerData[];
  tilesets: TilesetData[];
  version?: string;
  tiledversion?: string;
  orientation?: string;
  renderorder?: string;
}
