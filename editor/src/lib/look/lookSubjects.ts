// Pure helpers between looks and the editor's map data: reading and replacing the look of the map, a layer or a
// picture, editing the look of one profile, and the compiled looks the canvas draws with (cached by identity: looks
// are never mutated, every edit makes new objects).

import { compileLooks, type CompiledLook, type LookLayer } from '../../../../shared/look/compile'
import { resolveLook } from '../../../../shared/look/schema'
import type { Look, LookSet } from '../../../../shared/look/types'
import type { ImageItem, Layer, MapData } from '@/types/editor'
import type { LookSubjectRef } from './lookView'

/** Layers that can carry a look. */
export const layerHasLook = (l: Layer): boolean => l.type === 'tile' || l.type === 'image'

export function getLookSet(map: Pick<MapData, 'look'> | null, layers: readonly Layer[], ref: LookSubjectRef): LookSet | undefined {
  if (ref.kind === 'map') return map?.look
  const layer = layers.find((l) => l.id === ref.layerId)
  if (!layer) return undefined
  if (ref.kind === 'layer') return layer.look
  return layer.images?.find((i) => i.id === ref.imageId)?.look
}

/** The subject still exists (a layer / picture may have been deleted). */
export function subjectExists(layers: readonly Layer[], ref: LookSubjectRef): boolean {
  if (ref.kind === 'map') return true
  const layer = layers.find((l) => l.id === ref.layerId)
  if (!layer || !layerHasLook(layer)) return false
  return ref.kind === 'layer' || !!layer.images?.some((i) => i.id === ref.imageId)
}

const withLook = <T extends { look?: LookSet }>(o: T, set: LookSet | undefined): T => {
  const { look: _old, ...rest } = o
  return (set ? { ...rest, look: set } : rest) as T
}

/** The layers with a layer's or a picture's look replaced (undefined removes it); the same array when nothing changed. */
export function setLayerLook(layers: Layer[], ref: Exclude<LookSubjectRef, { kind: 'map' }>, set: LookSet | undefined): Layer[] {
  return layers.map((l) => {
    if (l.id !== ref.layerId) return l
    if (ref.kind === 'layer') return withLook(l, set)
    return { ...l, images: (l.images ?? []).map((i) => (i.id === ref.imageId ? withLook(i, set) : i)) }
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

/** The looks a picture is drawn with (its own, then its layer's) in a profile; empty = none. */
export function pictureStack(item: Pick<ImageItem, 'look'>, layer: Pick<Layer, 'look'>, profile: string | null): LookLayer[] {
  const own = resolveLook(item.look, profile)
  const outer = resolveLook(layer.look, profile)
  return [...(own ? [{ look: own, space: 'subject' as const }] : []), ...(outer ? [{ look: outer, space: 'world' as const }] : [])]
}

export function worldStack(set: LookSet | undefined, profile: string | null): LookLayer[] {
  const look = resolveLook(set, profile)
  return look ? [{ look, space: 'world' }] : []
}
