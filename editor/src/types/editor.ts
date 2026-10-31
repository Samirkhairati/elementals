import type { ComponentSchema, ComponentType as EngineComponentType, FieldKind } from '../../../shared/engine/types'

export type LayerType = 'tile' | 'collision' | 'terrain' | 'objects' | 'encounters'

export interface Layer {
  id: string
  name: string
  type: LayerType
  visible: boolean
  locked: boolean
  z?: number
  data?: Record<number, { tilesetId: string; x: number; y: number }>
}

export interface CopiedTile {
  tilesetId: string
  x: number
  y: number
}

export interface TileSelection {
  width: number
  height: number
  tiles: (CopiedTile | null)[]
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
  /** 2 = canonical engine components. Set when the map is loaded/migrated. */
  schemaVersion?: number
}

export interface TilesetData {
  name: string
  fileName: string
  folderPath: string | null
  dataUrl: string
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
