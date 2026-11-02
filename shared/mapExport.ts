// Single implementation of the editor-map -> Tiled-JSON conversion.
// Used by the editor's Export button (renderer) and by scripts/export-maps.mjs (Node).
// Pure TypeScript: no DOM, electron or node imports. Keep syntax type-strippable (no enums etc).

import type { EditorLayer, EditorMap, TilesetInfo, TiledLayer, TiledMap, TiledObject, TiledProperty, TiledTileset } from './mapTypes.ts'
import type { EngineEntity } from './engine/types.ts'
import { SCHEMA_VERSION } from './engine/types.ts'
import { migrateMap } from './engine/migrate.ts'

export const TILE_SIZE = 32
export const COLLISION_TILESET_ID = '__collision__'
export const COLLISION_DUMMY_IMAGE = 'collision_dummy.png'

/** Tileset file names referenced by non-collision layers, in first-use order. */
export function collectUsedTilesetIds(map: Pick<EditorMap, 'layers'>): string[] {
  const used = new Set<string>()
  for (const layer of map.layers || []) {
    if (layer.type === 'collision' || layer.type === 'image') continue
    for (const tile of Object.values(layer.data || {})) {
      used.add(tile.tilesetId)
    }
  }
  return [...used]
}

function tiledLayerType(layer: EditorLayer): TiledLayer['type'] {
  return layer.type === 'objects' || layer.type === 'image' ? 'objectgroup' : 'tilelayer'
}

/** The images of an image layer as Tiled objects (x/y = the sprite anchor); `nextId` hands out map-unique object ids. */
function imageObjects(layer: EditorLayer, nextId: () => number): TiledObject[] {
  const items = (layer.images || []).map((item, index) => ({ item, index }))
  // Draw order inside the layer: z first, array order for ties.
  items.sort((a, b) => (a.item.z ?? 0) - (b.item.z ?? 0) || a.index - b.index)
  return items.map(({ item }) => {
    const properties: TiledProperty[] = [item.graphicId ? { name: 'graphic', type: 'string', value: item.graphicId } : { name: 'sprite', type: 'string', value: item.assetId ?? '' }]
    if (item.graphicId && item.crop) {
      // One region of the picture's file; the game draws that sub-rectangle of the one texture.
      properties.push({ name: 'cropX', type: 'int', value: item.crop.x }, { name: 'cropY', type: 'int', value: item.crop.y })
      properties.push({ name: 'cropW', type: 'int', value: item.crop.w }, { name: 'cropH', type: 'int', value: item.crop.h })
    }
    if (item.z !== undefined) properties.push({ name: 'z', type: 'int', value: Math.round(item.z) })
    if (item.scale !== undefined && item.scale !== 1) properties.push({ name: 'scale', type: 'float', value: item.scale })
    if (item.flipX) properties.push({ name: 'flipX', type: 'bool', value: true })
    if (item.flipY) properties.push({ name: 'flipY', type: 'bool', value: true })
    if (item.opacity !== undefined && item.opacity !== 1) properties.push({ name: 'opacity', type: 'float', value: item.opacity })
    return {
      id: nextId(),
      name: item.name || item.graphicId || item.assetId || '',
      type: 'image',
      x: item.x,
      y: item.y,
      width: 0,
      height: 0,
      rotation: 0,
      visible: true,
      properties,
    }
  })
}

/**
 * Converts an editor map to a Tiled-format map object.
 * `tilesets` must contain size info for every tileset the map uses; tilesets that are unknown or
 * have a zero size are skipped (their tiles become empty), exactly like the historic export hook.
 * Run validateEditorMap first to turn those cases into explicit errors.
 */
export function convertEditorMapToTiled(map: EditorMap, tilesets: TilesetInfo[]): TiledMap {
  // Legacy entities (SpriteView, Interactable, ...) are converted so the game only ever sees the
  // canonical components; the exported map is always stamped with the schema version.
  const migrated = migrateMap(map).value
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

  let objectId = 1
  const nextObjectId = () => objectId++

  const exportLayers: TiledLayer[] = layers.map((layer, index) => {
    if (layer.type === 'image') {
      const imageLayer: TiledLayer = {
        id: index + 1,
        name: layer.name,
        objects: imageObjects(layer, nextObjectId),
        opacity: 1,
        type: 'objectgroup',
        visible: layer.visible,
        width: map.width,
        height: map.height,
        x: 0,
        y: 0,
        properties: [{ name: 'kind', type: 'string', value: 'image' }],
      }
      if (layer.z !== undefined) imageLayer.properties!.push({ name: 'z', type: 'int', value: Number(layer.z) })
      return imageLayer
    }

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
    nextobjectid: objectId,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.10.2',
    tileheight: TILE_SIZE,
    tilesets: exportTilesets,
    tilewidth: TILE_SIZE,
    type: 'map',
    version: '1.10',
    width: map.width,
    schemaVersion: typeof migrated.schemaVersion === 'number' ? migrated.schemaVersion : SCHEMA_VERSION,
    entities: (migrated.entities || []) as unknown as EngineEntity[],
  }
}

/** The one true serialization (2-space JSON, no trailing newline) used by the editor and the CLI. */
export function serializeTiledMap(tiled: TiledMap): string {
  return JSON.stringify(tiled, null, 2)
}
