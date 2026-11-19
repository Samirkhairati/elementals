/* eslint-disable @typescript-eslint/no-explicit-any -- loose JSON fixtures */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrateMap, migrateFlatMap } from '../../../shared/engine/migrate'
import { SCHEMA_VERSION } from '../../../shared/engine/types'
import { deterministicId } from '../../../shared/engine/ids'
import {
  ENTITIES_GROUP_ID,
  FLAT_SCHEMA_VERSION,
  entitiesOfMap,
  hasNodeTree,
  layersToNodes,
  migrateToNodeTree,
  nodesOfMap,
  picturesOfMap,
} from '../../../shared/sceneTreeMigrate'
import { allEntities, allPictures, canHold, findNode, walk, type CollisionLayerNode, type GroupNode, type ImageLayerNode, type SceneNode } from '../../../shared/sceneTree'
import { validateEditorMap } from '../../../shared/mapSchema'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectMaps = path.resolve(here, '../../../project/maps')
const fixtures = path.resolve(here, '../../../shared/fixtures/golden-export')

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'))
const real: [string, any][] = fs.readdirSync(projectMaps).filter((f) => f.endsWith('.json')).map((f) => [`project/maps/${f}`, readJson(path.join(projectMaps, f))])
const synthetic: [string, any][] = fs.readdirSync(fixtures).filter((f) => f.endsWith('.map.json')).map((f) => [`fixtures/${f}`, readJson(path.join(fixtures, f))])

// ── builders ────────────────────────────────────────────────────────────────

const layer = (id: string, type: string, extra: Record<string, unknown> = {}) => ({ id, name: id, type, visible: true, locked: false, ...extra })
const map = (extra: Record<string, unknown>) => ({ name: 'm', width: 4, height: 4, schemaVersion: 5, ...extra })
const ent = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, x: 16, y: 32, components: { Transform: { x: 16, y: 32, depth: 10 } }, ...extra })
const nodesOf = (m: any): SceneNode[] => migrateToNodeTree(m).value.nodes
/** The ids of the root nodes, in draw order. */
const rootIds = (m: any) => nodesOf(m).map((n: SceneNode) => n.id)
const childIds = (node: SceneNode | undefined) => ((node as GroupNode | undefined)?.children ?? []).map((c) => c.id)

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const v of Object.values(value)) deepFreeze(v)
  }
  return value
}

describe('migrateToNodeTree: layers', () => {
  it('turns layers (top first) into root nodes in draw order, with the Entities group on top', () => {
    const m = map({ layers: [layer('a', 'tile'), layer('b', 'terrain'), layer('c', 'encounters'), layer('d', 'objects')] })
    expect(rootIds(m)).toEqual(['d', 'c', 'b', 'a', ENTITIES_GROUP_ID])
  })

  it('removes the old fields, stamps schema 6 and keeps everything else', () => {
    const m = map({ fileName: 'x.json', folderPath: 'town', look: { default: {} }, settings: { playerZ: 3 }, pixelWidth: 100, layers: [], entities: [], entityFolders: [], entitiesIndex: 0 })
    const out = migrateToNodeTree(m)
    expect(out.changed).toBe(true)
    const v: any = out.value
    expect(v.schemaVersion).toBe(6)
    for (const gone of ['layers', 'entities', 'entityFolders', 'entitiesIndex']) expect(v).not.toHaveProperty(gone)
    expect(v).toMatchObject({ name: 'm', width: 4, height: 4, fileName: 'x.json', folderPath: 'town', look: { default: {} }, settings: { playerZ: 3 }, pixelWidth: 100 })
  })

  it('copies a tile layer: name, z, look and cells; visible / locked only when not the default', () => {
    const data = { 3: { tilesetId: 'a.png', x: 1, y: 2 } }
    const look = { default: { adjust: { exposure: 1 } } }
    const [n] = nodesOf(map({ layers: [layer('t', 'tile', { name: 'Ground', z: 4, look, data, visible: false, locked: true })] })) as any[]
    expect(n).toEqual({ id: 't', type: 'tile', name: 'Ground', visible: false, locked: true, z: 4, data, look })
    expect(n.data).toBe(data)
    const [plain] = nodesOf(map({ layers: [layer('t', 'tile')] })) as any[]
    expect(plain).toEqual({ id: 't', type: 'tile', name: 't' })
    // only tile layers keep a look
    const [terrain] = nodesOf(map({ layers: [layer('x', 'terrain', { look, data: {}, z: 1 })] })) as any[]
    expect(terrain).toEqual({ id: 'x', type: 'terrain', name: 'x', z: 1, data: {} })
  })

  it('skips things that are not layers and layers without a known type', () => {
    const m = map({ layers: [layer('a', 'tile'), null, 7, layer('b', 'mystery'), layer('c', 'tile')] })
    expect(rootIds(m)).toEqual(['c', 'a', ENTITIES_GROUP_ID])
    expect(rootIds({ name: 'm' })).toEqual([ENTITIES_GROUP_ID])
  })

  it('gives layers without a usable id a deterministic one, and renames a duplicate id', () => {
    const m = map({ layers: [layer('', 'tile'), { name: 'x', type: 'tile', visible: true }, layer('dup', 'tile'), layer('dup', 'tile')] })
    const ids = rootIds(m)
    expect(new Set(ids).size).toBe(5)
    expect(ids).toEqual(rootIds(m)) // deterministic
    expect(ids).toContain('dup')
  })
})

