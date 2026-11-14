/* eslint-disable @typescript-eslint/no-explicit-any -- loose JSON fixtures */
import { describe, it, expect } from 'vitest'
import { validateEditorMap, validateTiledMap } from '../../../shared/mapSchema'
import { collectUsedTilesetIds, convertEditorMapToTiled } from '../../../shared/mapExport'
import { buildReferenceIndex, characterIdsOfMap, rewriteCharacterId, rewriteMapGraphicId, rewriteTilesetId } from '../../../shared/engine/index'
import { migrateMap } from '../../../shared/engine/migrate'
import type { RefMap } from '../../../shared/engine/index'
import type { EditorMap, TilesetInfo } from '../../../shared/mapTypes'

// Maps stored as a tree of nodes (schema 6): validation, export and the reference scans.

const tilesets: TilesetInfo[] = [
  { name: 'grass', fileName: 'grass.png', width: 64, height: 64 },
  { name: 'house', fileName: 'house.png', width: 128, height: 96 },
]
const ent = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: 'entity', name: id, x: 16, y: 32, components: { Transform: { x: 16, y: 32, depth: 10 }, Sprite: { asset: 'characters/oldman', animation: '' } }, ...extra })
const tree = (nodes: unknown[], extra: Record<string, unknown> = {}): any => ({ name: 'm', width: 4, height: 3, schemaVersion: 6, nodes, ...extra })
const group = (id: string, children: unknown[], extra: Record<string, unknown> = {}) => ({ id, type: 'group', name: id, children, ...extra })
const tile = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: 'tile', name: id, ...extra })
const pic = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: 'picture', name: '', graphicId: `${id}.png`, x: 1, y: 2, ...extra })
const image = (id: string, children: unknown[], extra: Record<string, unknown> = {}) => ({ id, type: 'image', name: id, children, ...extra })
const errorsOf = (m: unknown, options = {}) => validateEditorMap(m, options).errors
const warningsOf = (m: unknown) => validateEditorMap(m).warnings

