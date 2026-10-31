// Which entity visuals the canvas draws (the "View" toggle group in the toolbar). A tiny external store so the
// toolbar and the Konva canvas share it without touching the editor context; persisted per browser.

import { useSyncExternalStore } from 'react'

/** Tints for an entity's area overlay (border + faint fill), chosen per entity on its Tag. White is the default. */
export const OVERLAY_COLORS = [
  { id: '', label: 'White', rgb: '255,255,255' },
  { id: 'pink', label: 'Pink', rgb: '255,179,204' },
  { id: 'peach', label: 'Peach', rgb: '255,205,160' },
  { id: 'yellow', label: 'Yellow', rgb: '255,240,150' },
  { id: 'mint', label: 'Mint', rgb: '160,235,196' },
  { id: 'sky', label: 'Sky', rgb: '160,210,255' },
  { id: 'lavender', label: 'Lavender', rgb: '208,190,255' },
] as const

/** `r,g,b` for a Tag colour id (unknown or empty = white). */
export function overlayRgb(id: unknown): string {
  return (OVERLAY_COLORS.find((c) => c.id === id) ?? OVERLAY_COLORS[0]).rgb
}

/** The on/off switches of the View group (everything in the settings except the overlay colour). */
export type CanvasViewToggle = 'sprites' | 'labels' | 'badges'

export interface CanvasViewSettings {
  /** Draw real sprites (off = placeholder tiles only). */
  sprites: boolean
  /** Draw collider footprints for every entity (the selected one is always shown). */
  /** Draw name labels for every entity at high zoom (hover and selection always show one). */
  labels: boolean
  /** Event (lightning) badges on entities that have an Event. */
  badges: boolean
}

export const DEFAULT_CANVAS_VIEW: CanvasViewSettings = { sprites: true, labels: true, badges: true }

const STORAGE_KEY = 'elementals.canvasView'

function load(): CanvasViewSettings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (!raw) return DEFAULT_CANVAS_VIEW
    const parsed = JSON.parse(raw) as Partial<CanvasViewSettings>
    return {
      sprites: parsed.sprites !== false,
      labels: parsed.labels !== false,
      badges: parsed.badges !== false,
    }
  } catch {
    return DEFAULT_CANVAS_VIEW
  }
}

let state: CanvasViewSettings = load()
const listeners = new Set<() => void>()

export function getCanvasView(): CanvasViewSettings {
  return state
}

export function setCanvasView(patch: Partial<CanvasViewSettings>) {
  const next = { ...state, ...patch }
  if (next.sprites === state.sprites && next.labels === state.labels && next.badges === state.badges) return
  state = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* storage unavailable: keep the in-memory value */
  }
  listeners.forEach((l) => l())
}

export function toggleCanvasView(key: CanvasViewToggle) {
  setCanvasView({ [key]: !state[key] })
}

/** Test helper. */
export function resetCanvasView() {
  state = DEFAULT_CANVAS_VIEW
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useCanvasView(): CanvasViewSettings {
  return useSyncExternalStore(subscribe, getCanvasView, getCanvasView)
}
