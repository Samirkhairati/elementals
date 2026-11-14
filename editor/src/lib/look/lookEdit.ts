// Pure helpers behind the Look panel: which subject the panel edits, editing one profile's look of it (a profile
// without its own look starts from a copy of the default), and fresh masks / components with sensible geometry.

import { lookId, MAX_COMPONENTS, MAX_MASKS } from '../../../../shared/look/schema'
import type { Look, LookAdjust, LookMask, LookSet, LookShadow, MaskComponent, MaskComponentType, MaskMode } from '../../../../shared/look/types'
import type { ImageItem, Layer } from '@/types/editor'
import { layerHasLook, ownLook, withProfileLook } from './lookSubjects'
import type { LookSubjectRef } from './lookView'

type Box = { x: number; y: number; w: number; h: number }

/** The subject the selection points at: the picked picture, else the active tile / image layer, else the map. */
export function selectedSubject(layers: readonly Layer[], activeLayerId: string | null, selectedImageId: string | null): LookSubjectRef {
  const layer = activeLayerId ? layers.find((l) => l.id === activeLayerId) : undefined
  if (!layer || !layerHasLook(layer)) return { kind: 'map' }
  if (layer.type === 'image' && selectedImageId && layer.images?.some((i) => i.id === selectedImageId)) {
    return { kind: 'picture', layerId: layer.id, imageId: selectedImageId }
  }
  return { kind: 'layer', layerId: layer.id }
}

export function findPicture(layers: readonly Layer[], ref: LookSubjectRef): ImageItem | undefined {
  if (ref.kind !== 'picture') return undefined
  return layers.find((l) => l.id === ref.layerId)?.images?.find((i) => i.id === ref.imageId)
}

/**
 * The look a profile edits, as the panel shows it: its own; else (a profile without one) the default's, which the
 * first edit copies into the profile.
 */
export function lookInView(set: LookSet | undefined, profile: string | null): { look: Look | undefined; inherited: boolean } {
  const own = ownLook(set, profile)
  if (own || profile === null) return { look: own, inherited: false }
  return { look: set?.default, inherited: !!set?.default }
}

/** True when a look holds nothing at all (removed rather than stored, for the default look). */
export function isEmptyLook(l: Look): boolean {
  return l.enabled !== false && !l.adjust && !l.masks?.length && !l.vignette && !l.grain && !l.shaders?.length && !l.preset && !l.shadow
}

/**
 * The look set after editing a profile's look. An emptied default look is removed; a profile's look is kept even
 * when empty (an empty profile look means "nothing", unlike no look, which means "same as the default").
 */
export function editLookSet(set: LookSet | undefined, profile: string | null, change: (look: Look) => Look | undefined): LookSet | undefined {
  const { look } = lookInView(set, profile)
  const next = change(look ?? {})
  const keep = next && (profile !== null || !isEmptyLook(next)) ? next : undefined
  return withProfileLook(set, profile, keep)
}

/** The look set casts a drop shadow in some profile. */
export const hasShadow = (set: LookSet | undefined): boolean => !!set?.default?.shadow || Object.values(set?.profiles ?? {}).some((l) => !!l.shadow)

/**
 * A look set with a drop shadow in every profile: the default look and each profile's own look that has none yet (a
 * profile with its own look does not see the default's, so it gets the shadow too).
 */
export function withShadowEverywhere(set: LookSet | undefined, shadow: LookShadow): LookSet {
  const add = (l: Look | undefined): Look => (l?.shadow ? l : { ...(l ?? {}), shadow: { ...shadow } })
  const profiles = set?.profiles ? Object.fromEntries(Object.entries(set.profiles).map(([id, l]) => [id, add(l)])) : undefined
  return { ...(set ?? {}), default: add(set?.default), ...(profiles ? { profiles } : {}) }
}

// ── adjustments ────────────────────────────────────────────────────────────────────────────────────