describe('validateEditorMap: nodes', () => {
  const good = () =>
    tree([
      tile('ground', { data: { 0: { tilesetId: 'grass.png', x: 1, y: 1 } }, z: 1, look: { default: {} } }),
      group('town', [image('sky', [pic('p1'), group('birds', [pic('p2', { crop: { x: 0, y: 0, w: 4, h: 4 }, scale: 2, opacity: 0.5 })])]), ent('npc')]),
      { id: 'walls', type: 'collision', name: 'walls', data: { 1: { tilesetId: '__collision__', x: 0, y: 0, group: 'w' } }, children: [{ id: 'w', type: 'collisionTiles', name: 'Tiles' }, { id: 's', type: 'collisionShape', name: '', closed: true, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }] },
      { id: 'water', type: 'terrain', name: 'water', data: {} },
    ])

  it('accepts a valid tree (with the tileset checks) and rejects it without the old `layers`', () => {
    expect(errorsOf(good(), { tilesets })).toEqual([])
    expect(warningsOf(good())).toEqual([])
    expect(errorsOf({ name: 'm', width: 1, height: 1 })).toContain('map.layers must be an array')
  })

  it('reports malformed nodes with where they are', () => {
    const bad = tree([
      7,
      { type: 'tile', name: 'no id' },
      tile('dup'),
      tile('dup'),
      { id: 'x', type: 'mystery', name: 'x' },
      { id: 'y', type: 'tile', name: 5, visible: 'yes', locked: 1, collapsed: 'no', ySort: 'x', z: Infinity },
      group('g', 'nope' as unknown as unknown[]),
    ])
    const errors = errorsOf(bad)
    expect(errors).toEqual(
      expect.arrayContaining([
        'nodes[0] is not an object',
        expect.stringContaining('nodes[1] ("no id"): id must be a non-empty string'),
        expect.stringContaining('nodes[3] ("dup"): duplicate node id "dup"'),
        expect.stringContaining('unknown node type "mystery"'),
        expect.stringContaining('nodes[5]: name must be a string'),
        expect.stringContaining('visible must be a boolean'),
        expect.stringContaining('locked must be a boolean'),
        expect.stringContaining('collapsed must be a boolean'),
        expect.stringContaining('ySort must be a boolean'),
        expect.stringContaining('z must be a finite number'),
        expect.stringContaining('children must be an array'),
      ])
    )
  })

  it('enforces the placement rules', () => {
    const errors = errorsOf(tree([pic('p'), group('g', [{ id: 'cs', type: 'collisionShape', name: '', closed: true, points: [] }]), image('i', [ent('e')]), { id: 'c', type: 'collision', name: 'c', children: [tile('t')] }, tile('leaf', { children: [tile('inner')] })]))
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('a picture node cannot sit at the top of the map'),
        expect.stringContaining('a collisionShape node cannot sit in a group node'),
        expect.stringContaining('a entity node cannot sit in a image node'),
        expect.stringContaining('a tile node cannot sit in a collision node'),
      ])
    )
    expect(warningsOf(tree([tile('leaf', { children: [tile('inner')] })]))).toEqual(expect.arrayContaining([expect.stringContaining('holds no children')]))
  })

  it('validates what each type holds: cells, pictures, shapes and entities', () => {
    const errors = errorsOf(
      tree([
        tile('t', { data: { 99: { tilesetId: 'grass.png', x: 0, y: 0 }, a: {} } }),
        image('i', [pic('p', { graphicId: undefined }), pic('q', { crop: { x: 0, y: 0, w: 0, h: 4 }, scale: -1, ySort: 'x' })]),
        { id: 'c', type: 'collision', name: 'c', children: [{ id: 's', type: 'collisionShape', name: '', closed: 'yes', points: [{ x: 'a', y: 1 }] }] },
        ent('e', { components: { Transform: { x: 0, y: 0 }, Nope: {} } }),
        tile('u', { data: { 1: { tilesetId: 'missing.png', x: 0, y: 0 } } }),
      ]),
      { tilesets }
    )
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('index out of range'),
        expect.stringContaining('key is not a non-negative integer'),
        expect.stringContaining('needs exactly one of assetId'),
        expect.stringContaining('crop must be whole numbers'),
        expect.stringContaining('scale must be a positive number'),
        expect.stringContaining('ySort must be true or false'),
        expect.stringContaining('closed must be a boolean'),
        expect.stringContaining('point 0: x and y must be finite numbers'),
        expect.stringContaining('unknown component type "Nope"'),
        expect.stringContaining('unknown tileset "missing.png"'),
      ])
    )
  })

  it('warns about shapes that are too small, a look where none is exported, several terrain layers and equal layer names', () => {
    const warnings = warningsOf(
      tree([
        { id: 'c', type: 'collision', name: 'c', children: [{ id: 's', type: 'collisionShape', name: '', closed: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }] },
        { id: 'c2', type: 'collision', name: 'c2', children: [] },
        { id: 't1', type: 'terrain', name: 'same', look: { default: {} } },
        { id: 't2', type: 'terrain', name: 'same' },
      ])
    )
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('too few points'),
        expect.stringContaining('only tile and image layers and pictures have a look'),
        '2 terrain layers; a map has one',
        '2 layers will be exported with the same name "same"',
      ])
    )
  })

  it('checks tileset names that would collapse, across the tree', () => {
    const sets = [{ name: 'same', fileName: 'a.png', width: 64, height: 64 }, { name: 'same', fileName: 'b.png', width: 64, height: 64 }]
    const m = tree([tile('a', { data: { 0: { tilesetId: 'a.png', x: 0, y: 0 } } }), group('g', [tile('b', { data: { 1: { tilesetId: 'b.png', x: 0, y: 0 } } })])])
    expect(errorsOf(m, { tilesets: sets })).toEqual([expect.stringContaining('share the name "same"')])
  })
})

