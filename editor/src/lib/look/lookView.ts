// What the canvas shows of looks and what the Look panel edits: the profile in view (the top toolbar's Look menu,
// also the profile the panel edits), looks on / off, animation, the mask being edited and its overlay, the brush.
// A tiny external store like canvasView; the view switches are remembered per browser.

import { useSyncExternalStore } from 'react'

/** Whose look: the map's, a layer's or a picture's. */
export type LookSubjectRef = { kind: 'map' } | { kind: 'layer'; layerId: string } | { kind: 'picture'; layerId: string; imageId: string }

export const subjectKey = (s: LookSubjectRef): string => (s.kind === 'map' ? 'map' : s.kind === 'layer' ? `layer:${s.layerId}` : `picture:${s.layerId}:${s.imageId}`)

export interface BrushSettings {
  /** Radius in pixels of the mask's space. */
  size: number
  feather: number
  flow: number
  erase: boolean
}

export interface LookViewState {
  /** The profile shown on the canvas and edited in the Look panel (null = the default looks). */
  profile: string | null
  /** Looks are drawn at all. */
  enabled: boolean
  /** Animated shaders and grain move (the canvas redraws while on). */
  animate: boolean
  /** The mask being edited (its handles show on the canvas), and the part of it. */
  mask: { subject: string; maskId: string; componentId: string | null } | null
  /** How the edited mask is shown: not, as a red overlay, or black and white. */
  overlay: 'off' | 'overlay' | 'bw'
  brush: BrushSettings
  /** The Look panel edits this subject instead of following the selection. */
  pinned: LookSubjectRef | null
}

const STORAGE_KEY = 'elementals.lookView'

const DEFAULTS: LookViewState = {
  profile: null,
  enabled: true,
  animate: false,
  mask: null,
  overlay: 'overlay',
  brush: { size: 24, feather: 0.6, flow: 0.8, erase: false },
  pinned: null,
}

function load(): LookViewState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (!raw) return DEFAULTS
    const p = JSON.parse(raw) as Partial<LookViewState>
    return {
      ...DEFAULTS,
      profile: typeof p.profile === 'string' ? p.profile : null,
      enabled: p.enabled !== false,
      animate: p.animate === true,
      overlay: p.overlay === 'off' || p.overlay === 'bw' ? p.overlay : 'overlay',
      brush: { ...DEFAULTS.brush, ...(p.brush ?? {}) },
    }
  } catch {
    return DEFAULTS
  }
}

let state: LookViewState = load()
const listeners = new Set<() => void>()

export function getLookView(): LookViewState {
  return state
}

export function setLookView(patch: Partial<LookViewState> | ((s: LookViewState) => Partial<LookViewState>)): void {
  const p = typeof patch === 'function' ? patch(state) : patch
  const next = { ...state, ...p }
  if ((Object.keys(p) as (keyof LookViewState)[]).every((k) => next[k] === state[k])) return
  state = next
  try {
    const { profile, enabled, animate, overlay, brush } = state
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ profile, enabled, animate, overlay, brush }))
  } catch {
    /* storage unavailable: keep the in-memory value */
  }
  listeners.forEach((l) => l())
}

export function subscribeLookView(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useLookView(): LookViewState {
  return useSyncExternalStore(subscribeLookView, getLookView)
}

/** Tests: back to the defaults. */
export function resetLookView(patch: Partial<LookViewState> = {}): void {
  state = { ...DEFAULTS, ...patch }
  listeners.forEach((l) => l())
}
