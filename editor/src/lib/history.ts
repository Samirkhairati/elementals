import type { EntityData, Layer } from '@/types/editor'

/**
 * Pure undo/redo history model. Everything here is side-effect free so it can
 * be unit-tested without React; `useHistory` is a thin stateful wrapper.
 */

export interface HistorySnapshot {
  layers: Layer[]
  entities: EntityData[]
  /** Map size in tiles; only set from the editor, so that undoing a resize brings the old size back. */
  size?: { width: number; height: number }
}

/** The size to record in a snapshot for `map` (nothing when no map is open). */
export function mapSize(map: { width: number; height: number } | null | undefined): HistorySnapshot['size'] {
  return map ? { width: map.width, height: map.height } : undefined
}

export interface HistoryState {
  entries: HistorySnapshot[]
  index: number
}

export const MAX_HISTORY = 50

export const EMPTY_HISTORY: HistoryState = { entries: [], index: -1 }

export function cloneSnapshot(snapshot: HistorySnapshot): HistorySnapshot {
  const clone: HistorySnapshot = {
    layers: JSON.parse(JSON.stringify(snapshot.layers ?? [])),
    entities: JSON.parse(JSON.stringify(snapshot.entities ?? [])),
  }
  if (snapshot.size) clone.size = { ...snapshot.size }
  return clone
}

export function snapshotsEqual(a: HistorySnapshot | null | undefined, b: HistorySnapshot | null | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.size?.width === b.size?.width &&
    a.size?.height === b.size?.height &&
    JSON.stringify(a.layers ?? []) === JSON.stringify(b.layers ?? []) &&
    JSON.stringify(a.entities ?? []) === JSON.stringify(b.entities ?? [])
  )
}

/** Start a fresh history whose only entry is `initial` (or an empty one for `null`). */
export function createHistory(initial: HistorySnapshot | null): HistoryState {
  if (!initial) return EMPTY_HISTORY
  return { entries: [cloneSnapshot(initial)], index: 0 }
}

/**
 * Record `snapshot` as the newest entry. Returns the *same* state object when
 * nothing was recorded (empty layer list, or identical to the current entry).
 * Pushing while in the middle of the stack drops the redo tail.
 */
export function pushSnapshot(
  state: HistoryState,
  snapshot: HistorySnapshot,
  max: number = MAX_HISTORY
): HistoryState {
  if (!snapshot || !snapshot.layers || snapshot.layers.length === 0) return state

  const current = state.index >= 0 && state.index < state.entries.length ? state.entries[state.index] : null
  if (current && snapshotsEqual(current, snapshot)) return state

  const entries = state.entries.slice(0, state.index + 1)
  entries.push(cloneSnapshot(snapshot))
  while (entries.length > max) entries.shift()
  return { entries, index: entries.length - 1 }
}

export function canUndo(state: HistoryState): boolean {
  return state.index > 0
}

export function canRedo(state: HistoryState): boolean {
  return state.index < state.entries.length - 1
}

export interface HistoryStep {
  state: HistoryState
  /** A fresh clone of the snapshot to apply, or null when no step was possible. */
  snapshot: HistorySnapshot | null
}

export function undoHistory(state: HistoryState): HistoryStep {
  if (!canUndo(state)) return { state, snapshot: null }
  const index = state.index - 1
  return { state: { entries: state.entries, index }, snapshot: cloneSnapshot(state.entries[index]) }
}

export function redoHistory(state: HistoryState): HistoryStep {
  if (!canRedo(state)) return { state, snapshot: null }
  const index = state.index + 1
  return { state: { entries: state.entries, index }, snapshot: cloneSnapshot(state.entries[index]) }
}