describe('migrateToNodeTree: folders', () => {
  const m = map({
    layers: [
      layer('top', 'tile'),
      layer('F', 'folder', { collapsed: true, ySort: true, locked: true }),
      layer('a', 'tile', { folderId: 'F' }),
      layer('b', 'image', { folderId: 'F', images: [] }),
      layer('c', 'collision', { folderId: 'F' }),
      layer('bottom', 'tile'),
    ],
  })

  it('becomes a group holding its layers, in draw order, placed where the folder row was', () => {
    expect(rootIds(m)).toEqual(['bottom', 'F', 'top', ENTITIES_GROUP_ID])
    const group = findNode(nodesOf(m), 'F') as GroupNode
    expect(group).toMatchObject({ type: 'group', name: 'F', collapsed: true, ySort: true, locked: true })
    expect(childIds(group)).toEqual(['c', 'b', 'a'])
    expect((group as any).visible).toBeUndefined()
  })

  it('a hidden folder stays hidden unless one of its layers is shown, so nothing changes on screen', () => {
    const hidden = map({ layers: [layer('F', 'folder', { visible: false }), layer('a', 'tile', { folderId: 'F', visible: false }), layer('b', 'tile', { folderId: 'F', visible: false })] })
    expect((findNode(nodesOf(hidden), 'F') as any).visible).toBe(false)
    const mixed = map({ layers: [layer('F', 'folder', { visible: false }), layer('a', 'tile', { folderId: 'F', visible: false }), layer('b', 'tile', { folderId: 'F' })] })
    expect((findNode(nodesOf(mixed), 'F') as any).visible).toBeUndefined()
    expect((findNode(nodesOf(mixed), 'a') as any).visible).toBe(false)
    const empty = map({ layers: [layer('F', 'folder', { visible: false })] })
    expect((findNode(nodesOf(empty), 'F') as any).visible).toBe(false)
  })

  it('keeps layers that cannot sit in a folder, or whose folder is missing, at the top level', () => {
    const odd = map({ layers: [layer('F', 'folder'), layer('t', 'terrain', { folderId: 'F' }), layer('a', 'tile', { folderId: 'nope' }), layer('b', 'tile', { folderId: 'a' })] })
    expect(rootIds(odd)).toEqual(['b', 'a', 't', 'F', ENTITIES_GROUP_ID])
    expect(childIds(findNode(nodesOf(odd), 'F'))).toEqual([])
  })

  it('collects the members wherever they are in the list', () => {
    const scattered = map({ layers: [layer('a', 'tile', { folderId: 'F' }), layer('x', 'tile'), layer('F', 'folder'), layer('b', 'tile', { folderId: 'F' })] })
    expect(rootIds(scattered)).toEqual(['F', 'x', ENTITIES_GROUP_ID])
    expect(childIds(findNode(nodesOf(scattered), 'F'))).toEqual(['b', 'a'])
  })
})

