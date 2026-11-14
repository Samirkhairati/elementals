// Type-only definitions shared by the map pipeline (editor export hook, CLI, tests).
// No runtime code lives here so it can be imported with `import type` everywhere.

import type { EngineEntity } from './engine/types.ts'
import type { CollisionShape, ShapePoint } from './collisionShapes.ts'
import type { LookSet } from './look/types.ts'
import type { CollisionTileGroup } from './collisionLayers.ts'
import type { SceneNode } from './sceneTree.ts'

/** `polygons` is the old shapes-only collision layer: loading or exporting a map turns it into a `collision` layer. */
export type EditorLayerType = 'tile' | 'collision' | 'terrain' | 'objects' | 'encounters' | 'image' | 'folder' | 'polygons'

export interface EditorTile {
  tilesetId: string
  x: number
  y: number
  /** Collision layers only: the tiles item (`tileGroups`) the cell belongs to; absent = the first one. */
  group?: string
}

/** A rectangle of a picture in its own pixels (whole numbers, inside the picture). */
export interface EditorImageCrop {
  x: number
  y: number
  w: number
  h: number
}

/**
 * One freely placed image of an `image` layer, drawn at a pixel position (its anchor: bottom-centre of the picture).
 * It is either a sprite asset (`assetId`) or a plain picture from the graphics library (`graphicId`), never both.
 */
export interface EditorImageItem {
  id: string
  /** Sprite (character) id, e.g. `objects/chest`. */
  assetId?: string
  /** Graphic id (a picture under project/graphics), e.g. `scenery/clouds.png`. */
  graphicId?: string
  /** Shown name in the editor's list (the picture's id when absent). */
  name?: string
  /**
   * Only part of the picture (`graphicId` items only). Several items can show different parts of one picture: they
   * all point at that one file, nothing is cut out or copied. Absent = the whole picture.
   */
  crop?: EditorImageCrop
  x: number
  y: number
  /** Draw order inside the layer (ties keep array order). */
  z?: number
  scale?: number
  flipX?: boolean
  flipY?: boolean
  opacity?: number
  /** The group of the layer's `groups` this item belongs to (editor view only, not exported). */
  groupId?: string
  /** Y-sorted among the characters (see shared/ySort.ts); absent = follow the group / layer / folder. */
  ySort?: boolean
  /** Colour grading, masks and shaders of this picture, per profile (docs/looks.md). */
  look?: LookSet
}

/** A named set of the pictures of one image layer: they are picked, duplicated and moved together (editor view only, not exported). */
export interface EditorImageGroup {
  id: string
  name: string
  /** Locked: clicking any member picks the whole group, until the group itself is the selected one. */
  locked?: boolean
  /** Y-sort for the pictures of the group that have no setting of their own; absent = follow the layer. */
  ySort?: boolean
}

export interface EditorLayer {
  id: string
  name: string
  type: EditorLayerType
  visible: boolean
  locked?: boolean
  z?: number
  data?: Record<number | string, EditorTile>
  /** `image` layers only. */
  images?: EditorImageItem[]
  /** `image` layers only: the groups the pictures can belong to (editor view only, not exported). */
  groups?: EditorImageGroup[]
  /** Tile and image layers only: the `folder` layer that holds this one in the layer list (editor view only, not exported). */
  folderId?: string
  /** `folder` layers only: the folder is shown closed in the list. */
  collapsed?: boolean
  /** Image layers and folders: y-sort the pictures (see shared/ySort.ts); absent = follow the folder, else off. */
  ySort?: boolean
  /** `collision` layers only: collision shapes in map pixels (see shared/collisionShapes.ts), one item each. */
  shapes?: CollisionShape[]
  /** Tile and image layers: colour grading, masks and shaders, per profile (docs/looks.md). */
  look?: LookSet
  /** `collision` layers only: the tiles items, in list order (see shared/collisionLayers.ts). */
  tileGroups?: CollisionTileGroup[]
}

export interface EditorEntity {
  id: string
  name: string
  x: number
  y: number
  visible?: boolean
  folder?: string | null
  components: Record<string, Record<string, unknown> | undefined>
}

/** The editor's own on-disk map format (project/maps/**.json). */
export interface EditorMap {
  name: string
  width: number
  height: number
  /** Real size in pixels when not a whole number of tiles (see mapSize.ts). */
  pixelWidth?: number
  pixelHeight?: number
  /** Per-map settings for the game. */
  settings?: { playerZ?: number }
  /** Colour grading, masks and shaders of the whole map (everything drawn, characters too), per profile. */
  look?: LookSet
  /**
   * Schema 6: the map's tree of nodes (the children of the map root, in draw order), see shared/sceneTree.ts. It replaces
   * `layers`, `entities`, `entityFolders` and `entitiesIndex`; `migrateMap` turns older maps into it.
   */
  nodes?: SceneNode[]
  /** Schema 5 and older (legacy input of `migrateToNodeTree`): the layers, top first, folders and picture groups among them. */
  layers?: EditorLayer[]
  /** Schema 5 and older (legacy input): all entities. */
  entities?: EditorEntity[]
  /** Schema 5 and older (legacy input): the entity folders. */
  entityFolders?: unknown[]
  /** Schema 5 and older (legacy input): how many layers are above the Entities row in the layer list (0 or missing = on top). */
  entitiesIndex?: number
  /** 6 = one tree of nodes (`nodes`); 2-5 = layers and entities; missing = legacy (1). `migrateMap` upgrades it. */
  schemaVersion?: number
  fileName?: string
  folderPath?: string | null
}

/** What the converter needs to know about a tileset image. width/height of 0 mean "could not be loaded". */
export interface TilesetInfo {
  /** Display name, written to the Tiled tileset `name`. */
  name: string
  /** File name (e.g. `grass.png`); this is what tiles reference as `tilesetId`. */
  fileName: string
  width: number
  height: number
}

export interface TiledProperty {
  name: string
  type: string
  value: unknown
}

export interface TiledTileset {
  columns: number
  firstgid: number
  image: string
  imageheight: number
  imagewidth: number
  margin: number
  name: string
  spacing: number
  tilecount: number
  tileheight: number
  tilewidth: number
}

export interface TiledObject {
  id: number
  name: string
  type: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  visible: boolean
  /** Closed collision shape: points relative to the object's x / y. */
  polygon?: ShapePoint[]
  /** Open collision line: points relative to the object's x / y. */
  polyline?: ShapePoint[]
  properties?: TiledProperty[]
}

export interface TiledLayer {
  /** Absent on object groups (image layers). */
  data?: number[]
  objects?: TiledObject[]
  height: number
  id: number
  name: string
  opacity: number
  type: 'tilelayer' | 'objectgroup'
  visible: boolean
  width: number
  x: number
  y: number
  properties?: TiledProperty[]
}

export interface TiledMap {
  /** Map properties: `pixelWidth` / `pixelHeight` (a map that is not whole tiles) and `playerZ` (map settings). */
  properties?: TiledProperty[]
  compressionlevel: number
  height: number
  infinite: boolean
  layers: TiledLayer[]
  nextlayerid: number
  nextobjectid: number
  orientation: string
  renderorder: string
  tiledversion: string
  tileheight: number
  tilesets: TiledTileset[]
  tilewidth: number
  type: string
  version: string
  width: number
  /** Always written by the exporter; entities are canonical (migrated) engine entities. */
  schemaVersion: number
  entities: EngineEntity[]
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}
