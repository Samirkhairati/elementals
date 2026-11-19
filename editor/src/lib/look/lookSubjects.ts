// Pure helpers between looks and the editor's map data: reading and replacing the look of the map, a layer or a
// picture, editing the look of one profile, and the compiled looks the canvas draws with (cached by identity: looks
// are never mutated, every edit makes new objects).

import { compileLooks, type CompiledLook, type LookLayer } from '../../../../shared/look/compile'
import { resolveLook } from '../../../../shared/look/schema'
import type { Look, LookSet } from '../../../../shared/look/types'
import type { MapData } from '@/types/editor'
import { childrenOf, isContainer, lookNodeOf, updateNode, type LookNode, type SceneNode } from '../../../../shared/sceneTree'
import { sceneIndex } from '../sceneIndex'
import type { LookSubjectRef } from './lookView'

/** Nodes graded as a layer by their Look child: TileMaps, and Nodes (their Look grades the sprites below them). */
export const layerHasLook = (l: Pick<SceneNode, 'type'>): boolean => l.type === 'tile' || l.type === 'group' || l.type === 'ySort'

const subjectNode = (nodes: readonly SceneNode[], ref: Exclude<LookSubjectRef, { kind: 'map' }>): SceneNode | undefined =>
  sceneIndex(nodes).byId.get(ref.kind === 'layer' ? ref.layerId : ref.imageId)?.node

export function getLookSet(map: Pick<MapData, 'look'> | null, nodes: readonly SceneNode[], ref: LookSubjectRef): LookSet | undefined {
  if (ref.kind === 'map') return map?.look
  const node = subjectNode(nodes, ref)
  if (!node) return undefined
  if (ref.kind === 'layer') return layerHasLook(node) ? lookNodeOf(node)?.look : undefined
  return node.type === 'picture' ? lookNodeOf(node)?.look : undefined
}

/** The subject still exists (a layer / picture may have been deleted). */
export function subjectExists(nodes: readonly SceneNode[], ref: LookSubjectRef): boolean {
  if (ref.kind === 'map') return true
  const node = subjectNode(nodes, ref)
  if (!node) return false
  return ref.kind === 'layer' ? layerHasLook(node) : node.type === 'picture'
}

const withLook = <T extends { look?: LookSet }>(o: T, set: LookSet | undefined): T => {
  const { look: _old, ...rest } = o
  return (set ? { ...rest, look: set } : rest) as T
}

/**
 * The tree with the look of a layer or a picture replaced: written into its Look child, which is added (first, at the
 * back) when it has none. Undefined empties the look; a Look node the author added stays until it is deleted from the
 * tree. The same array when nothing changed.
 */
export function setNodeLook(nodes: SceneNode[], ref: Exclude<LookSubjectRef, { kind: 'map' }>, set: LookSet | undefined): SceneNode[] {
  const id = ref.kind === 'layer' ? ref.layerId : ref.imageId
  return updateNode(nodes, id, (n) => {
    if (!(layerHasLook(n) || n.type === 'picture') || !isContainer(n)) return n
    const current = lookNodeOf(n)
    if (current) {
      const next = set ?? {}
      if (current.look === next || (!set && !current.look.default && !current.look.profiles)) return n
      return { ...n, children: childrenOf(n).map((c) => (c === current ? { ...current, look: next } : c)) } as SceneNode
    }
    if (!set) return n
    const look: LookNode = { id: `${n.id}:look`, type: 'look', name: 'Look', look: set }
    return { ...n, children: [look, ...childrenOf(n)] } as SceneNode
  })
}

export const setMapLook = (map: MapData, set: LookSet | undefined): MapData => withLook(map, set)

/** The look a profile edits: its own, else (null) none yet. `profile` null = the default look. */
export function ownLook(set: LookSet | undefined, profile: string | null): Look | undefined {
  return profile === null ? set?.default : set?.profiles?.[profile]
}

/** A look set with the look of one profile (or the default, `profile` null) replaced; undefined when nothing is left. */
export function withProfileLook(set: LookSet | undefined, profile: string | null, look: Look | undefined): LookSet | undefined {
  const next: LookSet = { ...(set ?? {}) }
  if (profile === null) {
    if (look) next.default = look
    else delete next.default
  } else {
    const profiles = { ...(next.profiles ?? {}) }
    if (look) profiles[profile] = look
    else delete profiles[profile]
    if (Object.keys(profiles).length > 0) next.profiles = profiles
    else delete next.profiles
  }
  return next.default || next.profiles ? next : undefined
}

/** Renames a profile id in a look set (profiles renamed or deleted in the library). */
export function renameProfileIn(set: LookSet | undefined, from: string, to: string | null): LookSet | undefined {
  if (!set?.profiles?.[from]) return set
  const { [from]: moved, ...rest } = set.profiles
  return withProfileLook({ ...set, profiles: rest }, to, to ? moved : undefined) ?? (set.default ? { default: set.default } : undefined)
}

// ── what the canvas draws ──────────────────────────────────────────────────────────────────────────

let nextId = 1
const ids = new WeakMap<object, number>()
const idOf = (o: object) => {
  let id = ids.get(o)
  if (!id) ids.set(o, (id = nextId++))
  return id
}
const cache = new Map<string, CompiledLook>()
const CACHE_MAX = 256

/** compileLooks, remembered per look objects and sizes. */
export function compileCached(stack: readonly LookLayer[], options: { subjectSize: { w: number; h: number }; mapSize: { w: number; h: number } }): CompiledLook {
  const key = `${stack.map((l) => `${idOf(l.look)}${l.space[0]}`).join(',')}|${options.subjectSize.w}x${options.subjectSize.h}|${options.mapSize.w}x${options.mapSize.h}`
  let c = cache.get(key)
  if (!c) {
    c = compileLooks(stack, options)
    cache.set(key, c)
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!)
  }
  return c
}

/** The looks a picture is drawn with (its own Look, then the one its Node passes down) in a profile; empty = none. */
export function pictureStack(item: { look?: LookSet }, layer: { look?: LookSet }, profile: string | null): LookLayer[] {
  const own = resolveLook(item.look, profile)
  const outer = resolveLook(layer.look, profile)
  return [...(own ? [{ look: own, space: 'subject' as const }] : []), ...(outer ? [{ look: outer, space: 'world' as const }] : [])]
}

export function worldStack(set: LookSet | undefined, profile: string | null): LookLayer[] {
  const look = resolveLook(set, profile)
  return look ? [{ look, space: 'world' }] : []
}