describe('migrateToNodeTree: the Entities row', () => {
  const layers = () => [layer('a', 'tile'), layer('b', 'tile'), layer('F', 'folder'), layer('m1', 'tile', { folderId: 'F' }), layer('m2', 'tile', { folderId: 'F' }), layer('c', 'tile')]
  const order = (entitiesIndex?: number) => rootIds(map({ layers: layers(), ...(entitiesIndex === undefined ? {} : { entitiesIndex }) }))
  const E = ENTITIES_GROUP_ID

  it('goes on top when entitiesIndex is missing or 0, and below `entitiesIndex` layers otherwise', () => {
    expect(order()).toEqual(['c', 'F', 'b', 'a', E])
    expect(order(0)).toEqual(['c', 'F', 'b', 'a', E])
    expect(order(1)).toEqual(['c', 'F', 'b', E, 'a'])
    expect(order(2)).toEqual(['c', 'F', E, 'b', 'a'])
  })

  it('is never inside a folder: an index among its layers puts it just below the folder', () => {
    expect(order(3)).toEqual(['c', E, 'F', 'b', 'a'])
    expect(order(4)).toEqual(['c', E, 'F', 'b', 'a'])
    expect(order(5)).toEqual(['c', E, 'F', 'b', 'a'])
  })

  it('goes to the bottom when the index is past the list, and ignores garbage', () => {
    expect(order(6)).toEqual([E, 'c', 'F', 'b', 'a'])
    expect(order(99)).toEqual([E, 'c', 'F', 'b', 'a'])
    expect(order(-3)).toEqual(['c', 'F', 'b', 'a', E])
    expect(rootIds(map({ layers: layers(), entitiesIndex: 'x' }))).toEqual(['c', 'F', 'b', 'a', E])
    expect(rootIds(map({ layers: layers(), entitiesIndex: NaN }))).toEqual(['c', 'F', 'b', 'a', E])
  })

  it('is a group named Entities holding every entity in order, without the editor-only `folder`', () => {
    const m = map({ layers: [], entities: [ent('e1', { folder: null }), ent('e2', { visible: false }), ent('e3', { visible: true, folder: 'nope' }), 4, null] })
    const group = findNode(nodesOf(m), ENTITIES_GROUP_ID) as GroupNode
    expect(group).toMatchObject({ type: 'group', name: 'Entities' })
    expect(childIds(group)).toEqual(['e1', 'e2', 'e3'])
    const [e1, e2, e3] = group.children as any[]
    expect(e1).toEqual({ type: 'entity', ...ent('e1', {}) })
    expect(e1).not.toHaveProperty('folder')
    expect(e2.visible).toBe(false)
    expect(e3.visible).toBe(true)
    expect(e3).not.toHaveProperty('folder')
  })

  it('exists even with no entities, so its place in the stack is kept', () => {
    expect(childIds(findNode(nodesOf(map({ layers: [] })), ENTITIES_GROUP_ID))).toEqual([])
  })

  it('turns entity folders into groups inside it, each where its first entity is, empty ones in front', () => {
    const m = map({
      layers: [],
      entityFolders: [{ id: 'f1', name: 'NPCs', expanded: false }, { id: 'f2', name: 'Props', visible: false }, { id: 'f3', name: 'Empty' }, { id: 'f4', name: 'Also empty', expanded: true }],
      entities: [ent('e1'), ent('e2', { folder: 'f2' }), ent('e3', { folder: 'f1' }), ent('e4', { folder: 'f1' }), ent('e5'), ent('e6', { folder: 'f2' })],
    })
    const group = findNode(nodesOf(m), ENTITIES_GROUP_ID) as GroupNode
    expect(childIds(group)).toEqual(['f3', 'f4', 'e1', 'f2', 'f1', 'e5'])
    expect(childIds(findNode(group.children, 'f2'))).toEqual(['e2', 'e6'])
    expect(childIds(findNode(group.children, 'f1'))).toEqual(['e3', 'e4'])
    expect(findNode(group.children, 'f1')).toMatchObject({ type: 'group', name: 'NPCs', collapsed: true })
    expect(findNode(group.children, 'f2')).toMatchObject({ visible: false })
    expect((findNode(group.children, 'f2') as any).collapsed).toBeUndefined()
    expect((findNode(group.children, 'f4') as any).collapsed).toBeUndefined()
    expect(findNode(group.children, 'e3')).not.toHaveProperty('folder')
    expect(allEntities(group.children).map((e) => e.id)).toEqual(['e1', 'e2', 'e6', 'e3', 'e4', 'e5']) // interleaved folders pull their entities together
  })
})

