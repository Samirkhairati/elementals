// Hand-written validators for the editor map format and for the Tiled JSON the game consumes.
// Pure TypeScript, no dependencies. Both validators accept `unknown` and never throw.

import type { ValidationResult } from './mapTypes.ts'

/** Mirrors `LayerType` in editor/src/types/editor.ts (checked at compile time by the editor tests). */
export const LAYER_TYPES = ['tile', 'collision', 'terrain', 'objects', 'encounters'] as const

/** Mirrors `ComponentType` in editor/src/types/editor.ts (checked at compile time by the editor tests). */
export const COMPONENT_TYPES = [
  'Transform',
  'SpriteView',
  'Collider',
  'GridMovement',
  'FreeMovement',
  'PlayerControl',
  'CharacterAnimation',
  'Interactable',
  'AIWander',
  'Tag',
] as const

const COLLISION_TILESET_ID = '__collision__'
const TILED_LAYER_TYPES = ['tilelayer', 'objectgroup']

type Rec = Record<string, unknown>

function isRecord(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v)
}
function isPositiveInt(v: unknown): v is number {
  return isInt(v) && v > 0
}
function isNonNegInt(v: unknown): v is number {
  return isInt(v) && v >= 0
}
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function finish(errors: string[], warnings: string[]): ValidationResult {
  return { ok: errors.length === 0, errors, warnings }
}

/** Reports every non-finite number found anywhere inside `value`. */
function checkFinite(value: unknown, path: string, errors: string[], depth = 0): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) errors.push(`${path} is not a finite number`)
  } else if (depth < 8 && Array.isArray(value)) {
    value.forEach((v, i) => checkFinite(v, `${path}[${i}]`, errors, depth + 1))
  } else if (depth < 8 && isRecord(value)) {
    for (const [k, v] of Object.entries(value)) checkFinite(v, `${path}.${k}`, errors, depth + 1)
  }
}

export interface ValidateEditorMapOptions {
  /**
   * Tilesets that exist. When given, every tilesetId used by a tile must be one of their `fileName`s
   * (or `__collision__`), and tile coordinates are bounds-checked against the image size when known.
   */
  tilesets?: { fileName: string; name?: string; width?: number; height?: number }[]
}

