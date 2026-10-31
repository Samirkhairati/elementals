/* eslint-disable @typescript-eslint/no-explicit-any -- loose fixtures on purpose */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectUsedTilesetIds, convertEditorMapToTiled, serializeTiledMap } from '../../../shared/mapExport'
import { readPngSize } from '../../../shared/png'
import { validateTiledMap } from '../../../shared/mapSchema'
import type { EditorMap, TilesetInfo } from '../../../shared/mapTypes'
import { migrateMap } from '../../../shared/engine/migrate'

// ── Reference implementation ────────────────────────────────────────────────
// Verbatim copy of the conversion that lived in hooks/useExportMap.ts before it moved to
// shared/mapExport.ts (image-size lookup replaced by the `width`/`height` of TilesetInfo).
// The shared converter must stay byte-for-byte identical for every input.
function legacyConvert(mapToExport: any, tilesets: TilesetInfo[]) {
  const usedTilesets = new Set<string>()
  let hasCollisionLayer = false
  for (const layer of mapToExport.layers || []) {
    if (layer.type === 'collision') {
      hasCollisionLayer = true
      continue
    }
    for (const tile of Object.values(layer.data || {}) as any[]) {
      usedTilesets.add(tile.tilesetId)
    }
  }

  const exportTilesets: any[] = []
  let currentGid = 1
  for (const tsId of usedTilesets) {
    const ts = tilesets.find((t) => t.fileName === tsId)
    if (!ts) continue
    const dim = { w: ts.width, h: ts.height }
    if (dim.w === 0 || dim.h === 0) continue

    const columns = Math.floor(dim.w / 32)
    const tilecount = columns * Math.floor(dim.h / 32)

    exportTilesets.push({
      columns,
      firstgid: currentGid,
      image: ts.fileName,
      imageheight: dim.h,
      imagewidth: dim.w,
      margin: 0,
      name: ts.name,
      spacing: 0,
      tilecount,
      tileheight: 32,
      tilewidth: 32,
    })
    currentGid += tilecount
  }

  let collisionGid = 0
  if (hasCollisionLayer) {
    collisionGid = currentGid
    exportTilesets.push({
      columns: 1,
      firstgid: collisionGid,
      image: 'collision_dummy.png',
      imageheight: 32,
      imagewidth: 32,
      margin: 0,
      name: 'collision_dummy',
      spacing: 0,
      tilecount: 1,
      tileheight: 32,
      tilewidth: 32,
    })
    currentGid += 1
  }

  const exportLayers = (mapToExport.layers || []).map((layer: any, index: number) => {
    const data = new Array(mapToExport.width * mapToExport.height).fill(0)
    for (const [indexStr, tile] of Object.entries(layer.data || {}) as any[]) {
      const idx = parseInt(indexStr)
      if (layer.type === 'collision') {
        data[idx] = collisionGid
      } else {
        const tsExport = exportTilesets.find((t) => t.name === tilesets.find((ts) => ts.fileName === tile.tilesetId)?.name)
        if (tsExport) {
          data[idx] = tsExport.firstgid + (tile.y * tsExport.columns + tile.x)
        }
      }
    }
    const exportLayer: any = {
      data,
      height: mapToExport.height,
      id: index + 1,
      name: layer.type === 'collision' ? 'collision' : layer.name,
      opacity: 1,
      type: layer.type === 'tile' ? 'tilelayer' : layer.type === 'collision' ? 'tilelayer' : layer.type === 'objects' ? 'objectgroup' : 'tilelayer',
      visible: layer.visible,
      width: mapToExport.width,
      x: 0,
      y: 0,
    }
    const props: any[] = []
    if (layer.z !== undefined) props.push({ name: 'z', type: 'int', value: Number(layer.z) })
    if (props.length > 0) exportLayer.properties = props
    return exportLayer
  })

  const tiledMap = {
    compressionlevel: -1,
    height: mapToExport.height,
    infinite: false,
    layers: exportLayers,
    nextlayerid: exportLayers.length + 1,
    nextobjectid: 1,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.10.2',
    tileheight: 32,
    tilesets: exportTilesets,
    tilewidth: 32,
    type: 'map',
    version: '1.10',
    width: mapToExport.width,
    schemaVersion: 4,
    entities: migrateMap(mapToExport).value.entities || [],
  }
  return JSON.stringify(tiledMap, null, 2)
}

// ── Fixtures ────────────────────────────────────────────────────────────────
const TILESETS: TilesetInfo[] = [
  { name: 'grass', fileName: 'grass.png', width: 64, height: 64 }, // 2x2 = 4 tiles
  { name: 'outside', fileName: 'outside.png', width: 256, height: 256 }, // 8x8 = 64 tiles
  { name: 'broken', fileName: 'broken.png', width: 0, height: 0 },
  { name: 'wide', fileName: 'wide.png', width: 100, height: 70 }, // non-multiple of 32
]

