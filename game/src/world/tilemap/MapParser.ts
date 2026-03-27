import type { TilemapData, LayerData, TilesetData } from "@/world/tilemap/interfaces";

export class MapParser {
  /**
   * Validates and normalizes raw JSON data loaded from a Tiled file
   * into our strictly typed TilemapData format.
   *
   * @param rawData The raw JSON object from Tiled
   * @returns A normalized TilemapData object
   */
  static parse(rawData: any): TilemapData {
    if (!rawData) {
      throw new Error("Cannot parse map: rawData is undefined or null.");
    }

    if (!rawData.layers || !rawData.tilesets) {
      throw new Error("Invalid map data: missing layers or tilesets.");
    }

    const layers: LayerData[] = rawData.layers.map((layer: any) => {
      return {
        id: layer.id,
        name: layer.name,
        type: layer.type,
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

    const tilesets: TilesetData[] = rawData.tilesets.map((ts: any) => {
      return {
        firstgid: ts.firstgid,
        name: ts.name,
        image: ts.image,
        imagewidth: ts.imagewidth,
        imageheight: ts.imageheight,
        tilewidth: ts.tilewidth ?? rawData.tilewidth,
        tileheight: ts.tileheight ?? rawData.tileheight,
        margin: ts.margin ?? 0,
        spacing: ts.spacing ?? 0,
        columns: ts.columns,
        tilecount: ts.tilecount,
      };
    });

    return {
      width: rawData.width,
      height: rawData.height,
      tileWidth: rawData.tilewidth,
      tileHeight: rawData.tileheight,
      layers,
      tilesets,
      version: rawData.version,
      tiledversion: rawData.tiledversion,
      orientation: rawData.orientation,
      renderorder: rawData.renderorder,
    };
  }
}
