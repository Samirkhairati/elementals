// The Database page's data model: the table registry (the extensibility point, docs/database-and-characters-spec.md §7.2)
// and the pure helpers its tables use (graphic tree, usage, map summaries, counters). No React, no IPC.

import { characterGraphics, isValidGraphicId, validateCharacterSet, type CharacterInfo, type GraphicInfo } from '../../../shared/engine/graphics'
import { TILE_SIZE } from '../../../shared/engine/constants'
import type { Layer } from '@/types/editor'

export type TableGroup = 'visual' | 'design' | 'world' | 'text' | 'game'

export interface DatabaseTable {
  id: string
  label: string
  group: TableGroup
  /** Lucide icon name (the shell maps it to a component). */
  icon: string
  access: 'readonly' | 'editable'
  status: 'ready' | 'planned'
  /** Shown by the lock badge / planned badge. */
  info: string
}

export const GROUP_LABELS: Record<TableGroup, string> = { visual: 'Visual', design: 'Design', world: 'World', text: 'Text', game: 'Game' }

export const READONLY_INFO = 'Visual resources are shown exactly as stored. To use one, attach it to a character; to change it, edit the image file.'

/** Adding Pokémon or Items later = adding one entry here and one component in the shell's table map. */
export const DATABASE_TABLES: readonly DatabaseTable[] = [
  { id: 'graphics', label: 'Graphics', group: 'visual', icon: 'Image', access: 'readonly', status: 'ready', info: READONLY_INFO },
  { id: 'tilesets', label: 'Tilesets', group: 'visual', icon: 'Grid3x3', access: 'readonly', status: 'ready', info: READONLY_INFO },
  { id: 'characters', label: 'Characters', group: 'design', icon: 'PersonStanding', access: 'editable', status: 'ready', info: 'Anything drawn that can animate: a person, a flower, a chest, a door.' },
  { id: 'flags', label: 'Flags', group: 'design', icon: 'ToggleLeft', access: 'editable', status: 'ready', info: 'Switches, variables, stages and common events used by events.' },
  { id: 'maps', label: 'Maps', group: 'world', icon: 'Map', access: 'readonly', status: 'ready', info: 'A read-only overview. Open a map in the Map Editor to change it.' },
  { id: 'text', label: 'Dialogue & strings', group: 'text', icon: 'MessageSquareText', access: 'editable', status: 'planned', info: 'Planned.' },
  { id: 'pokemon', label: 'Pokémon', group: 'game', icon: 'Bug', access: 'editable', status: 'planned', info: 'Planned: a Pokémon will reference characters and graphics by id.' },
  { id: 'items', label: 'Items', group: 'game', icon: 'Package', access: 'editable', status: 'planned', info: 'Planned.' },
  { id: 'moves', label: 'Moves', group: 'game', icon: 'Zap', access: 'editable', status: 'planned', info: 'Planned.' },
]

export function getTable(id: string | undefined): DatabaseTable | undefined {
  return DATABASE_TABLES.find((t) => t.id === id)
}

// ── graphics ────────────────────────────────────────────────────────────────────────────────────

export interface GraphicTreeNode {
  kind: 'folder' | 'file'
  name: string
  /** Folder path or graphic id. */
  path: string
  children: GraphicTreeNode[]
  graphic?: GraphicInfo
}