describe('migrateToNodeTree: image layers', () => {
  const pic = (id: string, extra: Record<string, unknown> = {}) => ({ id, graphicId: `${id}.png`, x: 1, y: 2, ...extra })
  const imageNode = (images: unknown[], groups?: unknown[], extra: Record<string, unknown> = {}): ImageLayerNode =>
    nodesOf(map({ layers: [layer('L', 'image', { images, ...(groups ? { groups } : {}), ...extra })] }))[0] as ImageLayerNode

  it('holds the pictures as children in draw order: z first, array order for ties', () => {
    const node = imageNode([pic('a', { z: 5 }), pic('b'), pic('c', { z: -1 }), pic('d', { z: 5 }), pic('e')])
    expect(childIds(node)).toEqual(['c', 'b', 'e', 'a', 'd'])
    expect(node).toMatchObject({ type: 'image', name: 'L' })
  })

  it('copies the fields of a picture and gives it a name only when it has one', () => {
    const look = { default: { adjust: { exposure: 2 } } }
    const node = imageNode([
      { id: 'p', assetId: 'objects/chest', name: 'Chest', x: 3, y: 4, z: 2, scale: 2, flipX: true, flipY: false, opacity: 0.5, ySort: true, look },
      pic('q', { crop: { x: 0, y: 0, w: 8, h: 8 } }),
    ])
    const [q, p] = node.children as any[] // q has no z (0), p has z 2
    expect(p).toEqual({ id: 'p', type: 'picture', name: 'Chest', assetId: 'objects/chest', x: 3, y: 4, z: 2, scale: 2, flipX: true, flipY: false, opacity: 0.5, ySort: true, look })
    expect(q).toEqual({ id: 'q', type: 'picture', name: '', graphicId: 'q.png', crop: { x: 0, y: 0, w: 8, h: 8 }, x: 1, y: 2 })
  })

  it('turns picture groups into groups placed where their first picture is; empty groups go to the front', () => {
    const node = imageNode(
      [pic('a', { z: 1 }), pic('b', { z: 2, groupId: 'G1' }), pic('c', { z: 3 }), pic('d', { z: 4, groupId: 'G1' }), pic('e', { z: 5, groupId: 'G2' })],
      [{ id: 'G1', name: 'One', locked: true, ySort: false }, { id: 'G2', name: 'Two' }, { id: 'G3', name: 'Three' }, { id: 'G4', name: 'Four', ySort: true }]
    )
    expect(childIds(node)).toEqual(['G3', 'G4', 'a', 'G1', 'c', 'G2'])
    const g1 = findNode(node.children, 'G1') as GroupNode
    expect(g1).toMatchObject({ type: 'group', name: 'One', locked: true, ySort: false })
    expect(childIds(g1)).toEqual(['b', 'd'])
    expect(findNode(node.children, 'G4')).toMatchObject({ ySort: true, children: [] })
    expect((findNode(node.children, 'G2') as any).locked).toBeUndefined()
    expect(childIds(findNode(node.children, 'G2'))).toEqual(['e'])
  })

  it('treats a picture whose group does not exist as a loose picture', () => {
    const node = imageNode([pic('a', { groupId: 'nope' }), pic('b')], [{ id: 'G', name: 'G' }])
    expect(childIds(node)).toEqual(['G', 'a', 'b'])
  })

  it('keeps z, ySort and look of the layer', () => {
    const look = { default: {} }
    expect(imageNode([], undefined, { z: 9, ySort: false, look, visible: false })).toMatchObject({ z: 9, ySort: false, look, visible: false, children: [] })
  })

  it('gives picture ids that clash across layers a new, deterministic id', () => {
    const m = map({ layers: [layer('A', 'image', { images: [pic('same')] }), layer('B', 'image', { images: [pic('same')] })] })
    const pictures = allPictures(nodesOf(m)).map((p) => p.id)
    expect(new Set(pictures).size).toBe(2)
    expect(pictures).toEqual(allPictures(nodesOf(m)).map((p) => p.id))
  })
})