describe('convertEditorMapToTiled: trees', () => {
  const layerNames = (m: any) => convertEditorMapToTiled(m, tilesets).layers.map((l) => l.name)

  it('writes the layers in list order (top first): the last node of the tree is the first layer', () => {
    const m = tree([tile('a'), group('g', [tile('b'), tile('c')]), tile('d')])
    expect(layerNames(m)).toEqual(['d', 'c', 'b', 'a'])
  })

  it('a hidden group hides every layer below it, and a layer hidden on its own stays hidden', () => {
    const m = tree([tile('a', { visible: false }), group('g', [tile('b'), group('h', [tile('c')], { visible: false })], {}), group('hid', [tile('d'), tile('e', { visible: false })], { visible: false })])
    const out = convertEditorMapToTiled(m, tilesets)
    expect(Object.fromEntries(out.layers.map((l) => [l.name, l.visible]))).toEqual({ a: false, b: true, c: false, d: false, e: false })
  })

  it('folds y-sort down the tree: picture, group, image layer, groups above', () => {
    const m = tree([
      group('outer', [
        image('layer', [pic('a'), pic('b', { ySort: false }), group('on', [pic('c'), pic('d', { ySort: false })], { ySort: true }), group('plain', [pic('e')])], {}),
        image('own', [pic('f')], { ySort: false }),
      ], { ySort: true }),
      image('none', [pic('g')]),
    ])
    const sorted = (layer: string) =>
      convertEditorMapToTiled(m, tilesets).layers.find((l) => l.name === layer)!.objects!.map((o) => [o.name, o.properties!.some((p) => p.name === 'ySort')])
    expect(sorted('layer')).toEqual([['a.png', true], ['b.png', false], ['c.png', true], ['d.png', false], ['e.png', true]])
    expect(sorted('own')).toEqual([['f.png', false]])
    expect(sorted('none')).toEqual([['g.png', false]])
  })

  it('writes the pictures of an image layer in z order, ties in tree order, groups looked into', () => {
    const m = tree([image('i', [pic('a', { z: 2 }), group('g', [pic('b', { z: 1 }), pic('c', { z: 2 })]), pic('d', { z: 1 })])])
    expect(convertEditorMapToTiled(m, tilesets).layers[0].objects!.map((o) => o.name)).toEqual(['b.png', 'd.png', 'a.png', 'c.png'])
  })

  it('exports the entities of the whole tree, without the node-only fields', () => {
    const m = tree([group('Entities', [ent('a'), group('folder', [ent('b', { visible: false, locked: true })])]), tile('t'), ent('c')])
    const out = convertEditorMapToTiled(m, tilesets)
    expect(out.entities.map((e) => e.id)).toEqual(['a', 'b', 'c'])
    expect(out.entities[1]).not.toHaveProperty('type')
    expect(out.entities[1]).not.toHaveProperty('locked')
    expect((out.entities[1] as any).visible).toBe(false)
    expect(out.schemaVersion).toBe(6)
  })

  it('migrates legacy entities inside a tree on export', () => {
    const m = tree([ent('a', { components: { Transform: { x: 0, y: 0 }, Interactable: { message: 'hi' } } })])
    expect(Object.keys(convertEditorMapToTiled(m, tilesets).entities[0].components)).toEqual(['Transform', 'Event'])
  })

  it('collects the tilesets of every layer that holds tiles, in list order, in a tree or a legacy map', () => {
    const cell = (tilesetId: string) => ({ 0: { tilesetId, x: 0, y: 0 } })
    const nodes = [tile('a', { data: cell('grass.png') }), group('g', [{ id: 'c', type: 'collision', name: 'c', data: cell('__collision__'), children: [] }, tile('b', { data: cell('house.png') })])]
    expect(collectUsedTilesetIds(tree(nodes))).toEqual(['house.png', 'grass.png'])
    const legacy: EditorMap = { name: 'm', width: 2, height: 2, layers: [{ id: 'b', name: 'b', type: 'tile', visible: true, data: cell('house.png') }, { id: 'a', name: 'a', type: 'tile', visible: true, data: cell('grass.png') }] }
    expect(collectUsedTilesetIds(legacy)).toEqual(['house.png', 'grass.png'])
  })

  it('writes valid Tiled for the collision layers of a tree', () => {
    const m = tree([
      { id: 'c1', type: 'collision', name: 'walls', data: { 0: { tilesetId: '__collision__', x: 0, y: 0 } }, children: [{ id: 't', type: 'collisionTiles', name: 'T' }, { id: 's', type: 'collisionShape', name: '', closed: false, points: [{ x: 4, y: 4 }, { x: 8, y: 8 }] }] },
      { id: 'c2', type: 'collision', name: 'more', children: [] },
    ])
    const out = convertEditorMapToTiled(m, tilesets)
    expect(validateTiledMap(out).errors).toEqual([])
    expect(out.layers.map((l) => l.name)).toEqual(['collision', 'walls'])
    expect(out.layers.find((l) => l.name === 'collision')!.data![0]).toBeGreaterThan(0)
    expect(out.layers.find((l) => l.name === 'walls')!.objects![0].polyline).toEqual([{ x: 0, y: 0 }, { x: 4, y: 4 }])
  })
})

