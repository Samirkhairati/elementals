// Maps as one tree of nodes (schema 6): `migrateToNodeTree` turns the layers, folders, picture groups, entity folders,
// collision items and the Entities row of schema 5 and older into `map.nodes`. See docs/node-tree-plan.md
// ("Implementation decisions") and docs/maps.md.
//
// It is pure and idempotent, never mutate their input and keep the very same object when there is nothing to do.
// Ids the migration makes are deterministic (`deterministicId`), so migrating the same map twice gives the same tree.
// Nothing is written back to disk until the author edits.
//
// Rules of `migrateToNodeTree` (the layer list is top first, the tree is in draw order, so the order is reversed):
//  * a layer becomes a root node (tile / image / collision / terrain / encounters / objects) with its own fields;
//  * a `folder` layer becomes a group holding the layers that point at it (`folderId`); only tile, image and collision
//    layers can sit in a folder; a folder that is hidden while one of its layers is shown stays shown (the layer's own
//    eye was set after the folder's, and the canvas always drew it), so nothing changes on screen;
//  * an image layer's `images` become `picture` children, in draw order (`z`, then array order), and its `groups` become
//    groups holding their pictures: a group sits where its first picture is, empty groups go to the front;
//  * a collision layer's `tileGroups` become `collisionTiles` children (the cells keep their `group`) and its `shapes`
//    become `collisionShape` children; old `polygons` layers are collision layers first (`migrateCollisionLayers`);
//  * all entities go into one group named "Entities" (`ENTITIES_GROUP_ID`) placed so that `entitiesIndex` layers are
//    above it (missing = on top); entity folders become groups inside it (`expanded: false` = collapsed), each where its
//    first entity is, empty ones in front; the editor-only entity field `folder` is dropped;
//  * ids are the old ids; an id that is already taken (two collision layers each with a tiles item "tiles") gets a new
//    deterministic one, and the cells of a renamed tiles item follow it.

import type { MigrateResult } from './engine/migrate.ts'
import { SCHEMA_VERSION } from './engine/types.ts'
import { deterministicId } from './engine/ids.ts'
import { isRecord } from './engine/util.ts'
import { migrateCollisionLayers } from './collisionLayers.ts'
import type {
  CollisionLayerNode,
  CollisionShapeNode,
  CollisionTilesNode,
  EntityNode,
  GroupNode,
  ImageLayerNode,
  NodeCells,
  PictureNode,
  SceneNode,
} from './sceneTree.ts'
import { allEntities, allPictures } from './sceneTree.ts'

/** The id of the group that holds the entities of a migrated map (the old Entities row). */
export const ENTITIES_GROUP_ID = deterministicId('node-tree/entities-group')
export const ENTITIES_GROUP_NAME = 'Entities'
/** The last schema version of maps made of `layers` and `entities` (before the node tree). */
export const FLAT_SCHEMA_VERSION = 5

type Rec = Record<string, unknown>

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

/** The properties of `source` named by `keys` that are set, in that order. */
function copyDefined(source: Rec, keys: readonly string[]): Rec {
  const out: Rec = {}
  for (const key of keys) if (source[key] !== undefined) out[key] = source[key]
  return out
}

/** `visible: false` and `locked: true` of a legacy row (the defaults are left out). */
const flagsOf = (row: Rec): Rec => ({ ...(row.visible === false ? { visible: false } : {}), ...(row.locked === true ? { locked: true } : {}) })

/** Hands out ids: the wanted one when it is free, else a deterministic replacement. */
class IdPool {
  private used = new Set<string>([ENTITIES_GROUP_ID])
  take(wanted: unknown, seed: string): string {
    if (typeof wanted === 'string' && wanted !== '' && !this.used.has(wanted)) {
      this.used.add(wanted)
      return wanted
    }
    const base = typeof wanted === 'string' && wanted !== '' ? `${seed}/${wanted}` : seed
    for (let n = 0; ; n++) {
      const id = deterministicId(`${base}#${n}`)
      if (!this.used.has(id)) {
        this.used.add(id)
        return id
      }
    }
  }
}

