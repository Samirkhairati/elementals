/* eslint-disable @typescript-eslint/no-explicit-any -- loose fixtures on purpose */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPONENT_TYPES, LAYER_TYPES, validateEditorMap, validateTiledMap } from '../../../shared/mapSchema'
import { convertEditorMapToTiled } from '../../../shared/mapExport'
import { readPngSize } from '../../../shared/png'
import type { ComponentType, LayerType } from '@/types/editor'

// Compile-time guard: the shared lists must stay identical to the editor's unions.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const componentTypesInSync: Equal<(typeof COMPONENT_TYPES)[number], ComponentType> = true
const layerTypesInSync: Equal<(typeof LAYER_TYPES)[number], LayerType> = true

const TILESETS = [
  { name: 'grass', fileName: 'grass.png', width: 64, height: 64 },
  { name: 'outside', fileName: 'outside.png', width: 256, height: 256 },
]

function validMap(): any {
  return {
    name: 'm',
    width: 3,
    height: 2,
    layers: [
      { id: 'c', name: 'collisions', type: 'collision', visible: true, locked: false, data: { 0: { tilesetId: '__collision__', x: 0, y: 0 } } },
      { id: 'g', name: 'ground', type: 'tile', visible: true, locked: false, z: 1, data: { 5: { tilesetId: 'grass.png', x: 1, y: 1 } } },
    ],
    entities: [{ id: 'e', name: 'E', x: 1, y: 2, components: { Transform: { x: 1, y: 2 }, Collider: { width: 32 } } }],
  }
}

describe('shared lists', () => {
  it('match the editor unions', () => {
    expect(componentTypesInSync && layerTypesInSync).toBe(true)
  })
})

describe('validateEditorMap', () => {
  it('accepts a valid map (with and without a tileset list)', () => {
    expect(validateEditorMap(validMap())).toEqual({ ok: true, errors: [], warnings: [] })
    expect(validateEditorMap(validMap(), { tilesets: TILESETS }).ok).toBe(true)
  })

  const bad: [string, (m: any) => void, RegExp, any?][] = [
    ['non-object', (_m) => {}, /not an object/, 42],
    ['zero width', (m) => (m.width = 0), /width/],
    ['fractional height', (m) => (m.height = 1.5), /height/],
    ['missing layers', (m) => delete m.layers, /layers must be an array/],
    ['duplicate layer ids', (m) => (m.layers[1].id = 'c'), /duplicate layer id/],
    ['unknown layer type', (m) => (m.layers[1].type = 'weird'), /unknown layer type/],
    ['non-boolean visible', (m) => (m.layers[1].visible = 'yes'), /visible/],
    ['tile index out of range', (m) => (m.layers[1].data[6] = { tilesetId: 'grass.png', x: 0, y: 0 }), /out of range/],
    ['non-integer tile key', (m) => (m.layers[1].data['a'] = { tilesetId: 'grass.png', x: 0, y: 0 }), /not a non-negative integer/],
    ['negative tile x', (m) => (m.layers[1].data[5].x = -1), /non-negative integers/],
    ['unknown tileset', (m) => (m.layers[1].data[5].tilesetId = 'nope.png'), /unknown tileset/, undefined],
    ['tile outside tileset image', (m) => (m.layers[1].data[5].x = 2), /outside tileset/],
    ['duplicate entity ids', (m) => m.entities.push({ ...m.entities[0] }), /duplicate entity id/],
    ['unknown component', (m) => (m.entities[0].components.Bogus = {}), /unknown component type/],
    ['missing Transform', (m) => delete m.entities[0].components.Transform, /no Transform/],
    ['non-finite entity x', (m) => (m.entities[0].x = Infinity), /finite/],
    ['non-finite component field', (m) => (m.entities[0].components.Collider.width = NaN), /not a finite number/],
    ['non-finite layer z', (m) => (m.layers[1].z = NaN), /z must be a finite/],
  ]
  for (const [name, mutate, re, replacement] of bad) {
    it(`rejects: ${name}`, () => {
      let m = validMap()
      mutate(m)
      if (replacement !== undefined) m = replacement
      const res = validateEditorMap(m, { tilesets: TILESETS })
      expect(res.ok).toBe(false)
      expect(res.errors.join('\n')).toMatch(re)
    })
  }

  it('only checks tileset references when a tileset list is given', () => {
    const m = validMap()
    m.layers[1].data[5].tilesetId = 'nope.png'
    expect(validateEditorMap(m).ok).toBe(true)
    expect(validateEditorMap(m, { tilesets: TILESETS }).ok).toBe(false)
  })

  it('rejects two used tilesets that share a display name', () => {
    const m = validMap()
    m.layers[1].data[4] = { tilesetId: 'other.png', x: 0, y: 0 }
    const res = validateEditorMap(m, { tilesets: [...TILESETS, { name: 'grass', fileName: 'other.png', width: 64, height: 64 }] })
    expect(res.errors.join()).toMatch(/share the name "grass"/)
  })

  it('warns (does not fail) on collision tiles in tile layers and duplicate exported names', () => {
    const m = validMap()
    m.layers[1].data[0] = { tilesetId: '__collision__', x: 0, y: 0 }
    m.layers.push({ id: 'c2', name: 'x', type: 'collision', visible: true, locked: false })
    const res = validateEditorMap(m, { tilesets: TILESETS })
    expect(res.ok).toBe(true)
    expect(res.warnings.length).toBe(2)
  })

  it('never throws on garbage', () => {
    for (const v of [null, undefined, 'x', [], { layers: 5 }, { width: 1, height: 1, name: 'a', layers: [null, 3], entities: [null] }]) {
      expect(() => validateEditorMap(v)).not.toThrow()
      expect(validateEditorMap(v).ok).toBe(false)
    }
  })
})