describe('migrateToNodeTree: collision layers', () => {
  const sh = (id: string, extra: Record<string, unknown> = {}) => ({ id, closed: true, points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], ...extra })
  const cell = (group?: string) => ({ tilesetId: '__collision__', x: 0, y: 0, ...(group ? { group } : {}) })

  it('holds the tiles items, then the shapes, as children', () => {
    const [n] = nodesOf(map({ layers: [layer('C', 'collision', { z: 3, tileGroups: [{ id: 'g1', name: 'Houses' }, { id: 'g2', name: 'Fences' }], data: { 1: cell('g1'), 2: cell('g2'), 3: cell() }, shapes: [sh('s1', { name: 'Pond' }), sh('s2', { closed: false })] })] })) as CollisionLayerNode[]
    expect(n).toMatchObject({ type: 'collision', z: 3 })
    expect(n.children).toEqual([
      { id: 'g1', type: 'collisionTiles', name: 'Houses' },
      { id: 'g2', type: 'collisionTiles', name: 'Fences' },
      { id: 's1', type: 'collisionShape', name: 'Pond', closed: true, points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] },
      { id: 's2', type: 'collisionShape', name: '', closed: false, points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] },
    ])
    expect(n.data).toEqual({ 1: cell('g1'), 2: cell('g2'), 3: cell() })
  })

  it('makes a polygons layer a collision layer, and gives painted cells without a tiles item one named Tiles', () => {
    const [shapes, painted] = nodesOf(map({ layers: [layer('P', 'polygons', { shapes: [sh('s1')] }), layer('C', 'collision', { data: { 4: cell() } })] })).slice(0, 2).reverse() as CollisionLayerNode[]
    expect(painted).toMatchObject({ type: 'collision', id: 'C' })
    expect(painted.children.map((c) => [c.type, c.name])).toEqual([['collisionTiles', 'Tiles']])
    expect(shapes).toMatchObject({ type: 'collision', id: 'P' })
    expect(shapes.children.map((c) => c.type)).toEqual(['collisionShape'])
  })

  it('renames a tiles item whose id is taken by another layer, and its cells follow', () => {
    const tiles = [{ id: 'tiles', name: 'Tiles' }]
    const m = map({ layers: [layer('B', 'collision', { tileGroups: tiles, data: { 2: cell('tiles') } }), layer('A', 'collision', { tileGroups: tiles, data: { 1: cell('tiles'), 3: cell() } })] })
    const nodes = nodesOf(m)
    const a = findNode(nodes, 'A') as CollisionLayerNode
    const b = findNode(nodes, 'B') as CollisionLayerNode
    expect(b.children[0].id).toBe('tiles') // the layer first in the list keeps the id
    expect(a.children[0].id).not.toBe('tiles')
    expect(a.children[0].name).toBe('Tiles')
    expect(a.data![1].group).toBe(a.children[0].id)
    expect(a.data![3].group).toBeUndefined() // belongs to the first item anyway
    expect(b.data![2].group).toBe('tiles')
    expect(a.children[0].id).toBe((findNode(nodesOf(m), 'A') as CollisionLayerNode).children[0].id) // deterministic
  })
})