const CELL_LAYER_TYPES = ['tile', 'terrain', 'encounters', 'objects'] as const
const FOLDER_MEMBER_TYPES = ['tile', 'image', 'collision']

// ── v5 -> v6 ───────────────────────────────────────────────────────────────────────────────────────

function pictureNode(item: Rec, pool: IdPool, seed: string): PictureNode {
  return {
    id: pool.take(item.id, `${seed}/picture`),
    type: 'picture',
    name: str(item.name),
    ...copyDefined(item, ['assetId', 'graphicId', 'crop', 'x', 'y', 'z', 'scale', 'flipX', 'flipY', 'opacity', 'ySort', 'look']),
  } as PictureNode
}

function imageLayerNode(layer: Rec, id: string, pool: IdPool): ImageLayerNode {
  const items = (Array.isArray(layer.images) ? layer.images : []).filter(isRecord).map((item, index) => ({ item, index }))
  // Draw order inside the layer: z first, array order for ties.
  items.sort((a, b) => (typeof a.item.z === 'number' ? a.item.z : 0) - (typeof b.item.z === 'number' ? b.item.z : 0) || a.index - b.index)

  const groups = new Map<string, Rec>()
  for (const g of Array.isArray(layer.groups) ? layer.groups : []) if (isRecord(g) && typeof g.id === 'string' && g.id !== '' && !groups.has(g.id)) groups.set(g.id, g)

  const nodes = new Map<string, GroupNode>()
  const groupNode = (g: Rec): GroupNode => {
    const made: GroupNode = {
      id: pool.take(g.id, `${id}/group`),
      type: 'group',
      name: str(g.name, 'Group'),
      ...(g.locked === true ? { locked: true } : {}),
      ...(typeof g.ySort === 'boolean' ? { ySort: g.ySort } : {}),
      children: [],
    }
    nodes.set(str(g.id), made)
    return made
  }
  // Empty groups go to the front; the others sit where their first picture is.
  const used = new Set(items.map(({ item }) => item.groupId))
  const children: SceneNode[] = []
  for (const g of groups.values()) if (!used.has(g.id)) children.push(groupNode(g))
  for (const { item } of items) {
    const g = typeof item.groupId === 'string' ? groups.get(item.groupId) : undefined
    if (!g) {
      children.push(pictureNode(item, pool, id))
      continue
    }
    let node = nodes.get(str(g.id))
    if (!node) {
      node = groupNode(g)
      children.push(node)
    }
    node.children.push(pictureNode(item, pool, id))
  }

  return {
    id,
    type: 'image',
    name: str(layer.name),
    ...flagsOf(layer),
    ...copyDefined(layer, ['z', 'ySort', 'look']),
    children,
  } as ImageLayerNode
}

function collisionLayerNode(layer: Rec, id: string, pool: IdPool): CollisionLayerNode {
  const children: SceneNode[] = []
  const remap = new Map<string, string>()
  const seen = new Set<string>()
  for (const g of Array.isArray(layer.tileGroups) ? layer.tileGroups : []) {
    if (!isRecord(g)) continue
    const tilesId = pool.take(g.id, `${id}/tiles`)
    // The cells of a tiles item whose id was taken follow its new id (only the first item with an id owns the cells).
    if (typeof g.id === 'string' && tilesId !== g.id && !seen.has(g.id)) remap.set(g.id, tilesId)
    if (typeof g.id === 'string') seen.add(g.id)
    children.push({ id: tilesId, type: 'collisionTiles', name: str(g.name) } satisfies CollisionTilesNode)
  }
  for (const s of Array.isArray(layer.shapes) ? layer.shapes : []) {
    if (!isRecord(s)) continue
    children.push({
      id: pool.take(s.id, `${id}/shape`),
      type: 'collisionShape',
      name: str(s.name),
      points: Array.isArray(s.points) ? (s.points as CollisionShapeNode['points']) : [],
      closed: s.closed !== false,
    } satisfies CollisionShapeNode)
  }
  let data = layer.data as NodeCells | undefined
  if (remap.size > 0 && isRecord(data)) {
    const next: NodeCells = {}
    for (const [key, cell] of Object.entries(data)) next[key] = isRecord(cell) && typeof cell.group === 'string' && remap.has(cell.group) ? { ...cell, group: remap.get(cell.group) as string } : cell
    data = next
  }
  return {
    id,
    type: 'collision',
    name: str(layer.name),
    ...flagsOf(layer),
    ...(layer.z !== undefined ? { z: layer.z } : {}),
    ...(data !== undefined ? { data } : {}),
    children,
  } as CollisionLayerNode
}

