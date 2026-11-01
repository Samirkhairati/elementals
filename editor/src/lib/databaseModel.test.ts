import { describe, expect, it } from 'vitest'
import type { CharacterInfo, GraphicInfo } from '../../../shared/engine/graphics'
import type { CharacterDef } from '../../../shared/engine/characters'
import {
  DATABASE_TABLES,
  buildGraphicTree,
  characterCounts,
  defaultGraphicId,
  formatBytes,
  getTable,
  graphicUsage,
  summarizeMap,
  tilesetGrid,
  tilesetUsage,
  unusedGraphics,
  type MapLike,
} from './databaseModel'

const g = (id: string, width = 128, height = 192): GraphicInfo => ({ id, width, height, bytes: 100, mtimeMs: 0 })
const def = (image: string, over: Partial<CharacterDef> = {}): CharacterDef => ({
  version: 2, name: 'Hero', tags: [], facing: 'none', pivot: { x: 0.5, y: 1 },
  sheets: { sheet: { image, frameWidth: 32, frameHeight: 48, margin: 0, spacing: 0 } }, clips: {}, bindings: {}, ...over,
})
const info = (id: string, d: CharacterDef): CharacterInfo => ({ id, def: d, images: {} })

describe('table registry', () => {
  it('has unique ids; Visual tables are read-only, Design tables editable; unbuilt ones are planned', () => {
    const ids = DATABASE_TABLES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of DATABASE_TABLES.filter((t) => t.group === 'visual')) expect(t.access).toBe('readonly')
    expect(getTable('characters')).toMatchObject({ group: 'design', access: 'editable', status: 'ready' })
    expect(getTable('flags')?.group).toBe('design')
    expect(DATABASE_TABLES.filter((t) => t.status === 'planned').map((t) => t.id)).toEqual(expect.arrayContaining(['pokemon', 'items', 'moves', 'text']))
    expect(getTable('nope')).toBeUndefined()
  })
})

describe('graphics', () => {
  const list = [g('sprites/b/walk.png'), g('props/flower.png'), g('sprites/a/walk.png'), g('sprites/a/run.png')]

  it('builds a sorted folder tree, folders first, and filters by id', () => {
    const tree = buildGraphicTree(list)
    expect(tree.children.map((c) => `${c.kind}:${c.name}`)).toEqual(['folder:props', 'folder:sprites'])
    const sprites = tree.children[1]
    expect(sprites.children.map((c) => c.name)).toEqual(['a', 'b'])
    expect(sprites.children[0].children.map((c) => c.path)).toEqual(['sprites/a/run.png', 'sprites/a/walk.png'])
    expect(buildGraphicTree(list, ' FLOWER ').children[0].children[0].path).toBe('props/flower.png')
    expect(buildGraphicTree(list, 'zzz').children).toEqual([])
  })

  it('knows which characters use a graphic and which graphics nobody uses', () => {
    const chars = { a: info('a', def('props/flower.png')), b: info('b', def('props/flower.png', { name: 'B' })) }
    expect(graphicUsage(chars)['props/flower.png']).toEqual([
      { characterId: 'a', characterName: 'Hero', sheet: 'sheet' },
      { characterId: 'b', characterName: 'B', sheet: 'sheet' },
    ])
    expect(unusedGraphics(list, chars)).toEqual(['sprites/b/walk.png', 'sprites/a/walk.png', 'sprites/a/run.png'])
  })

  it('formats sizes and suggests import ids', () => {
    expect(formatBytes(12)).toBe('12 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
    expect(defaultGraphicId('characters/hero', 'Walk Cycle.PNG')).toBe('sprites/characters/hero/walk-cycle.png')
    expect(defaultGraphicId('../x', 'a.png')).toBeNull()
  })
})

describe('tilesets and maps', () => {
  const map = (over: Partial<MapLike> = {}): MapLike => ({
    fileName: 'town.json', name: 'Town', width: 10, height: 8,
    layers: [
      { id: 'g', name: 'ground', type: 'tile', visible: true, locked: false, data: { 0: { tilesetId: 'grass.png', x: 0, y: 0 }, 1: { tilesetId: 'grass.png', x: 1, y: 0 } } },
      { id: 'd', name: 'decor', type: 'tile', visible: true, locked: false, data: { 0: { tilesetId: 'grass.png', x: 0, y: 0 }, 2: { tilesetId: 'house.png', x: 0, y: 0 } } },
    ],
    entities: [{ components: { Sprite: { asset: 'characters/hero' } } }, { components: { Sprite: { asset: '' } } }, { components: {} }],
    ...over,
  })

  it('lists the maps and layers that use each tileset', () => {
    const usage = tilesetUsage([map(), map({ fileName: 'cave.json', name: 'Cave', layers: [] })])
    expect(usage['grass.png']).toEqual([{ mapFile: 'town.json', mapName: 'Town', layers: ['decor', 'ground'] }])
    expect(usage['house.png'][0].layers).toEqual(['decor'])
  })

  it('computes the tile grid at the project tile size', () => {
    expect(tilesetGrid(256, 96)).toEqual({ columns: 8, rows: 3, count: 24 })
    expect(tilesetGrid(31, 100)).toEqual({ columns: 0, rows: 3, count: 0 })
  })

  it('summarises a map: size, layers, entities, tilesets and characters used', () => {
    expect(summarizeMap(map())).toEqual({
      fileName: 'town.json', name: 'Town', width: 10, height: 8, layers: 2, entities: 3,
      tilesets: ['grass.png', 'house.png'], characters: ['characters/hero'],
    })
  })
})

describe('character counters', () => {
  it('counts errors and warnings per character against the known graphics', () => {
    const good = info('good', def('a.png'))
    const missing = info('missing', def('nope.png'))
    const odd = info('odd', def('b.png'))
    const counts = characterCounts({ good, missing, odd }, [g('a.png', 64, 96), g('b.png', 65, 96)])
    expect(counts.good).toEqual({ errors: 0, warnings: 0 })
    expect(counts.missing.errors).toBe(1)
    expect(counts.odd).toEqual({ errors: 0, warnings: 1 }) // 65px does not divide into 32px columns
  })
})
