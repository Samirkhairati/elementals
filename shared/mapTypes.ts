// Type-only definitions shared by the map pipeline (editor export hook, CLI, tests).
// No runtime code lives here so it can be imported with `import type` everywhere.

export type EditorLayerType = 'tile' | 'collision' | 'terrain' | 'objects' | 'encounters'

export interface EditorTile {
  tilesetId: string
  x: number
  y: number
}

export interface EditorLayer {
  id: string
  name: string
  type: EditorLayerType
  visible: boolean
  locked?: boolean
  z?: number
  data?: Record<number | string, EditorTile>
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
  layers: EditorLayer[]
  entities?: EditorEntity[]
  entityFolders?: unknown[]
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

export interface TiledLayer {
  data: number[]
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
  entities: EditorEntity[]
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}