export function validateEditorMap(data: unknown, options: ValidateEditorMapOptions = {}): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!isRecord(data)) return finish(['map is not an object'], warnings)

  if (typeof data.name !== 'string' || data.name.length === 0) errors.push('map.name must be a non-empty string')
  if (!isPositiveInt(data.width)) errors.push(`map.width must be a positive integer (got ${JSON.stringify(data.width)})`)
  if (!isPositiveInt(data.height)) errors.push(`map.height must be a positive integer (got ${JSON.stringify(data.height)})`)
  const cellCount = isPositiveInt(data.width) && isPositiveInt(data.height) ? data.width * data.height : null

  const tilesets = options.tilesets
  const tilesetByFile = new Map<string, { name?: string; width?: number; height?: number }>()
  if (tilesets) {
    for (const ts of tilesets) tilesetByFile.set(ts.fileName, ts)
  }

  // ── layers ──
  if (!Array.isArray(data.layers)) {
    errors.push('map.layers must be an array')
  } else {
    const seenIds = new Set<string>()
    const exportedNames = new Map<string, number>()
    const usedTilesetNames = new Map<string, string>() // tileset name -> first fileName using it

    data.layers.forEach((layer: unknown, li: number) => {
      const lp = `layers[${li}]`
      if (!isRecord(layer)) {
        errors.push(`${lp} is not an object`)
        return
      }
      const label = typeof layer.name === 'string' ? `${lp} ("${layer.name}")` : lp

      if (typeof layer.id !== 'string' || layer.id.length === 0) {
        errors.push(`${label}: id must be a non-empty string`)
      } else if (seenIds.has(layer.id)) {
        errors.push(`${label}: duplicate layer id "${layer.id}"`)
      } else {
        seenIds.add(layer.id)
      }
      if (typeof layer.name !== 'string') errors.push(`${label}: name must be a string`)
      if (!(LAYER_TYPES as readonly unknown[]).includes(layer.type)) {
        errors.push(`${label}: unknown layer type ${JSON.stringify(layer.type)} (expected one of ${LAYER_TYPES.join(', ')})`)
      }
      if (typeof layer.visible !== 'boolean') errors.push(`${label}: visible must be a boolean`)
      if (layer.locked !== undefined && typeof layer.locked !== 'boolean') errors.push(`${label}: locked must be a boolean`)
      if (layer.z !== undefined && !isFiniteNumber(layer.z)) errors.push(`${label}: z must be a finite number`)

      if (typeof layer.name === 'string') {
        const exported = layer.type === 'collision' ? 'collision' : layer.name
        exportedNames.set(exported, (exportedNames.get(exported) ?? 0) + 1)
      }

      if (layer.data === undefined) return
      if (!isRecord(layer.data)) {
        errors.push(`${label}: data must be an object keyed by tile index`)
        return
      }
      for (const [key, tile] of Object.entries(layer.data)) {
        const tp = `${label}: tile "${key}"`
        if (!/^(0|[1-9][0-9]*)$/.test(key)) {
          errors.push(`${tp}: key is not a non-negative integer`)
          continue
        }
        const idx = Number(key)
        if (cellCount !== null && idx >= cellCount) {
          errors.push(`${tp}: index out of range (map has ${cellCount} cells)`)
        }
        if (!isRecord(tile)) {
          errors.push(`${tp}: tile is not an object`)
          continue
        }
        if (typeof tile.tilesetId !== 'string' || tile.tilesetId.length === 0) {
          errors.push(`${tp}: tilesetId must be a non-empty string`)
          continue
        }
        if (!isNonNegInt(tile.x) || !isNonNegInt(tile.y)) {
          errors.push(`${tp}: x/y must be non-negative integers`)
          continue
        }
        if (layer.type === 'collision') continue
        if (tile.tilesetId === COLLISION_TILESET_ID) {
          warnings.push(`${tp}: "${COLLISION_TILESET_ID}" tile on a non-collision layer is dropped on export`)
          continue
        }
        if (tilesets) {
          const ts = tilesetByFile.get(tile.tilesetId)
          if (!ts) {
            errors.push(`${tp}: unknown tileset "${tile.tilesetId}"`)
            continue
          }
          if (ts.width === 0 || ts.height === 0) {
            errors.push(`${tp}: tileset "${tile.tilesetId}" has no readable image`)
            continue
          }
          if (ts.width && ts.height) {
            const cols = Math.floor(ts.width / 32)
            const rows = Math.floor(ts.height / 32)
            if (tile.x >= cols || tile.y >= rows) {
              errors.push(`${tp}: (${tile.x},${tile.y}) is outside tileset "${tile.tilesetId}" (${cols}x${rows} tiles)`)
            }
          }
        }
      }
      if (tilesets) {
        // Two used tilesets sharing a display name collapse into one on export.
        const seenHere = new Set<string>()
        for (const tile of Object.values(layer.data)) {
          if (!isRecord(tile) || typeof tile.tilesetId !== 'string' || seenHere.has(tile.tilesetId)) continue
          seenHere.add(tile.tilesetId)
          const ts = tilesetByFile.get(tile.tilesetId)
          if (layer.type === 'collision' || !ts || typeof ts.name !== 'string') continue
          const prev = usedTilesetNames.get(ts.name)
          if (prev === undefined) usedTilesetNames.set(ts.name, tile.tilesetId)
          else if (prev !== tile.tilesetId) {
            errors.push(`tilesets "${prev}" and "${tile.tilesetId}" share the name "${ts.name}"; their tiles would be mixed up on export`)
          }
        }
      }
    })

    for (const [name, count] of exportedNames) {
      if (count > 1) warnings.push(`${count} layers will be exported with the same name "${name}"`)
    }
  }

  // ── entities ──
  if (data.entities !== undefined) {
    if (!Array.isArray(data.entities)) {
      errors.push('map.entities must be an array')
    } else {
      const seen = new Set<string>()
      data.entities.forEach((entity: unknown, ei: number) => {
        const ep = `entities[${ei}]`
        if (!isRecord(entity)) {
          errors.push(`${ep} is not an object`)
          return
        }
        const label = typeof entity.name === 'string' ? `${ep} ("${entity.name}")` : ep
        if (typeof entity.id !== 'string' || entity.id.length === 0) {
          errors.push(`${label}: id must be a non-empty string`)
        } else if (seen.has(entity.id)) {
          errors.push(`${label}: duplicate entity id "${entity.id}"`)
        } else {
          seen.add(entity.id)
        }
        if (typeof entity.name !== 'string') errors.push(`${label}: name must be a string`)
        if (!isFiniteNumber(entity.x) || !isFiniteNumber(entity.y)) {
          errors.push(`${label}: x/y must be finite numbers`)
        }
        if (!isRecord(entity.components)) {
          errors.push(`${label}: components must be an object`)
          return
        }
        for (const [type, props] of Object.entries(entity.components)) {
          if (!(COMPONENT_TYPES as readonly string[]).includes(type)) {
            errors.push(`${label}: unknown component type "${type}"`)
            continue
          }
          if (!isRecord(props)) {
            errors.push(`${label}: component ${type} must be an object`)
            continue
          }
          checkFinite(props, `${label}: ${type}`, errors)
        }
        if (entity.x !== undefined || entity.y !== undefined) {
          const transform = entity.components.Transform
          if (!isRecord(transform)) {
            errors.push(`${label}: has x/y but no Transform component`)
          }
        }
      })
    }
  }

  return finish(errors, warnings)
}

/**
 * Checks a Tiled-format map against what the game needs (see game/src/world/tilemap/MapParser.ts
 * plus the invariants the renderer relies on).
 */