describe('reference scans: trees', () => {
  const nodes = [
    tile('ground', { name: 'ground', data: { 0: { tilesetId: 'grass.png', x: 0, y: 0 } } }),
    group('town', [image('sky', [pic('p1'), group('g', [pic('p2', { graphicId: undefined, assetId: 'objects/chest' })])], { name: 'Sky' }), ent('npc')]),
    { id: 'c', type: 'collision', name: 'walls', children: [] },
  ]
  const asTree = (): RefMap => ({ fileName: 'town.json', name: 'Town', nodes: nodes as any })

  it('finds tilesets, pictures, sprites and entities in a tree like it does in layers', () => {
    const index = buildReferenceIndex({ maps: [asTree()], characters: [] })
    expect(index.of({ table: 'tileset', id: 'grass.png' }).map((r) => r.label)).toEqual(['Town › layer ground'])
    expect(index.of({ table: 'graphic', id: 'p1.png' }).map((r) => r.label)).toEqual(['Town › layer Sky › image'])
    expect(index.of({ table: 'character', id: 'objects/chest' }).map((r) => r.where)).toEqual(['image-layer'])
    expect(index.of({ table: 'character', id: 'characters/oldman' }).map((r) => r.where)).toEqual(['sprite'])
    expect(characterIdsOfMap(asTree())).toEqual(['characters/oldman', 'objects/chest'])
  })

  it('gives the same references for a legacy map and its migrated tree', () => {
    const legacy: any = {
      fileName: 'm.json',
      name: 'M',
      layers: [
        { id: 'top', name: 'top', type: 'image', visible: true, images: [{ id: 'a', graphicId: 'a.png', x: 0, y: 0 }, { id: 'b', assetId: 'objects/chest', x: 0, y: 0 }] },
        { id: 'bottom', name: 'bottom', type: 'tile', visible: true, data: { 0: { tilesetId: 'grass.png', x: 0, y: 0 } } },
      ],
      entities: [{ id: 'e', name: 'E', x: 0, y: 0, components: { Transform: { x: 0, y: 0, depth: 10 }, Sprite: { asset: 'characters/oldman', animation: '' } } }],
    }
    const labels = (m: RefMap) => buildReferenceIndex({ maps: [m], characters: [] }).all.map((r) => `${r.target.table}:${r.target.id}|${r.where}|${r.label}`).sort()
    expect(labels(migrateMap(legacy).value as RefMap)).toEqual(labels(legacy))
  })

  it('rewrites tilesets, pictures and characters inside a tree, sharing what does not change', () => {
    const m = asTree()
    const tiles = rewriteTilesetId(m, 'grass.png', 'meadow.png')
    expect(tiles.changed).toBe(true)
    expect(JSON.stringify(tiles.map.nodes)).toContain('meadow.png')
    expect(tiles.map.nodes![1]).toBe(m.nodes![1])
    expect(rewriteTilesetId(m, 'nope.png', 'x.png').map).toBe(m)

    const pics = rewriteMapGraphicId(m, 'p1.png', 'q1.png')
    expect(pics.changed).toBe(true)
    expect(JSON.stringify(pics.map.nodes)).toContain('q1.png')
    expect(pics.map.nodes![0]).toBe(m.nodes![0])
    expect(rewriteMapGraphicId(m, 'nope.png', 'x.png').map).toBe(m)

    const chars = rewriteCharacterId(m, 'characters/oldman', 'characters/elder')
    expect(chars.changed).toBe(true)
    expect(JSON.stringify(chars.map.nodes)).toContain('characters/elder')
    const chest = rewriteCharacterId(m, 'objects/chest', 'objects/box')
    expect(JSON.stringify(chest.map.nodes)).toContain('objects/box')
    expect(rewriteCharacterId(m, 'characters/nobody', 'x').map).toBe(m)
  })
})