function layer(id: string, name: string, type: string, data: Record<number, any> | undefined, extra: any = {}): any {
  return { id, name, type, visible: true, locked: false, ...(data ? { data } : {}), ...extra }
}

const SYNTHETIC: Record<string, any> = {
  empty: { name: 'empty', width: 3, height: 2, layers: [] },
  singleTileset: {
    name: 'one',
    width: 4,
    height: 3,
    layers: [layer('a', 'ground', 'tile', { 0: { tilesetId: 'grass.png', x: 0, y: 0 }, 5: { tilesetId: 'grass.png', x: 1, y: 1 } }, { z: 1 })],
  },
  multiTilesetAndCollision: {
    name: 'multi',
    width: 4,
    height: 4,
    layers: [
      layer('c', 'collisions', 'collision', { 1: { tilesetId: '__collision__', x: 0, y: 0 }, 15: { tilesetId: '__collision__', x: 0, y: 0 } }),
      layer('t', 'terrain', 'terrain', {}),
      layer('e', 'encounters', 'encounters', undefined),
      layer('d', 'deco', 'tile', { 2: { tilesetId: 'outside.png', x: 7, y: 7 } }, { z: 20, visible: false }),
      layer('g', 'ground', 'tile', { 0: { tilesetId: 'grass.png', x: 1, y: 0 }, 3: { tilesetId: 'outside.png', x: 3, y: 2 } }, { z: 0 }),
      layer('o', 'objs', 'objects', undefined),
    ],
    entities: [{ id: 'e1', name: 'Sign', x: 32, y: 64, components: { Transform: { x: 32, y: 64, depth: 0 }, Tag: { tag: 'sign' } } }],
    entityFolders: [{ id: 'f', name: 'F' }],
  },
  unknownAndBrokenTilesets: {
    name: 'weird',
    width: 2,
    height: 2,
    layers: [
      layer('a', 'a', 'tile', { 0: { tilesetId: 'missing.png', x: 0, y: 0 }, 1: { tilesetId: 'broken.png', x: 0, y: 0 }, 2: { tilesetId: 'wide.png', x: 2, y: 1 }, 3: { tilesetId: '__collision__', x: 0, y: 0 } }),
    ],
  },
  twoCollisionLayers: {
    name: 'cc',
    width: 2,
    height: 1,
    layers: [layer('1', 'x', 'collision', { 0: { tilesetId: '__collision__', x: 0, y: 0 } }), layer('2', 'y', 'collision', { 1: { tilesetId: '__collision__', x: 0, y: 0 } })],
  },
  sameNameTilesets: {
    name: 'dup',
    width: 2,
    height: 1,
    layers: [layer('1', 'x', 'tile', { 0: { tilesetId: 'a.png', x: 0, y: 0 }, 1: { tilesetId: 'b.png', x: 1, y: 0 } })],
  },
}
const DUP_TILESETS: TilesetInfo[] = [
  { name: 'same', fileName: 'a.png', width: 64, height: 32 },
  { name: 'same', fileName: 'b.png', width: 128, height: 32 },
]

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

function realTilesets(): TilesetInfo[] {
  const out: TilesetInfo[] = []
  const walk = (dir: string) => {
    for (const item of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, item)
      if (fs.statSync(full).isDirectory()) walk(full)
      else if (item.endsWith('.png')) {
        const { width, height } = readPngSize(fs.readFileSync(full))
        out.push({ name: path.parse(item).name, fileName: item, width, height })
      }
    }
  }
  walk(path.join(REPO, 'project/tilesets'))
  return out
}

function realMaps(): { file: string; map: EditorMap }[] {
  const dir = path.join(REPO, 'project/maps')
  const out: { file: string; map: EditorMap }[] = []
  const walk = (d: string) => {
    for (const item of fs.readdirSync(d).sort()) {
      const full = path.join(d, item)
      if (fs.statSync(full).isDirectory()) walk(full)
      else if (item.endsWith('.json')) out.push({ file: path.relative(dir, full), map: JSON.parse(fs.readFileSync(full, 'utf8')) })
    }
  }
  walk(dir)
  return out
}

// ── Tests ───────────────────────────────────────────────────────────────────
describe('convertEditorMapToTiled: golden equivalence with the legacy export hook', () => {
  for (const [name, map] of Object.entries(SYNTHETIC)) {
    it(`matches byte for byte: ${name}`, () => {
      const tilesets = name === 'sameNameTilesets' ? DUP_TILESETS : TILESETS
      expect(serializeTiledMap(convertEditorMapToTiled(map as EditorMap, tilesets))).toBe(legacyConvert(map, tilesets))
    })
  }

  it('matches byte for byte for every real map in project/maps', () => {
    const tilesets = realTilesets()
    const maps = realMaps()
    expect(maps.length).toBeGreaterThan(0)
    for (const { map } of maps) {
      expect(serializeTiledMap(convertEditorMapToTiled(map, tilesets))).toBe(legacyConvert(map, tilesets))
    }
  })

  it('does not mutate its input', () => {
    const map = structuredClone(SYNTHETIC.multiTilesetAndCollision)
    convertEditorMapToTiled(map, TILESETS)
    expect(map).toEqual(SYNTHETIC.multiTilesetAndCollision)
  })
})