describe('validateTiledMap', () => {
  const good = () => convertEditorMapToTiled(validMap(), TILESETS) as any

  it('accepts converter output', () => {
    expect(validateTiledMap(good())).toEqual({ ok: true, errors: [], warnings: [] })
  })

  const bad: [string, (t: any) => void, RegExp][] = [
    ['missing layers', (t) => delete t.layers, /layers must be an array/],
    ['missing tilesets', (t) => delete t.tilesets, /tilesets must be an array/],
    ['bad tilewidth', (t) => (t.tilewidth = 0), /tilewidth/],
    ['short data', (t) => t.layers[0].data.pop(), /data length/],
    ['missing data', (t) => delete t.layers[0].data, /needs a data array/],
    ['layer size differs from map', (t) => (t.layers[0].width = 9), /differs from map size/],
    ['fractional gid', (t) => (t.layers[0].data[0] = 1.5), /not non-negative integers/],
    ['gid without tileset', (t) => (t.layers[1].data[0] = 999), /do not belong to any tileset/],
    ['firstgid zero', (t) => (t.tilesets[0].firstgid = 0), /firstgid must be/],
    ['overlapping firstgid', (t) => (t.tilesets[1].firstgid = 2), /overlaps/],
    ['unsupported layer type', (t) => (t.layers[0].type = 'imagelayer'), /unsupported layer type/],
    ['tileset without image', (t) => delete t.tilesets[0].image, /image/],
  ]
  for (const [name, mutate, re] of bad) {
    it(`rejects: ${name}`, () => {
      const t = good()
      mutate(t)
      const res = validateTiledMap(t)
      expect(res.ok).toBe(false)
      expect(res.errors.join('\n')).toMatch(re)
    })
  }

  it('never throws on garbage', () => {
    for (const v of [null, 3, [], { layers: [null], tilesets: [1] }]) {
      expect(() => validateTiledMap(v)).not.toThrow()
      expect(validateTiledMap(v).ok).toBe(false)
    }
  })
})

describe('real maps in project/maps', () => {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
  const tilesets: { name: string; fileName: string; width: number; height: number }[] = []
  const walk = (dir: string, visit: (full: string, item: string) => void) => {
    for (const item of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, item)
      if (fs.statSync(full).isDirectory()) walk(full, visit)
      else visit(full, item)
    }
  }
  walk(path.join(repo, 'project/tilesets'), (full, item) => {
    if (!item.endsWith('.png')) return
    const { width, height } = readPngSize(fs.readFileSync(full))
    tilesets.push({ name: path.parse(item).name, fileName: item, width, height })
  })

  walk(path.join(repo, 'project/maps'), (full, item) => {
    if (!item.endsWith('.json')) return
    it(`${item} validates and converts to a valid Tiled map`, () => {
      const map = JSON.parse(fs.readFileSync(full, 'utf8'))
      const res = validateEditorMap(map, { tilesets })
      expect(res.errors).toEqual([])
      expect(validateTiledMap(convertEditorMapToTiled(map, tilesets)).errors).toEqual([])
    })
  })
})
