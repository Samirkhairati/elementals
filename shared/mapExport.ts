// Single implementation of the editor-map -> Tiled-JSON conversion.
// Used by the editor's Export button (renderer) and by scripts/export-maps.mjs (Node).
// Pure TypeScript: no DOM, electron or node imports. Keep syntax type-strippable (no enums etc).

import type { EditorMap, TilesetInfo, TiledLayer, TiledMap, TiledObject, TiledProperty, TiledTileset } from './mapTypes.ts'
import type { EngineEntity } from './engine/types.ts'
import { SCHEMA_VERSION } from './engine/types.ts'
import { migrateMap } from './engine/migrate.ts'
import { mapPixelSize } from './mapSize.ts'
import { isUsableShape } from './collisionShapes.ts'
import { cleanLookSet } from './look/schema.ts'
import type { LookSet } from './look/types.ts'
import type { CollisionLayerNode, EntityNode, ImageLayerNode, LayerNode, PictureNode, SceneNode } from './sceneTree.ts'
import { allEntities, collisionShapeNodes, effectiveOpacity, effectiveYSort, isCellLayer, isLayerNode, isVisible, walk, walkPanel } from './sceneTree.ts'
import { nodesOfMap } from './sceneTreeMigrate.ts'

export const TILE_SIZE = 32
export const COLLISION_TILESET_ID = '__collision__'
export const COLLISION_DUMMY_IMAGE = 'collision_dummy.png'

/** A look as a Tiled property (`look`, a JSON string), cleaned; nothing when there is none. */
export function lookProperty(look: LookSet | undefined): TiledProperty[] {
  const clean = cleanLookSet(look)
  return clean ? [{ name: 'look', type: 'string', value: JSON.stringify(clean) }] : []
}

/**
 * Tileset file names referenced by the layers that hold painted tiles (not collision or image layers), in first-use
 * order (the layer list, top first). Takes a map of any schema.
 */
export function collectUsedTilesetIds(map: Pick<EditorMap, 'layers' | 'nodes'>): string[] {
  const used = new Set<string>()
  for (const { node } of walkPanel(nodesOfMap(map))) {
    if (!isCellLayer(node)) continue
    for (const tile of Object.values(node.data || {})) {
      used.add(tile.tilesetId)
    }
  }
  return [...used]
}

function tiledLayerType(layer: LayerNode): TiledLayer['type'] {
  return layer.type === 'objects' || layer.type === 'image' ? 'objectgroup' : 'tilelayer'
}

/** A collision layer's usable shapes as Tiled objects: x / y = the first point, `polygon` (closed) or `polyline` (open) relative to it. */
function shapeObjects(layer: CollisionLayerNode, nextId: () => number): TiledObject[] {
  return collisionShapeNodes(layer).filter(isUsableShape).map((shape) => {
    const [first] = shape.points
    const rel = shape.points.map((p) => ({ x: p.x - first.x, y: p.y - first.y }))
    return {
      id: nextId(),
      name: '',
      type: '',
      x: first.x,
      y: first.y,
      width: 0,
      height: 0,
      rotation: 0,
      visible: true,
      ...(shape.closed ? { polygon: rel } : { polyline: rel }),
    }
  })
}

/**
 * The pictures of an image layer as Tiled objects (x/y = the sprite anchor); `nextId` hands out map-unique object ids.
 * Groups are editor-only, so what they pass down (y-sort) is resolved here, one flag per picture.
 */
