import type { ComponentSchema, ComponentType as EngineComponentType, FieldKind } from '../../../shared/engine/types'
import type { LookSet } from '../../../shared/look/types'
import type { EditorImageCrop } from '../../../shared/mapTypes'
import type { EntityNode, LayerNode, PictureNode, SceneNode } from '../../../shared/sceneTree'
export type { CollisionShape, ShapePoint } from '../../../shared/collisionShapes'
export type { CollisionTileGroup } from '../../../shared/collisionLayers'
export type { EntityNode, GroupNode, LayerNode, PictureNode, SceneNode, SceneNodeType } from '../../../shared/sceneTree'

/** The kinds of layer a map can hold (a collision layer holds painted tiles and shapes; old `polygons` layers are migrated to it on load). */
export type LayerType = LayerNode['type']

/** A rectangle of a picture in its own pixels. */
export type ImageCrop = EditorImageCrop

/**
 * One freely placed picture of an `image` layer: a `picture` node of the scene tree (shared/sceneTree.ts). It is either a
 * sprite asset (`assetId`) or a plain picture from the graphics library (`graphicId`), never both.
 */
export type ImageItem = PictureNode

/** A layer node of the scene tree: tile, image, collision, terrain, encounters or objects. Groups are `GroupNode`s. */
export type Layer = LayerNode

export interface CopiedTile {
  tilesetId: string
  x: number
  y: number
}

/** The cells one source layer contributed to a multi-layer selection. */
export interface SelectionLayerPart {
  layerId: string
  layerType: LayerType
  name: string
  tiles: (CopiedTile | null)[]
}

export interface TileSelection {
  width: number
  height: number
  /** Flat cells; for a multi-layer selection this is the composite of all parts (topmost visible tile per cell). */
  tiles: (CopiedTile | null)[]
  /** Set when sampled with the selection pinned over several layers: one part per layer, topmost layer first. */
  layers?: SelectionLayerPart[]
}

// Component model comes from the shared engine (shared/engine); the editor-facing shapes below are thin
// views over it so UI code keeps working with loose `PropBag` props.
export type ComponentType = EngineComponentType

/** Form field as the (schema-driven) inspector renders it; derived from the shared `FieldDef`. */
export interface ComponentFieldDef {
  key: string
  label: string
  /** Shared `FieldKind`s are mapped onto the primitive editors: text -> string, facing -> select, ... */
  type: 'number' | 'string' | 'boolean' | 'select' | 'textarea'
  /** The original shared kind (sprite, color, facing ...) for editors that want to specialise. */
  kind: FieldKind
  options?: { label: string; value: string }[]
  min?: number
  max?: number
  step?: number
  placeholder?: string
  help?: string
  unit?: string
  visibleWhen?: { key: string; in: (string | number | boolean)[] }
}

export interface ComponentSchemaEntry {
  label: string
  singleton?: boolean
  defaultProps: PropBag
  fields: ComponentFieldDef[]
  description: string
  /** lucide icon name (kebab-case), e.g. 'footprints' */
  icon: string
  accent: string
  category: ComponentSchema['category']
  required?: boolean
}

/** An entity node with its components typed by the editor's component registry. */
export type EntityData = Omit<EntityNode, 'components'> & { components: Partial<Record<ComponentType, PropBag>> }

export interface MapData {
  name: string
  fileName: string
  folderPath: string | null
  /** Tiles (32 px) across: the grid tile layers paint on. */
  width: number
  height: number
  /** The map's real size in pixels when it is not a whole number of tiles (shared/mapSize.ts). */
  pixelWidth?: number
  pixelHeight?: number
  /** Map settings (right-click a map › Settings…). */
  settings?: MapSettings
  /** The whole map's look (colour grading, masks, shaders), per profile (docs/looks.md). */
  look?: LookSet
  /** The scene tree: the children of the map root, in draw order (the first one draws first). Schema 6. */
  nodes: SceneNode[]
  /** 6 = one tree of nodes. Set when the map is loaded/migrated. */
  schemaVersion?: number
}

/** Per-map settings, exported as map properties for the game. */
export interface MapSettings {
  /** Draw depth of the player (and of the y-sorted pictures, which sort among the characters). Default 20. */
  playerZ?: number
}

export interface TilesetData {
  name: string
  fileName: string
  folderPath: string | null
  dataUrl: string
  /** Pixel size from the PNG header; missing or 0 when unknown. */
  width?: number
  height?: number
}

export type ActiveTool = 'brush' | 'eraser' | 'rectangle' | 'bucket'
export type PaintMode = 'discontinuous' | 'continuous' | 'random'

export interface DebugInfo {
  action: string
  x?: number
  y?: number
  error?: string
  time: number
}

export interface Pos {
  x: number
  y: number
}

/** Loosely typed props of one component (editor forms work with schema-driven, untyped values). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PropBag = Record<string, any>
