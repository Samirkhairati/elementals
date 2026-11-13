import type { TilemapData, LayerData, TilesetData } from "@/world/tilemap/interfaces";

/** The raw Tiled JSON as loaded: any field may be missing, so everything is checked or defaulted below. */
type RawLayer = Partial<LayerData>;
type RawTileset = Partial<TilesetData> & { tilewidth?: number; tileheight?: number };
export interface RawTiledMap {
  width?: number;
  height?: number;
  tilewidth?: number;
  tileheight?: number;
  layers?: RawLayer[];
  tilesets?: RawTileset[];
  version?: string;
  tiledversion?: string;
  orientation?: string;
  renderorder?: string;
}

export class MapParser {
  /**
   * Validates and normalizes raw JSON data loaded from a Tiled file
   * into our strictly typed TilemapData format.
   *
   * @param rawData The raw JSON object from Tiled
   * @returns A normalized TilemapData object
   */
  static parse(rawData: RawTiledMap | null | undefined): TilemapData {
    if (!rawData) {
      throw new Error("Cannot parse map: rawData is undefined or null.");
    }

    if (!rawData.layers || !rawData.tilesets) {
      throw new Error("Invalid map data: missing layers or tilesets.");
    }

    const layers: LayerData[] = rawData.layers.map((layer): LayerData => {
      return {
        id: layer.id as number,
        name: layer.name as string,
        type: layer.type as string,
        visible: layer.visible ?? true,
        opacity: layer.opacity ?? 1,
        x: layer.x ?? 0,
        y: layer.y ?? 0,
        width: layer.width,
        height: layer.height,
        data: layer.data,
        objects: layer.objects,
        properties: layer.properties,
      };
    });

    const tilesets: TilesetData[] = rawData.tilesets.map((ts): TilesetData => {
      return {
        firstgid: ts.firstgid as number,
        name: ts.name as string,
        image: ts.image as string,
        imagewidth: ts.imagewidth as number,
        imageheight: ts.imageheight as number,
        tilewidth: ts.tilewidth ?? (rawData.tilewidth as number),
        tileheight: ts.tileheight ?? (rawData.tileheight as number),
        margin: ts.margin ?? 0,
        spacing: ts.spacing ?? 0,
        columns: ts.columns as number,
        tilecount: ts.tilecount as number,
      };
    });

    return {
      width: rawData.width as number,
      height: rawData.height as number,
      tileWidth: rawData.tilewidth as number,
      tileHeight: rawData.tileheight as number,
      layers,
      tilesets,
      version: rawData.version,
      tiledversion: rawData.tiledversion,
      orientation: rawData.orientation,
      renderorder: rawData.renderorder,
    };
  }
}