/** Folder tree of the graphics matching `query` (id substring, case-insensitive); folders and files sorted, folders first. */
export function buildGraphicTree(graphics: readonly GraphicInfo[], query = ''): GraphicTreeNode {
  const q = query.trim().toLowerCase()
  const root: GraphicTreeNode = { kind: 'folder', name: '', path: '', children: [] }
  for (const g of graphics) {
    if (q && !g.id.toLowerCase().includes(q)) continue
    const parts = g.id.split('/')
    let node = root
    parts.slice(0, -1).forEach((name, i) => {
      const path = parts.slice(0, i + 1).join('/')
      let next = node.children.find((c) => c.kind === 'folder' && c.name === name)
      if (!next) {
        next = { kind: 'folder', name, path, children: [] }
        node.children.push(next)
      }
      node = next
    })
    node.children.push({ kind: 'file', name: parts[parts.length - 1], path: g.id, children: [], graphic: g })
  }
  const sort = (n: GraphicTreeNode) => {
    n.children.sort((a, b) => (a.kind !== b.kind ? (a.kind === 'folder' ? -1 : 1) : a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    n.children.forEach(sort)
  }
  sort(root)
  return root
}

export interface GraphicUse {
  characterId: string
  characterName: string
  sheet: string
}

/** Which characters use which graphic (and through which sheet). */
export function graphicUsage(characters: Record<string, CharacterInfo>): Record<string, GraphicUse[]> {
  const out: Record<string, GraphicUse[]> = {}
  for (const c of Object.values(characters)) {
    for (const [sheet, s] of Object.entries(c.def.sheets ?? {})) {
      ;(out[s.image] ??= []).push({ characterId: c.id, characterName: c.def.name, sheet })
    }
  }
  for (const list of Object.values(out)) list.sort((a, b) => (a.characterId < b.characterId ? -1 : 1))
  return out
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// ── tilesets and maps ───────────────────────────────────────────────────────────────────────────

export interface TilesetUse {
  mapFile: string
  mapName: string
  layers: string[]
}

export interface MapLike {
  fileName: string
  name: string
  width: number
  height: number
  layers: Layer[]
  entities?: { components?: Record<string, unknown> }[]
}

/** Maps (and layers) that paint with each tileset, keyed by tileset id (the tileset's file name as maps store it). */
export function tilesetUsage(maps: readonly MapLike[]): Record<string, TilesetUse[]> {
  const out: Record<string, TilesetUse[]> = {}
  for (const m of maps) {
    const byTileset = new Map<string, Set<string>>()
    for (const layer of m.layers ?? []) {
      for (const t of Object.values(layer.data ?? {})) {
        if (!byTileset.has(t.tilesetId)) byTileset.set(t.tilesetId, new Set())
        byTileset.get(t.tilesetId)?.add(layer.name)
      }
    }
    for (const [id, layers] of byTileset) (out[id] ??= []).push({ mapFile: m.fileName, mapName: m.name, layers: [...layers].sort() })
  }
  return out
}

/** Columns × rows and tile count of a tileset image at the project's tile size. */
export function tilesetGrid(width: number, height: number, tile = TILE_SIZE): { columns: number; rows: number; count: number } {
  const columns = Math.floor(width / tile)
  const rows = Math.floor(height / tile)
  return { columns, rows, count: columns * rows }
}

export interface MapSummary {
  fileName: string
  name: string
  width: number
  height: number
  layers: number
  entities: number
  tilesets: string[]
  characters: string[]
}

export function summarizeMap(map: MapLike): MapSummary {
  const tilesets = new Set<string>()
  for (const layer of map.layers ?? []) for (const t of Object.values(layer.data ?? {})) tilesets.add(t.tilesetId)
  const characters = new Set<string>()
  for (const e of map.entities ?? []) {
    const sprite = e.components?.Sprite as { asset?: unknown } | undefined
    if (sprite && typeof sprite.asset === 'string' && sprite.asset) characters.add(sprite.asset)
  }
  return {
    fileName: map.fileName,
    name: map.name,
    width: map.width,
    height: map.height,
    layers: (map.layers ?? []).length,
    entities: (map.entities ?? []).length,
    tilesets: [...tilesets].sort(),
    characters: [...characters].sort(),
  }
}

// ── counters ────────────────────────────────────────────────────────────────────────────────────

export interface IssueCounts {
  errors: number
  warnings: number
}

/** Red/amber counters of the Characters table (every character validated against the known graphics). */
export function characterCounts(characters: Record<string, CharacterInfo>, graphics: readonly GraphicInfo[]): Record<string, IssueCounts> {
  const sizes = Object.fromEntries(graphics.map((g) => [g.id, { width: g.width, height: g.height }]))
  const out: Record<string, IssueCounts> = {}
  for (const c of Object.values(characters)) out[c.id] = { errors: 0, warnings: 0 }
  for (const issue of validateCharacterSet(Object.values(characters).map((c) => ({ id: c.id, def: c.def })), sizes)) {
    const counts = out[issue.id]
    if (counts && issue.severity === 'error') counts.errors++
    else if (counts && issue.severity === 'warning') counts.warnings++
  }
  return out
}

/** Graphics no character uses (the Graphics table badges them "unused"). */
export function unusedGraphics(graphics: readonly GraphicInfo[], characters: Record<string, CharacterInfo>): string[] {
  const used = new Set(Object.values(characters).flatMap((c) => (c.def.sheets ? characterGraphics(c.def) : [])))
  return graphics.filter((g) => !used.has(g.id)).map((g) => g.id)
}

/** A graphic id to import under: `sprites/<characterId>/<file>` style default from a character id and a file name. */
export function defaultGraphicId(characterId: string, fileName: string): string | null {
  const stem = fileName.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'image'
  const id = `sprites/${characterId}/${stem}.png`
  return isValidGraphicId(id) ? id : null
}
