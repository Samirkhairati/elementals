import type { ComponentSchema, ComponentType as EngineComponentType, FieldKind } from '../../../shared/engine/types'

export type LayerType = 'tile' | 'collision' | 'terrain' | 'objects' | 'encounters' | 'image'

/** A rectangle of a picture in its own pixels. */
export interface ImageCrop {
  x: number
  y: number
  w: number
  h: number
}

/**
 * One freely placed image of an `image` layer, drawn at a pixel position (its anchor: bottom-centre of the picture).
 * It is either a sprite asset (`assetId`) or a plain picture from the graphics library (`graphicId`), never both.
 */
export interface ImageItem {
  id: string
  /** Sprite (character) id, e.g. `objects/chest`. */
  assetId?: string
  /** Graphic id (a picture under project/graphics), e.g. `scenery/clouds.png`. */
  graphicId?: string
  /** Shown name in the list (the picture's id when absent). */
  name?: string
  /** Only this part of the picture (graphic items): the same file is shared, nothing is copied. Absent = whole picture. */
  crop?: ImageCrop
  x: number
  y: number
  /** Draw order inside the layer (ties keep array order). */
  z?: number
  scale?: number
  flipX?: boolean
  flipY?: boolean
  opacity?: number
}

export interface Layer {
  id: string
  name: string
  type: LayerType
  visible: boolean
  locked: boolean
  z?: number
  data?: Record<number, { tilesetId: string; x: number; y: number }>
  /** `image` layers only. */
  images?: ImageItem[]
}

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
// views over it so UI code keeps working with loose `Record<string, any>` props.
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
  defaultProps: Record<string, any>
  fields: ComponentFieldDef[]
  description: string
  /** lucide icon name (kebab-case), e.g. 'footprints' */
  icon: string
  accent: string
  category: ComponentSchema['category']
  required?: boolean
}

export interface EntityData {
  id: string
  name: string
  x: number
  y: number
  visible?: boolean
  folder?: string | null
  components: Partial<Record<ComponentType, Record<string, any>>>
}

export interface EntityFolder {
  id: string
  name: string
  expanded?: boolean
  visible?: boolean
}

export interface MapData {
  name: string
  fileName: string
  folderPath: string | null
  width: number
  height: number
  layers: Layer[]
  entities?: EntityData[]
  entityFolders?: EntityFolder[]
  /** Editor view only: how many layers are above the Entities row in the layer list (0 or missing = on top). */
  entitiesIndex?: number
  /** 2 = canonical engine components. Set when the map is loaded/migrated. */
  schemaVersion?: number
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