/** One legacy layer (not a folder) as a node; null for anything that is not a layer kind. */
function layerNode(layer: Rec, pool: IdPool): SceneNode | null {
  const type = layer.type
  if (type === 'image' || type === 'collision' || (CELL_LAYER_TYPES as readonly unknown[]).includes(type)) {
    const id = pool.take(layer.id, 'layer')
    if (type === 'image') return imageLayerNode(layer, id, pool)
    if (type === 'collision') return collisionLayerNode(layer, id, pool)
    return {
      id,
      type,
      name: str(layer.name),
      ...flagsOf(layer),
      ...copyDefined(layer, ['z', 'data', ...(type === 'tile' ? ['look'] : [])]),
    } as SceneNode
  }
  return null
}

function entityNode(entity: Rec, pool: IdPool, index: number): EntityNode {
  const { folder: _folder, ...rest } = entity
  const id = pool.take(entity.id, `entity/${index}`)
  return { type: 'entity', ...rest, id, name: str(entity.name), components: isRecord(entity.components) ? entity.components : {} } as unknown as EntityNode
}

function entitiesGroup(entities: unknown, folders: unknown, pool: IdPool): GroupNode {
  const folderRecs = new Map<string, Rec>()
  for (const f of Array.isArray(folders) ? folders : []) if (isRecord(f) && typeof f.id === 'string' && f.id !== '' && !folderRecs.has(f.id)) folderRecs.set(f.id, f)
  const records = (Array.isArray(entities) ? entities : []).filter(isRecord)

  const made = new Map<string, GroupNode>()
  const folderNode = (f: Rec): GroupNode => {
    const g: GroupNode = {
      id: pool.take(f.id, 'entity-folder'),
      type: 'group',
      name: str(f.name, 'Folder'),
      ...(f.visible === false ? { visible: false } : {}),
      ...(f.expanded === false ? { collapsed: true } : {}),
      children: [],
    }
    made.set(str(f.id), g)
    return g
  }
  const used = new Set(records.map((e) => e.folder))
  const children: SceneNode[] = []
  for (const f of folderRecs.values()) if (!used.has(f.id)) children.push(folderNode(f))
  records.forEach((entity, index) => {
    const f = typeof entity.folder === 'string' ? folderRecs.get(entity.folder) : undefined
    if (!f) {
      children.push(entityNode(entity, pool, index))
      return
    }
    let g = made.get(str(f.id))
    if (!g) {
      g = folderNode(f)
      children.push(g)
    }
    g.children.push(entityNode(entity, pool, index))
  })
  return { id: ENTITIES_GROUP_ID, type: 'group', name: ENTITIES_GROUP_NAME, children }
}