describe('convertEditorMapToTiled: structure', () => {
  const tiled = convertEditorMapToTiled(SYNTHETIC.multiTilesetAndCollision, TILESETS)

  it('assigns firstgids in first-use order and puts the collision dummy last', () => {
    // layer order: collision (skipped), deco uses outside first, then ground uses grass
    expect(tiled.tilesets.map((t) => [t.name, t.firstgid, t.tilecount])).toEqual([
      ['outside', 1, 64],
      ['grass', 65, 4],
      ['collision_dummy', 69, 1],
    ])
  })

  it('maps tile coordinates to gids with the per-tileset offset', () => {
    const ground = tiled.layers.find((l) => l.name === 'ground')!
    expect(ground.data.length).toBe(16)
    expect(ground.data[0]).toBe(65 + 0 * 2 + 1) // grass (1,0)
    expect(ground.data[3]).toBe(1 + 2 * 8 + 3) // outside (3,2)
    expect(ground.data.filter((g) => g !== 0).length).toBe(2)
    const deco = tiled.layers.find((l) => l.name === 'deco')!
    expect(deco.data[2]).toBe(64)
    expect(deco.visible).toBe(false)
  })

  it('exports collision layers with the dummy gid and the fixed name', () => {
    const col = tiled.layers[0]
    expect(col.name).toBe('collision')
    expect(col.data[1]).toBe(69)
    expect(col.data[15]).toBe(69)
    expect(col.data.filter((g) => g !== 0).length).toBe(2)
  })

  it('writes the z property, layer types and sequential ids', () => {
    expect(tiled.layers.map((l) => l.id)).toEqual([1, 2, 3, 4, 5, 6])
    expect(tiled.layers.map((l) => l.type)).toEqual(['tilelayer', 'tilelayer', 'tilelayer', 'tilelayer', 'tilelayer', 'objectgroup'])
    expect(tiled.layers[3].properties).toEqual([{ name: 'z', type: 'int', value: 20 }])
    expect(tiled.layers[0].properties).toBeUndefined()
    expect(tiled.nextlayerid).toBe(7)
  })

  it('carries canonical entities over unchanged and stamps the schema version', () => {
    // Already canonical (Transform + Tag only): nothing to migrate.
    expect(tiled.entities).toEqual(SYNTHETIC.multiTilesetAndCollision.entities)
    expect(tiled.schemaVersion).toBe(4)
  })

  it('migrates legacy entities on export (the game only ever sees canonical components)', () => {
    const legacy: any = {
      name: 'old',
      width: 2,
      height: 2,
      layers: [],
      entities: [
        {
          id: 'e1',
          name: 'Sign',
          x: 48,
          y: 64,
          components: { Transform: { x: 48, y: 64, depth: 10 }, Interactable: { type: 'on_interact', message: 'hi', eventKey: '' } },
        },
      ],
    }
    const out = convertEditorMapToTiled(legacy, [])
    expect(out.schemaVersion).toBe(4)
    expect(Object.keys(out.entities[0].components)).toEqual(['Transform', 'Event'])
    expect(JSON.stringify(out.entities)).not.toContain('Interactable')
    // idempotent: exporting the already exported entities changes nothing
    const again = convertEditorMapToTiled({ ...legacy, entities: out.entities } as any, [])
    expect(serializeTiledMap(again)).toBe(serializeTiledMap(out))
    // deterministic ids: two exports of the same legacy map are byte-identical
    expect(serializeTiledMap(convertEditorMapToTiled(legacy, []))).toBe(serializeTiledMap(out))
  })

  it('output of a valid map passes validateTiledMap', () => {
    expect(validateTiledMap(tiled).errors).toEqual([])
  })

  it('collectUsedTilesetIds ignores collision layers and keeps first-use order', () => {
    expect(collectUsedTilesetIds(SYNTHETIC.multiTilesetAndCollision)).toEqual(['outside.png', 'grass.png'])
  })
})

describe('readPngSize', () => {
  it('reads the real tileset sizes', () => {
    const size = readPngSize(fs.readFileSync(path.join(REPO, 'project/tilesets/Outside/grass.png')))
    expect(size.width).toBeGreaterThan(0)
    expect(size.width % 32).toBe(0)
  })
  it('rejects non-PNG data', () => {
    expect(() => readPngSize(new Uint8Array(40))).toThrow(/Not a PNG/)
    expect(() => readPngSize(new Uint8Array(3))).toThrow(/too short/)
  })
})
