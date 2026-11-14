import type { SceneNode } from '../../../shared/sceneTree'
import type { LookSet } from '../../../shared/look/types'

/**
 * Pure undo/redo history model. Everything here is side-effect free so it can
 * be unit-tested without React; `useHistory` is a thin stateful wrapper.
 */

export interface HistorySnapshot {
  /** The map's scene tree (layers, groups, pictures, entities and collision items). */
  nodes: SceneNode[]
  /** Map size in tiles; only set from the editor, so that undoing a resize brings the old size back. */
  size?: { width: number; height: number }
  /** The whole map's look; only set from the editor (null = none), so undo brings an older map look back. */
  look?: LookSet | null
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
    nodes: JSON.parse(JSON.stringify(snapshot.nodes ?? [])),
  }
  if (snapshot.size) clone.size = { ...snapshot.size }
  if (snapshot.look !== undefined) clone.look = snapshot.look === null ? null : JSON.parse(JSON.stringify(snapshot.look))
  return clone
}

function withoutView(key: string, value: unknown) {
  return key === 'collapsed' ? undefined : value
}

export function snapshotsEqual(a: HistorySnapshot | null | undefined, b: HistorySnapshot | null | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.size?.width === b.size?.width &&
    a.size?.height === b.size?.height &&
    // Opening or closing a group in the list is a view change, not a step of its own.
    JSON.stringify(a.nodes ?? [], withoutView) === JSON.stringify(b.nodes ?? [], withoutView) &&
    JSON.stringify(a.look ?? null) === JSON.stringify(b.look ?? null)
  )
}

/** Start a fresh history whose only entry is `initial` (or an empty one for `null`). */
export function createHistory(initial: HistorySnapshot | null): HistoryState {
  if (!initial) return EMPTY_HISTORY
  return { entries: [cloneSnapshot(initial)], index: 0 }
}

/**
 * Record `snapshot` as the newest entry. Returns the *same* state object when
 * nothing was recorded (an empty tree, or identical to the current entry).
 * Pushing while in the middle of the stack drops the redo tail.
 */
export function pushSnapshot(
  state: HistoryState,
  snapshot: HistorySnapshot,
  max: number = MAX_HISTORY
): HistoryState {
  if (!snapshot || !snapshot.nodes || snapshot.nodes.length === 0) return state

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
