/* eslint-disable @typescript-eslint/no-explicit-any -- JSON fixtures */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { convertEditorMapToTiled, serializeTiledMap } from '../../../shared/mapExport'
import { validateEditorMap, validateTiledMap } from '../../../shared/mapSchema'
import { migrateMap } from '../../../shared/engine/migrate'
import { SCHEMA_VERSION } from '../../../shared/engine/types'
import type { EditorMap, TilesetInfo } from '../../../shared/mapTypes'

// shared/fixtures/golden-export holds maps in the schema 5 format (`<name>.map.json`; city and market are copies of the
// project's maps) next to what the exporter wrote for them BEFORE maps became a tree of nodes (`<name>.tiled.json`).
// The tree exporter has to write the same file, apart from the stamped schemaVersion (5 -> the current one) and the editor-only entity
// field `folder`, which the tree does not keep.
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../shared/fixtures/golden-export')
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
const names = fs.readdirSync(dir).filter((f) => f.endsWith('.map.json')).map((f) => f.slice(0, -'.map.json'.length))
const tilesets: TilesetInfo[] = read('tilesets.json')

/** The golden output as the tree exporter must write it. */
function expected(golden: any): any {
  return { ...golden, schemaVersion: SCHEMA_VERSION, entities: golden.entities.map(({ folder: _folder, ...entity }: any) => entity) }
}

const isEmptyImageGroup = (l: any) =>
  l.type === 'objectgroup' && (l.objects ?? []).length === 0 && (l.properties ?? []).some((p: any) => p.name === 'kind' && p.value === 'image')

// The schema 5 export without its empty image layers: an image layer with no pictures became an empty Node2D, which draws
// nothing and exports nothing (like an empty folder); the layers after it are numbered one lower.
function withoutEmptyImageLayers(tiled: any): any {
  const layers = tiled.layers.filter((l: any) => !isEmptyImageGroup(l)).map((l: any, i: number) => ({ ...l, id: i + 1 }))
  return layers.length === tiled.layers.length ? tiled : { ...tiled, layers, nextlayerid: layers.length + 1 }
}

// Every fixture exports byte for byte as before (but for empty image layers): a group of pictures in an image layer became
// a Node2D in a Node2D, which stays in its parent's run of sprites (shared/sceneLayers.ts), so it is still part of the one
// object group.
function expectSameExport(_name: string, out: any, golden: any) {
  expect(serializeTiledMap(out)).toBe(JSON.stringify(withoutEmptyImageLayers(expected(golden)), null, 2))
}

describe('the tree exporter matches the schema 5 exporter', () => {
  it('has fixtures', () => {
    expect(names).toEqual(expect.arrayContaining(['city', 'market', 'folders', 'picture-groups', 'entities', 'collision', 'collision-shapes-only', 'looks', 'bare']))
  })

  for (const name of names) {
    it(`${name}: a schema 5 map exports the same Tiled file`, () => {
      const map: EditorMap = read(`${name}.map.json`)
      const golden = read(`${name}.tiled.json`)
      const out = convertEditorMapToTiled(map, tilesets)
      expect(validateTiledMap(out).errors).toEqual([])
      expectSameExport(name, out, golden)
    })

    it(`${name}: the migrated map exports the same Tiled file, and validates`, () => {
      const map: EditorMap = read(`${name}.map.json`)
      const v6 = migrateMap(map).value
      expect(v6.schemaVersion).toBe(SCHEMA_VERSION)
      expect(v6.nodes).toBeDefined()
      expect(validateEditorMap(v6, { tilesets }).errors).toEqual([])
      expectSameExport(name, convertEditorMapToTiled(v6, tilesets), read(`${name}.tiled.json`))
    })
  }

  it('does not mutate the map it exports', () => {
    const map: EditorMap = read('picture-groups.map.json')
    const before = JSON.stringify(map)
    convertEditorMapToTiled(map, tilesets)
    expect(JSON.stringify(map)).toBe(before)
  })
})
