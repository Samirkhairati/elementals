export type LayerType = 'tile' | 'collision' | 'terrain' | 'objects'

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

export interface MapData {
  name: string
  fileName: string
  folderPath: string | null
  width: number
  height: number
  layers: Layer[]
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