/** The node tree of a map made of `layers` (top first), `entities`, `entityFolders` and `entitiesIndex`. */
export function layersToNodes(input: { layers?: unknown; entities?: unknown; entityFolders?: unknown; entitiesIndex?: unknown }): SceneNode[] {
  const pool = new IdPool()
  const layers = migrateCollisionLayers(Array.isArray(input.layers) ? input.layers : []).value.filter(isRecord)

  const folderIds = new Set(layers.filter((l) => l.type === 'folder' && typeof l.id === 'string').map((l) => l.id as string))
  const holds = (l: Rec) => typeof l.folderId === 'string' && folderIds.has(l.folderId) && FOLDER_MEMBER_TYPES.includes(str(l.type))
  const members = new Map<string, Rec[]>()
  for (const l of layers) if (holds(l)) members.set(l.folderId as string, [...(members.get(l.folderId as string) ?? []), l])

  // The units of the list that are not inside a folder (a folder is one unit with its layers), top first.
  const units = layers.map((layer, index) => ({ layer, index })).filter(({ layer }) => !holds(layer))
  const at = typeof input.entitiesIndex === 'number' && Number.isFinite(input.entitiesIndex) ? Math.max(0, Math.min(layers.length, Math.floor(input.entitiesIndex))) : 0
  const above = units.filter((u) => u.index < at)
  const below = units.filter((u) => u.index >= at)

  const topFirst: (SceneNode | null)[] = []
  const convert = (unit: { layer: Rec }): SceneNode | null => {
    const layer = unit.layer
    if (layer.type !== 'folder') return layerNode(layer, pool)
    const id = pool.take(layer.id, 'folder')
    const held = (members.get(str(layer.id)) ?? []).map((m) => layerNode(m, pool)).filter((n): n is SceneNode => n !== null)
    const anyShown = (members.get(str(layer.id)) ?? []).some((m) => m.visible !== false)
    return {
      id,
      type: 'group',
      name: str(layer.name),
      ...(layer.visible === false && !anyShown ? { visible: false } : {}),
      ...(layer.locked === true ? { locked: true } : {}),
      ...(layer.collapsed === true ? { collapsed: true } : {}),
      ...(typeof layer.ySort === 'boolean' ? { ySort: layer.ySort } : {}),
      children: held.reverse(),
    } as GroupNode
  }
  for (const u of above) topFirst.push(convert(u))
  topFirst.push(entitiesGroup(input.entities, input.entityFolders, pool))
  for (const u of below) topFirst.push(convert(u))
  return topFirst.filter((n): n is SceneNode => n !== null).reverse()
}

/** Whether a map is already a tree (schema 6). */
export const hasNodeTree = (map: unknown): boolean => isRecord(map) && Array.isArray(map.nodes)

/**
 * Schema 5 and older -> 6: `layers`, `entities`, `entityFolders` and `entitiesIndex` become `nodes` (the rules are at the
 * top of this file) and `schemaVersion` is stamped. A map that already has `nodes` comes back as it is.
 */
export function migrateToNodeTree<T extends object>(map: T): MigrateResult<T> {
  if (!isRecord(map) || hasNodeTree(map)) return { value: map, changed: false }
  const { layers, entities, entityFolders, entitiesIndex, ...rest } = map
  const nodes = layersToNodes({ layers, entities, entityFolders, entitiesIndex })
  const version = typeof rest.schemaVersion === 'number' && rest.schemaVersion > SCHEMA_VERSION ? rest.schemaVersion : SCHEMA_VERSION
  return { value: { ...rest, schemaVersion: version, nodes } as unknown as T, changed: true }
}

// ── reading a map either way ───────────────────────────────────────────────────────────────────────

/** The tree of a map of any schema: its `nodes`, or the tree its layers and entities migrate to (nothing is changed). */
export function nodesOfMap(map: unknown): SceneNode[] {
  if (!isRecord(map)) return []
  if (Array.isArray(map.nodes)) return map.nodes as SceneNode[]
  return layersToNodes(map)
}

/** Every picture of every image layer of a map of any schema, in tree order. */
export const picturesOfMap = (map: unknown): PictureNode[] => allPictures(nodesOfMap(map))

/** Every entity node of a map of any schema, in tree order. */
export const entitiesOfMap = (map: unknown): EntityNode[] => allEntities(nodesOfMap(map))
