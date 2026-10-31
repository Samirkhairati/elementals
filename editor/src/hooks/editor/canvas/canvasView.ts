// Which entity visuals the canvas draws (the "View" toggle group in the toolbar). A tiny external store so the
// toolbar and the Konva canvas share it without touching the editor context; persisted per browser.

import { useSyncExternalStore } from 'react'

export interface CanvasViewSettings {
  /** Draw real sprites (off = placeholder tiles only). */
  sprites: boolean
  /** Draw collider footprints for every entity (the selected one is always shown). */
  colliders: boolean
  /** Draw name labels for every entity at high zoom (hover and selection always show one). */
  labels: boolean
  /** Event (lightning) badges on entities that have an Event. */
  badges: boolean
}

export const DEFAULT_CANVAS_VIEW: CanvasViewSettings = { sprites: true, colliders: true, labels: true, badges: true }

const STORAGE_KEY = 'elementals.canvasView'

function load(): CanvasViewSettings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (!raw) return DEFAULT_CANVAS_VIEW
    const parsed = JSON.parse(raw) as Partial<CanvasViewSettings>
    return {
      sprites: parsed.sprites !== false,
      colliders: parsed.colliders !== false,
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
  if (next.sprites === state.sprites && next.colliders === state.colliders && next.labels === state.labels && next.badges === state.badges) return
  state = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* storage unavailable: keep the in-memory value */
  }
  listeners.forEach((l) => l())
}

export function toggleCanvasView(key: keyof CanvasViewSettings) {
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