describe('migrateToNodeTree: purity', () => {
  it('never mutates its input, and is idempotent', () => {
    const m = deepFreeze(
      map({
        layers: [layer('F', 'folder'), layer('a', 'image', { folderId: 'F', images: [{ id: 'p', graphicId: 'x.png', x: 0, y: 0, groupId: 'G' }], groups: [{ id: 'G', name: 'G' }] }), layer('c', 'collision', { data: { 1: { tilesetId: '__collision__', x: 0, y: 0 } } })],
        entities: [ent('e', { folder: 'ef' })],
        entityFolders: [{ id: 'ef', name: 'F' }],
        entitiesIndex: 1,
      })
    )
    const once = migrateToNodeTree(m)
    const twice = migrateToNodeTree(once.value)
    expect(twice.changed).toBe(false)
    expect(twice.value).toBe(once.value)
    expect(migrateToNodeTree(m).value).toEqual(once.value) // deterministic
  })

  it('leaves anything that is not a legacy map alone', () => {
    for (const junk of [null, 7, 'x', []] as any[]) expect(migrateToNodeTree(junk)).toEqual({ value: junk, changed: false })
    const tree = { name: 'm', nodes: [], schemaVersion: 6 }
    expect(migrateToNodeTree(tree).value).toBe(tree)
    expect(hasNodeTree(tree)).toBe(true)
    expect(hasNodeTree({ layers: [] })).toBe(false)
    expect(hasNodeTree(null)).toBe(false)
  })

  it('keeps a newer schemaVersion', () => {
    expect((migrateToNodeTree({ schemaVersion: 99, layers: [] }).value as any).schemaVersion).toBe(99)
  })
})

describe('migrateMap (schema 6)', () => {
  it('turns a legacy map into a tree, migrating legacy entities first', () => {
    const legacy = map({ schemaVersion: undefined, layers: [layer('a', 'tile')], entities: [ent('sign', { components: { Transform: { x: 0, y: 0, depth: 10 }, Interactable: { message: 'hi' } } })] })
    delete (legacy as any).schemaVersion
    const r = migrateMap(legacy)
    expect(r.changed).toBe(true)
    const v: any = r.value
    expect(v.schemaVersion).toBe(SCHEMA_VERSION)
    expect(SCHEMA_VERSION).toBe(6)
    const [sign] = allEntities(v.nodes)
    expect(Object.keys(sign.components)).toEqual(['Transform', 'Event'])
  })

  it('passes a schema 6 map through unchanged (the same object), and is idempotent', () => {
    for (const [, m] of [...real, ...synthetic]) {
      const v6 = migrateMap(m).value
      const again = migrateMap(v6)
      expect(again.changed).toBe(false)
      expect(again.value).toBe(v6)
    }
  })

  it('migrates the entities of a tree and stamps the version, keeping what is already canonical', () => {
    const legacyEntity = { id: 'e', type: 'entity', name: 'e', x: 0, y: 0, components: { Transform: { x: 0, y: 0 }, PlayerControl: {}, SpriteView: { texture: 'player-walk' } } }
    const canonical = { id: 'ok', type: 'entity', name: 'ok', x: 0, y: 0, components: { Transform: { x: 0, y: 0, depth: 10 } } }
    const tree = { name: 'm', width: 1, height: 1, schemaVersion: 5, nodes: [{ id: 'g', type: 'group', name: 'g', children: [legacyEntity, canonical] }] }
    const r = migrateMap(tree)
    expect(r.changed).toBe(true)
    const v: any = r.value
    expect(v.schemaVersion).toBe(6)
    const [e, ok] = allEntities(v.nodes)
    expect(e.components.Movement).toMatchObject({ controller: 'player' })
    expect(e.type).toBe('entity')
    expect(ok).toBe(canonical)
    expect(migrateMap({ ...tree, schemaVersion: 99 }).value.schemaVersion).toBe(99)
    expect(tree.nodes[0].children[0]).toBe(legacyEntity)
  })

  it('leaves garbage alone', () => {
    expect(migrateMap(null as any)).toEqual({ value: null, changed: false })
    expect(migrateMap([] as any).changed).toBe(false)
  })

  it('migrateFlatMap stops at the schema 5 shape', () => {
    const r = migrateFlatMap(map({ schemaVersion: undefined, layers: [layer('p', 'polygons')], entities: [] }) as any)
    expect(r.value.schemaVersion).toBe(FLAT_SCHEMA_VERSION)
    expect((r.value as any).layers[0].type).toBe('collision')
    expect(r.value).not.toHaveProperty('nodes')
  })
})