export function validateTiledMap(data: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!isRecord(data)) return finish(['map is not an object'], warnings)

  if (!isPositiveInt(data.width)) errors.push(`width must be a positive integer (got ${JSON.stringify(data.width)})`)
  if (!isPositiveInt(data.height)) errors.push(`height must be a positive integer (got ${JSON.stringify(data.height)})`)
  if (!isPositiveInt(data.tilewidth)) errors.push('tilewidth must be a positive integer')
  if (!isPositiveInt(data.tileheight)) errors.push('tileheight must be a positive integer')
  if (!Array.isArray(data.layers)) errors.push('layers must be an array (MapParser requires it)')
  if (!Array.isArray(data.tilesets)) errors.push('tilesets must be an array (MapParser requires it)')

  // ── tilesets ──
  const ranges: { first: number; last: number; name: string }[] = []
  if (Array.isArray(data.tilesets)) {
    let prevEnd = 1
    data.tilesets.forEach((ts: unknown, i: number) => {
      const tp = `tilesets[${i}]`
      if (!isRecord(ts)) {
        errors.push(`${tp} is not an object`)
        return
      }
      const label = typeof ts.name === 'string' ? `${tp} ("${ts.name}")` : tp
      if (typeof ts.name !== 'string' || ts.name.length === 0) errors.push(`${label}: name must be a non-empty string`)
      if (typeof ts.image !== 'string' || ts.image.length === 0) errors.push(`${label}: image must be a non-empty string`)
      for (const key of ['imagewidth', 'imageheight', 'columns'] as const) {
        if (!isPositiveInt(ts[key])) errors.push(`${label}: ${key} must be a positive integer`)
      }
      if (!isNonNegInt(ts.tilecount)) errors.push(`${label}: tilecount must be a non-negative integer`)
      for (const key of ['tilewidth', 'tileheight'] as const) {
        if (ts[key] !== undefined && !isPositiveInt(ts[key])) errors.push(`${label}: ${key} must be a positive integer`)
      }
      if (!isPositiveInt(ts.firstgid)) {
        errors.push(`${label}: firstgid must be a positive integer`)
        return
      }
      if (ts.firstgid < prevEnd) {
        errors.push(`${label}: firstgid ${ts.firstgid} overlaps the previous tileset (must be >= ${prevEnd})`)
      }
      const count = isNonNegInt(ts.tilecount) ? ts.tilecount : 0
      prevEnd = ts.firstgid + count
      ranges.push({ first: ts.firstgid, last: ts.firstgid + count - 1, name: String(ts.name) })
    })
  }

  // ── layers ──
  if (Array.isArray(data.layers)) {
    const seenIds = new Set<unknown>()
    data.layers.forEach((layer: unknown, i: number) => {
      const lp = `layers[${i}]`
      if (!isRecord(layer)) {
        errors.push(`${lp} is not an object`)
        return
      }
      const label = typeof layer.name === 'string' ? `${lp} ("${layer.name}")` : lp
      if (typeof layer.name !== 'string') errors.push(`${label}: name must be a string`)
      if (!TILED_LAYER_TYPES.includes(layer.type as string)) {
        errors.push(`${label}: unsupported layer type ${JSON.stringify(layer.type)}`)
        return
      }
      if (layer.id !== undefined) {
        if (seenIds.has(layer.id)) errors.push(`${label}: duplicate layer id ${JSON.stringify(layer.id)}`)
        seenIds.add(layer.id)
      }
      if (layer.type === 'objectgroup') {
        if (layer.objects === undefined) warnings.push(`${label}: objectgroup has no "objects" array`)
        return
      }
      // tilelayer
      if (!isPositiveInt(layer.width) || !isPositiveInt(layer.height)) {
        errors.push(`${label}: width/height must be positive integers`)
        return
      }
      if (isPositiveInt(data.width) && isPositiveInt(data.height) && (layer.width !== data.width || layer.height !== data.height)) {
        errors.push(`${label}: size ${layer.width}x${layer.height} differs from map size ${data.width}x${data.height}`)
      }
      if (!Array.isArray(layer.data)) {
        errors.push(`${label}: tile layer needs a data array`)
        return
      }
      if (layer.data.length !== layer.width * layer.height) {
        errors.push(`${label}: data length ${layer.data.length} != width*height ${layer.width * layer.height}`)
      }
      let bad = 0
      let dangling = 0
      for (const gid of layer.data) {
        if (!isNonNegInt(gid)) {
          bad++
        } else if (gid !== 0 && Array.isArray(data.tilesets) && !ranges.some((r) => gid >= r.first && gid <= r.last)) {
          dangling++
        }
      }
      if (bad > 0) errors.push(`${label}: ${bad} data entries are not non-negative integers`)
      if (dangling > 0) errors.push(`${label}: ${dangling} tile gids do not belong to any tileset`)
    })
  }

  return finish(errors, warnings)
}