function imageObjects(layer: ImageLayerNode, above: readonly SceneNode[], nextId: () => number): TiledObject[] {
  const path = [...above, layer]
  const items = walk(layer.children, path)
    .filter((e): e is typeof e & { node: PictureNode } => e.node.type === 'picture')
    .map((e, index) => ({ item: e.node, ancestors: e.ancestors, index }))
  // Draw order inside the layer: z first, tree order for ties.
  items.sort((a, b) => (a.item.z ?? 0) - (b.item.z ?? 0) || a.index - b.index)
  return items.map(({ item, ancestors }) => {
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
    const opacity = effectiveOpacity(item, ancestors)
    if (opacity !== 1) properties.push({ name: 'opacity', type: 'float', value: opacity })
    if (effectiveYSort(item, ancestors)) properties.push({ name: 'ySort', type: 'bool', value: true })
    properties.push(...lookProperty(item.look))
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
 * Converts an editor map (schema 6, or any older one: it is migrated first) to a Tiled-format map object.
 * The tree is walked in the order of the layer list (top first), each layer with what its ancestors pass down: a hidden
 * group hides the layers below it and y-sort is resolved per picture. The Tiled output is the same as before the tree.
 * `tilesets` must contain size info for every tileset the map uses; tilesets that are unknown or
 * have a zero size are skipped (their tiles become empty), exactly like the historic export hook.
 * Run validateEditorMap first to turn those cases into explicit errors.
 */
export function convertEditorMapToTiled(map: EditorMap, tilesets: TilesetInfo[]): TiledMap {
  // Legacy entities (SpriteView, Interactable, ...) are converted so the game only ever sees the
  // canonical components; the exported map is always stamped with the schema version.
  const migrated = migrateMap(map).value
  const nodes = migrated.nodes ?? []
  // Groups only organise the editor's list; the game gets the layers themselves.
  const layers = walkPanel(nodes).filter((e): e is typeof e & { node: LayerNode } => isLayerNode(e.node))
  const collisionLayers = layers.filter((e): e is typeof e & { node: CollisionLayerNode } => e.node.type === 'collision')
  // The game reads one tile layer named `collision`: the cells of every collision layer, written where the first
  // collision layer with painted cells is (with none painted, where the first one holding no shapes either is, as an
  // empty layer; a map with only shapes gets no collision tile layer).
  const tileCollisionLayer =
    collisionLayers.find((e) => Object.keys(e.node.data || {}).length > 0)?.node ?? collisionLayers.find((e) => collisionShapeNodes(e.node).length === 0)?.node
  const hasCollisionLayer = tileCollisionLayer !== undefined
  const collisionCells = new Set<number>()
  for (const e of collisionLayers) for (const key of Object.keys(e.node.data || {})) collisionCells.add(Number(key))

  const exportTilesets: TiledTileset[] = []
  let currentGid = 1
  for (const tsId of collectUsedTilesetIds(migrated)) {
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

  let layerId = 0
  const exportLayers: TiledLayer[] = layers.flatMap(({ node: layer, ancestors }): TiledLayer[] => {
    const visible = isVisible(layer, ancestors)
    if (layer.type === 'collision') {
      const out: TiledLayer[] = []
      if (layer === tileCollisionLayer) {
        const data: number[] = new Array(map.width * map.height).fill(0)
        for (const idx of collisionCells) if (idx >= 0 && idx < data.length) data[idx] = collisionGid
        out.push({
          data,
          height: map.height,
          id: ++layerId,
          name: 'collision',
          opacity: 1,
          type: 'tilelayer',
          visible,
          width: map.width,
          x: 0,
          y: 0,
          ...(layer.z !== undefined ? { properties: [{ name: 'z', type: 'int', value: Number(layer.z) }] } : {}),
        })
      }
      if (collisionShapeNodes(layer).length > 0) {
        // Collision data: the game blocks movement with these whether the layer is shown in the editor or not.
        out.push({
          id: ++layerId,
          name: layer.name,
          objects: shapeObjects(layer, nextObjectId),
          opacity: 1,
          type: 'objectgroup',
          visible,
          width: map.width,
          height: map.height,
          x: 0,
          y: 0,
          properties: [{ name: 'kind', type: 'string', value: 'collision' }],
        })
      }
      return out
    }
    if (layer.type === 'image') {
      const imageLayer: TiledLayer = {
        id: ++layerId,
        name: layer.name,
        objects: imageObjects(layer, ancestors, nextObjectId),
        opacity: 1,
        type: 'objectgroup',
        visible,
        width: map.width,
        height: map.height,
        x: 0,
        y: 0,
        properties: [{ name: 'kind', type: 'string', value: 'image' }],
      }
      if (layer.z !== undefined) imageLayer.properties!.push({ name: 'z', type: 'int', value: Number(layer.z) })
      imageLayer.properties!.push(...lookProperty(layer.look))
      return [imageLayer]
    }

    const data: number[] = new Array(map.width * map.height).fill(0)

    for (const [indexStr, tile] of Object.entries(layer.data || {})) {
      const idx = parseInt(indexStr)
      const tsExport = exportTilesets.find(
        (t) => t.name === tilesets.find((ts) => ts.fileName === tile.tilesetId)?.name
      )
      if (tsExport) {
        data[idx] = tsExport.firstgid + (tile.y * tsExport.columns + tile.x)
      }
    }

    const exportLayer: TiledLayer = {
      data,
      height: map.height,
      id: ++layerId,
      name: layer.name,
      opacity: 1,
      type: tiledLayerType(layer),
      visible,
      width: map.width,
      x: 0,
      y: 0,
    }

    const props: TiledProperty[] = []
    if (layer.z !== undefined) {
      props.push({ name: 'z', type: 'int', value: Number(layer.z) })
    }
    if (layer.type === 'tile') props.push(...lookProperty(layer.look))
    if (props.length > 0) {
      exportLayer.properties = props
    }
    return [exportLayer]
  })

  // The real size of a map that is not a whole number of tiles, and the map settings the game reads.
  const mapProps: TiledProperty[] = []
  const px = mapPixelSize(map)
  if (px.width !== map.width * TILE_SIZE || px.height !== map.height * TILE_SIZE) {
    mapProps.push({ name: 'pixelWidth', type: 'int', value: px.width }, { name: 'pixelHeight', type: 'int', value: px.height })
  }
  const playerZ = map.settings?.playerZ
  if (typeof playerZ === 'number' && Number.isFinite(playerZ)) mapProps.push({ name: 'playerZ', type: 'int', value: Math.round(playerZ) })
  mapProps.push(...lookProperty(map.look))

  return {
    ...(mapProps.length > 0 ? { properties: mapProps } : {}),
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
    entities: allEntities(nodes).map(exportEntity),
  }
}

/** An entity node as the game's entity: the node-only fields (`type`, `locked`) are left out. */
function exportEntity(node: EntityNode): EngineEntity {
  const { type: _type, locked: _locked, ...entity } = node
  return entity as unknown as EngineEntity
}

/** The one true serialization (2-space JSON, no trailing newline) used by the editor and the CLI. */
export function serializeTiledMap(tiled: TiledMap): string {
  return JSON.stringify(tiled, null, 2)
}