describe('reading a map of any schema', () => {
  it('returns the nodes, or the tree the layers migrate to, and the pictures and entities in it', () => {
    const legacy = map({ layers: [layer('i', 'image', { images: [{ id: 'p', graphicId: 'a.png', x: 0, y: 0 }] })], entities: [ent('e')] })
    const v6 = migrateMap(legacy).value as any
    expect(nodesOfMap(v6)).toBe(v6.nodes)
    expect(nodesOfMap(legacy)).toEqual(v6.nodes)
    expect(picturesOfMap(legacy).map((p) => p.id)).toEqual(['p'])
    expect(picturesOfMap(v6).map((p) => p.id)).toEqual(['p'])
    expect(entitiesOfMap(legacy).map((e) => e.id)).toEqual(['e'])
    expect(nodesOfMap(null)).toEqual([])
    expect(layersToNodes({}).map((n) => n.id)).toEqual([ENTITIES_GROUP_ID])
  })
})

// ── every map in the project and the fixtures ───────────────────────────────

describe.each([...real, ...synthetic])('%s', (_name, source) => {
  const v6: any = migrateMap(source).value
  const frozenCopy = () => deepFreeze(structuredClone(source))

  it('migrates without touching its source, to a valid tree of unique ids', () => {
    const before = JSON.stringify(source)
    expect(() => migrateMap(frozenCopy())).not.toThrow()
    expect(JSON.stringify(source)).toBe(before)
    expect(v6.schemaVersion).toBe(6)
    for (const gone of ['layers', 'entities', 'entityFolders', 'entitiesIndex']) expect(v6).not.toHaveProperty(gone)
    const ids = walk(v6.nodes).map((e) => e.node.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(validateEditorMap(v6).errors).toEqual([])
  })

  it('obeys the placement rules everywhere', () => {
    for (const { node, ancestors } of walk(v6.nodes)) expect(canHold(ancestors, node.type), `${node.type} ${node.id}`).toBe(true)
  })

  it('keeps every layer, picture and entity', () => {
    const layers = (source.layers ?? []).filter((l: any) => l.type !== 'folder')
    const nodes: SceneNode[] = v6.nodes
    expect(walk(nodes).filter((e) => ['tile', 'image', 'collision', 'terrain', 'encounters', 'objects'].includes(e.node.type)).length).toBe(layers.length)
    expect(allPictures(nodes).length).toBe(layers.reduce((n: number, l: any) => n + (l.images?.length ?? 0), 0))
    expect(allEntities(nodes).map((e) => e.id).sort()).toEqual((source.entities ?? []).map((e: any) => e.id).sort())
  })
})

// ── a seeded random walk over legacy maps ───────────────────────────────────

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomLegacyMap(seed: number): any {
  const rnd = mulberry32(seed)
  const int = (n: number) => Math.floor(rnd() * n)
  const pick = <T>(list: T[]) => list[int(list.length)]
  let n = 0
  const id = (p: string) => `${p}${++n}`
  const layers: any[] = []
  const folders: string[] = []
  for (let i = 0, count = 2 + int(7); i < count; i++) {
    const kind = pick(['tile', 'tile', 'image', 'image', 'collision', 'polygons', 'terrain', 'folder'])
    const lid = id('L')
    const flags = { visible: rnd() > 0.2, locked: rnd() > 0.8 }
    const folderId = folders.length > 0 && rnd() > 0.5 ? pick(folders) : undefined
    if (kind === 'folder') {
      folders.push(lid)
      layers.push({ id: lid, name: lid, type: 'folder', ...flags, ...(rnd() > 0.5 ? { collapsed: true } : {}), ...(rnd() > 0.5 ? { ySort: rnd() > 0.5 } : {}) })
    } else if (kind === 'image') {
      const groups = Array.from({ length: int(4) }, () => ({ id: id('G'), name: 'g', ...(rnd() > 0.7 ? { locked: true } : {}), ...(rnd() > 0.5 ? { ySort: rnd() > 0.5 } : {}) }))
      const images = Array.from({ length: int(6) }, () => ({
        id: id('P'),
        graphicId: `${int(5)}.png`,
        x: int(100),
        y: int(100),
        ...(rnd() > 0.4 ? { z: int(4) - 1 } : {}),
        ...(groups.length > 0 && rnd() > 0.4 ? { groupId: pick(groups).id } : {}),
        ...(rnd() > 0.7 ? { ySort: rnd() > 0.5 } : {}),
      }))
      layers.push({ id: lid, name: lid, type: 'image', ...flags, images, ...(groups.length > 0 ? { groups } : {}), ...(folderId ? { folderId } : {}), ...(rnd() > 0.5 ? { z: int(10) } : {}) })
    } else if (kind === 'collision' || kind === 'polygons') {
      const tileGroups = kind === 'collision' ? Array.from({ length: int(3) }, () => ({ id: id('T'), name: 't' })) : []
      const data: Record<number, any> = {}
      for (let k = 0; k < int(5); k++) data[int(16)] = { tilesetId: '__collision__', x: 0, y: 0, ...(tileGroups.length > 0 && rnd() > 0.3 ? { group: pick(tileGroups).id } : {}) }
      const shapes = Array.from({ length: int(3) }, () => ({ id: id('S'), closed: rnd() > 0.5, points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }] }))
      layers.push({ id: lid, name: lid, type: kind, ...flags, ...(kind === 'collision' ? { data, ...(tileGroups.length > 0 ? { tileGroups } : {}) } : {}), shapes, ...(folderId && kind === 'collision' ? { folderId } : {}) })
    } else {
      layers.push({ id: lid, name: lid, type: kind, ...flags, data: {}, ...(folderId && kind === 'tile' ? { folderId } : {}), ...(rnd() > 0.5 ? { z: int(5) } : {}) })
    }
  }
  const entityFolders = Array.from({ length: int(3) }, () => ({ id: id('EF'), name: 'ef', ...(rnd() > 0.5 ? { expanded: false } : {}), ...(rnd() > 0.7 ? { visible: false } : {}) }))
  const entities = Array.from({ length: int(5) }, () => ent(id('E'), { ...(entityFolders.length > 0 && rnd() > 0.4 ? { folder: pick(entityFolders).id } : {}), ...(rnd() > 0.7 ? { visible: false } : {}) }))
  return { name: `r${seed}`, width: 4, height: 4, schemaVersion: 5, layers, entities, entityFolders, ...(rnd() > 0.3 ? { entitiesIndex: int(layers.length + 2) } : {}) }
}

describe('random legacy maps', () => {
  for (let seed = 1; seed <= 150; seed++) {
    it(`seed ${seed}: migrates to a valid tree, deterministically, and is idempotent`, () => {
      const source = randomLegacyMap(seed)
      const v6: any = migrateMap(source).value
      const ids = walk(v6.nodes).map((e) => e.node.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const { node, ancestors } of walk(v6.nodes)) expect(canHold(ancestors, node.type)).toBe(true)
      expect(migrateMap(structuredClone(source)).value).toEqual(v6)
      expect(migrateMap(v6).value).toBe(v6)
    })
  }
})

describe('ids', () => {
  it('generated ids are deterministic', () => {
    expect(ENTITIES_GROUP_ID).toBe(deterministicId('node-tree/entities-group'))
  })
})