/** An adjustment set with some fields replaced; undefined values are removed, and an empty set becomes undefined. */
export function patchAdjust(a: LookAdjust | undefined, patch: Partial<LookAdjust>): LookAdjust | undefined {
  const next: Record<string, unknown> = { ...(a ?? {}) }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === 0 || (typeof v === 'object' && v !== null && Object.keys(v).length === 0)) delete next[k]
    else next[k] = v
  }
  return Object.keys(next).length > 0 ? (next as LookAdjust) : undefined
}

/** A look with its global adjustments replaced. */
export const withAdjust = (look: Look, adjust: LookAdjust | undefined): Look => {
  const { adjust: _old, ...rest } = look
  return adjust ? { ...rest, adjust } : rest
}

// ── masks ──────────────────────────────────────────────────────────────────────────────────────────

export const COMPONENT_LABELS: Record<MaskComponentType, string> = {
  all: 'Everything',
  linear: 'Linear gradient',
  radial: 'Radial gradient',
  rect: 'Marquee',
  brush: 'Brush',
  color: 'Colour range',
  luminance: 'Luminance range',
}

export const COMPONENT_ORDER: readonly MaskComponentType[] = ['brush', 'linear', 'radial', 'rect', 'color', 'luminance', 'all']

export const MODE_LABELS: Record<MaskMode, string> = { add: 'Add', subtract: 'Subtract', intersect: 'Intersect' }

const r1 = (v: number) => Math.round(v * 10) / 10

/** A new component of a type, placed in `box` (the mask's space: a picture's own pixels or the visible part of the map). */
export function newComponent(type: MaskComponentType, mode: MaskMode, box: Box): MaskComponent {
  const id = lookId('c')
  const cx = r1(box.x + box.w / 2)
  const cy = r1(box.y + box.h / 2)
  switch (type) {
    case 'linear':
      return { id, mode, type, x1: cx, y1: r1(box.y), x2: cx, y2: cy }
    case 'radial':
      return { id, mode, type, cx, cy, rx: r1(box.w / 4), ry: r1(box.h / 4), feather: 0.5 }
    case 'rect':
      return { id, mode, type, x: r1(box.x + box.w / 4), y: r1(box.y + box.h / 4), w: r1(box.w / 2), h: r1(box.h / 2), feather: 0, radius: 0 }
    case 'brush':
      return { id, mode, type, strokes: [] }
    case 'color':
      return { id, mode, type, color: '#808080', range: 30, softness: 50 }
    case 'luminance':
      return { id, mode, type, low: 0.5, high: 1, featherLow: 0.15, featherHigh: 0 }
    case 'all':
      return { id, mode, type }
  }
}

export function newMask(masks: readonly LookMask[], type: MaskComponentType, box: Box): LookMask {
  const taken = new Set(masks.map((m) => m.name))
  let n = masks.length + 1
  while (taken.has(`Mask ${n}`)) n++
  return { id: lookId('m'), name: `Mask ${n}`, components: [newComponent(type, 'add', box)], adjust: {} }
}

export const canAddMask = (look: Look | undefined): boolean => (look?.masks?.length ?? 0) < MAX_MASKS
export const canAddComponent = (look: Look | undefined): boolean => (look?.masks ?? []).reduce((n, m) => n + m.components.length, 0) < MAX_COMPONENTS

export function updateMask(look: Look, maskId: string, change: (m: LookMask) => LookMask | null): Look {
  const masks = (look.masks ?? []).flatMap((m) => {
    if (m.id !== maskId) return [m]
    const next = change(m)
    return next ? [next] : []
  })
  const { masks: _old, ...rest } = look
  return masks.length > 0 ? { ...rest, masks } : rest
}

export function updateComponent(mask: LookMask, componentId: string, change: (c: MaskComponent) => MaskComponent | null): LookMask {
  return { ...mask, components: mask.components.flatMap((c) => (c.id !== componentId ? [c] : (change(c) ?? []) as MaskComponent[])) }
}

/** Moves an item of a list by one place up (-1) or down (1). */
export function moveBy<T extends { id: string }>(list: readonly T[], id: string, by: -1 | 1): T[] {
  const i = list.findIndex((x) => x.id === id)
  const j = i + by
  if (i < 0 || j < 0 || j >= list.length) return [...list]
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}
