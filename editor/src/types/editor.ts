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

export type ComponentType =
  | 'Transform'
  | 'SpriteView'
  | 'Collider'
  | 'GridMovement'
  | 'FreeMovement'
  | 'PlayerControl'
  | 'CharacterAnimation'
  | 'Interactable'
  | 'AIWander'
  | 'Tag'

export interface ComponentFieldDef {
  key: string
  label: string
  type: 'number' | 'string' | 'boolean' | 'select' | 'textarea'
  options?: { label: string; value: string }[]
  min?: number
  max?: number
  step?: number
  placeholder?: string
}

export interface ComponentSchemaEntry {
  label: string
  singleton?: boolean
  defaultProps: Record<string, any>
  fields: ComponentFieldDef[]
}

export interface EntityData {
  id: string
  name: string
  x: number
  y: number
  components: Partial<Record<ComponentType, Record<string, any>>>
}

export interface MapData {
  name: string
  fileName: string
  folderPath: string | null
  width: number
  height: number
  layers: Layer[]
  entities?: EntityData[]
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
