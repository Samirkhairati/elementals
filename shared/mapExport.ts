// Single implementation of the editor-map -> Tiled-JSON conversion.
// Used by the editor's Export button (renderer) and by scripts/export-maps.mjs (Node).
// Pure TypeScript: no DOM, electron or node imports. Keep syntax type-strippable (no enums etc).

import type { EditorLayer, EditorMap, TilesetInfo, TiledLayer, TiledMap, TiledProperty, TiledTileset } from './mapTypes.ts'

export const TILE_SIZE = 32
export const COLLISION_TILESET_ID = '__collision__'
export const COLLISION_DUMMY_IMAGE = 'collision_dummy.png'

/** Tileset file names referenced by non-collision layers, in first-use order. */
export function collectUsedTilesetIds(map: Pick<EditorMap, 'layers'>): string[] {
  const used = new Set<string>()
  for (const layer of map.layers || []) {
    if (layer.type === 'collision') continue
    for (const tile of Object.values(layer.data || {})) {
      used.add(tile.tilesetId)
    }
  }
  return [...used]
}

function tiledLayerType(layer: EditorLayer): TiledLayer['type'] {
  return layer.type === 'objects' ? 'objectgroup' : 'tilelayer'
}

/**
 * Converts an editor map to a Tiled-format map object.
 * `tilesets` must contain size info for every tileset the map uses; tilesets that are unknown or
 * have a zero size are skipped (their tiles become empty), exactly like the historic export hook.
 * Run validateEditorMap first to turn those cases into explicit errors.
 */
export function convertEditorMapToTiled(map: EditorMap, tilesets: TilesetInfo[]): TiledMap {
  const layers = map.layers || []
  const hasCollisionLayer = layers.some((l) => l.type === 'collision')

  const exportTilesets: TiledTileset[] = []
  let currentGid = 1
  for (const tsId of collectUsedTilesetIds(map)) {
    const ts = tilesets.find((t) => t.fileName === tsId)
    if (!ts) continue
    if (!ts.width || !ts.height) continue

    const columns = Math.floor(ts.width / TILE_SIZE)
    const tilecount = columns * Math.floor(ts.height / TILE_SIZE)

    exportTilesets.push({
      columns,
      firstgid: currentGid,
      image: ts.fileName,
      imageheight: ts.height,
      imagewidth: ts.width,
      margin: 0,
      name: ts.name,
      spacing: 0,
      tilecount,
      tileheight: TILE_SIZE,
      tilewidth: TILE_SIZE,
    })
    currentGid += tilecount
  }

  let collisionGid = 0
  if (hasCollisionLayer) {
    collisionGid = currentGid
    exportTilesets.push({
      columns: 1,
      firstgid: collisionGid,
      image: COLLISION_DUMMY_IMAGE,
      imageheight: TILE_SIZE,
      imagewidth: TILE_SIZE,
      margin: 0,
      name: 'collision_dummy',
      spacing: 0,
      tilecount: 1,
      tileheight: TILE_SIZE,
      tilewidth: TILE_SIZE,
    })
    currentGid += 1
  }

  const exportLayers: TiledLayer[] = layers.map((layer, index) => {
    const data: number[] = new Array(map.width * map.height).fill(0)

    for (const [indexStr, tile] of Object.entries(layer.data || {})) {
      const idx = parseInt(indexStr)
      if (layer.type === 'collision') {
        data[idx] = collisionGid
      } else {
        const tsExport = exportTilesets.find(
          (t) => t.name === tilesets.find((ts) => ts.fileName === tile.tilesetId)?.name
        )
        if (tsExport) {
          data[idx] = tsExport.firstgid + (tile.y * tsExport.columns + tile.x)
        }
      }
    }

    const exportLayer: TiledLayer = {
      data,
      height: map.height,
      id: index + 1,
      name: layer.type === 'collision' ? 'collision' : layer.name,
      opacity: 1,
      type: tiledLayerType(layer),
      visible: layer.visible,
      width: map.width,
      x: 0,
      y: 0,
    }

    const props: TiledProperty[] = []
    if (layer.z !== undefined) {
      props.push({ name: 'z', type: 'int', value: Number(layer.z) })
    }
    if (props.length > 0) {
      exportLayer.properties = props
    }
    return exportLayer
  })

  return {
    compressionlevel: -1,
    height: map.height,
    infinite: false,
    layers: exportLayers,
    nextlayerid: exportLayers.length + 1,
    nextobjectid: 1,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.10.2',
    tileheight: TILE_SIZE,
    tilesets: exportTilesets,
    tilewidth: TILE_SIZE,
    type: 'map',
    version: '1.10',
    width: map.width,
    entities: map.entities || [],
  }
}

/** The one true serialization (2-space JSON, no trailing newline) used by the editor and the CLI. */
export function serializeTiledMap(tiled: TiledMap): string {
  return JSON.stringify(tiled, null, 2)
}
