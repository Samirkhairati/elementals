import { describe, it, expect } from 'vitest'
import {
  assignNewCells,
  cellGroupId,
  collisionItems,
  hasNewCells,
  migrateCollisionLayers,
  nextTileGroupName,
  removeCollisionItem,
  renameCollisionItem,
  tileGroupCells,
} from '../../../shared/collisionLayers'
import { migrateMap } from '../../../shared/engine/migrate'
import { convertEditorMapToTiled } from '../../../shared/mapExport'
import type { EditorLayer, EditorMap } from '../../../shared/mapTypes'

const M = { tilesetId: '__collision__', x: 0, y: 0 }
const square = { id: 's1', closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }
const line = { id: 's2', closed: false, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }

const layer = (over: Partial<EditorLayer> = {}): EditorLayer => ({ id: 'c', name: 'Collision', type: 'collision', visible: true, ...over })

describe('collision items', () => {
  const l = layer({
    data: { 0: M, 1: { ...M, group: 'b' }, 2: { ...M, group: 'gone' } },
    tileGroups: [
      { id: 'a', name: 'Walls' },
      { id: 'b', name: 'Water' },
    ],
    shapes: [square, line, { ...square, id: 's3', name: 'Rock' }],
  })

  it('a cell without a known item belongs to the first one', () => {
    expect(cellGroupId(l, {})).toBe('a')
    expect(cellGroupId(l, { group: 'gone' })).toBe('a')
    expect(cellGroupId(l, { group: 'b' })).toBe('b')
    expect(cellGroupId({ tileGroups: [] }, {})).toBeNull()
  })

  it('lists the tiles items with their cell counts, then the shapes (named by kind unless named)', () => {
    expect(collisionItems(l)).toEqual([
      { kind: 'tiles', id: 'a', name: 'Walls', count: 2 },
      { kind: 'tiles', id: 'b', name: 'Water', count: 1 },
      { kind: 'shape', id: 's1', name: 'Polygon 1', closed: true, count: 3 },
      { kind: 'shape', id: 's2', name: 'Line 1', closed: false, count: 2 },
      { kind: 'shape', id: 's3', name: 'Rock', closed: true, count: 3 },
    ])
    expect(tileGroupCells(l, 'a')).toEqual([0, 2])
  })

  it('removing a tiles item removes its cells; removing a shape removes only it', () => {
    const noWalls = removeCollisionItem(l, 'a')
    expect(noWalls.tileGroups).toEqual([{ id: 'b', name: 'Water' }])
    expect(noWalls.data).toEqual({ 1: { ...M, group: 'b' } })
    const noLine = removeCollisionItem(l, 's2')
    expect(noLine.shapes!.map((s) => s.id)).toEqual(['s1', 's3'])
    expect(noLine.data).toBe(l.data)
    expect(removeCollisionItem(l, 'nope')).toBe(l)
  })

  it('renames tiles items and shapes; a blank name changes nothing', () => {
    expect(renameCollisionItem(l, 'b', ' Sea ').tileGroups![1].name).toBe('Sea')
    expect(renameCollisionItem(l, 's2', 'Fence').shapes![1].name).toBe('Fence')
    expect(renameCollisionItem(l, 'b', '  ')).toBe(l)
  })

  it('names new tiles items Tiles, Tiles 2, ...', () => {
    expect(nextTileGroupName({})).toBe('Tiles')
    expect(nextTileGroupName({ tileGroups: [{ id: 'x', name: 'Tiles' }, { id: 'y', name: 'Tiles 3' }] })).toBe('Tiles 2')
  })

  it('after painting only the new cells join the item; old ones keep theirs', () => {
    const before = { data: { 0: M } }
    const painted = { 0: M, 5: M }
    expect(hasNewCells(before, painted)).toBe(true)
    expect(hasNewCells(before, { 0: M })).toBe(false)
    expect(assignNewCells(before, painted, 'g')).toEqual({ 0: M, 5: { ...M, group: 'g' } })
    expect(assignNewCells(before, before.data, 'g')).toBe(before.data)
  })
})

describe('migrateCollisionLayers', () => {
  it('turns an old polygons layer into a collision layer and gives painted cells a tiles item', () => {
    const layers = [
      { id: 'p', name: 'Shapes', type: 'polygons', visible: true, shapes: [square] },
      { id: 'c', name: 'Collision', type: 'collision', visible: true, data: { 0: M } },
      { id: 't', name: 'Ground', type: 'tile', visible: true, data: {} },
    ]
    const r = migrateCollisionLayers(layers)
    expect(r.changed).toBe(true)
    expect(r.value[0]).toMatchObject({ type: 'collision', shapes: [square] })
    expect(r.value[1]).toMatchObject({ tileGroups: [{ id: 'tiles', name: 'Tiles' }], data: { 0: M } })
    expect(r.value[2]).toBe(layers[2])
    // idempotent: a second pass changes nothing
    const again = migrateCollisionLayers(r.value)
    expect(again.changed).toBe(false)
    expect(again.value).toBe(r.value)
  })

  it('runs as part of migrateMap', () => {
    const map = { name: 'm', width: 1, height: 1, schemaVersion: 5, layers: [{ id: 'p', name: 'P', type: 'polygons', visible: true }] }
    expect(migrateMap(map).value.layers[0]).toMatchObject({ type: 'collision', shapes: [] })
  })
})

describe('exporting collision layers', () => {
  const map = (layers: EditorLayer[]): EditorMap => ({ name: 'm', width: 3, height: 1, layers })

  it('all collision layers paint into the one `collision` tile layer; each layer with shapes adds a collision objectgroup', () => {
    const tiled = convertEditorMapToTiled(
      map([
        layer({ id: 'a', name: 'Walls', data: { 0: M }, shapes: [square] }),
        { id: 't', name: 'Ground', type: 'tile', visible: true, data: {} },
        layer({ id: 'b', name: 'More', data: { 2: { ...M, group: 'x' } }, tileGroups: [{ id: 'x', name: 'X' }] }),
      ]),
      [],
    )
    expect(tiled.layers.map((l) => [l.name, l.type])).toEqual([
      ['collision', 'tilelayer'],
      ['Walls', 'objectgroup'],
      ['Ground', 'tilelayer'],
    ])
    const gid = tiled.tilesets.find((t) => t.name === 'collision_dummy')!.firstgid
    expect(tiled.layers[0].data).toEqual([gid, 0, gid])
    expect(tiled.layers.map((l) => l.id)).toEqual([1, 2, 3])
    expect(tiled.nextlayerid).toBe(4)
  })

  it('a map with only shapes gets no collision tile layer and no collision tileset', () => {
    const tiled = convertEditorMapToTiled(map([layer({ shapes: [square] })]), [])
    expect(tiled.layers.map((l) => l.type)).toEqual(['objectgroup'])
    expect(tiled.tilesets).toEqual([])
  })

  it('an old polygons layer exports like a collision layer', () => {
    const tiled = convertEditorMapToTiled(map([{ id: 'p', name: 'Shapes', type: 'polygons', visible: true, shapes: [square] }]), [])
    expect(tiled.layers).toHaveLength(1)
    expect(tiled.layers[0].properties).toEqual([{ name: 'kind', type: 'string', value: 'collision' }])
  })
})
