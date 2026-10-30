import { useCallback, useRef, useState } from 'react'
import {
  EMPTY_HISTORY,
  createHistory,
  pushSnapshot,
  redoHistory,
  undoHistory,
  type HistorySnapshot,
  type HistoryState,
} from '@/lib/history'

export type ApplySnapshot = (snapshot: HistorySnapshot) => void

export interface UseHistoryReturn {
  history: HistorySnapshot[]
  historyIndex: number
  /** Record a snapshot (layers + entities). No-op for duplicates / empty layer lists. */
  commitHistory: (snapshot: HistorySnapshot) => void
  /** Replace the whole history with a single initial snapshot, or clear it with `null`. */
  resetHistory: (snapshot: HistorySnapshot | null) => void
  /** Step back; `apply` receives a fresh clone of the target snapshot. Returns whether a step happened. */
  handleUndo: (apply: ApplySnapshot) => boolean
  handleRedo: (apply: ApplySnapshot) => boolean
}

export function useHistory(): UseHistoryReturn {
  const [state, setState] = useState<HistoryState>(EMPTY_HISTORY)
  const stateRef = useRef<HistoryState>(state)

  const update = useCallback((next: HistoryState) => {
    if (next === stateRef.current) return
    stateRef.current = next
    setState(next)
  }, [])

  const commitHistory = useCallback(
    (snapshot: HistorySnapshot) => update(pushSnapshot(stateRef.current, snapshot)),
    [update]
  )

  const resetHistory = useCallback(
    (snapshot: HistorySnapshot | null) => {
      const next = createHistory(snapshot)
      stateRef.current = next
      setState(next)
    },
    []
  )

  const handleUndo = useCallback(
    (apply: ApplySnapshot) => {
      const step = undoHistory(stateRef.current)
      if (!step.snapshot) return false
      update(step.state)
      apply(step.snapshot)
      return true
    },
    [update]
  )

  const handleRedo = useCallback(
    (apply: ApplySnapshot) => {
      const step = redoHistory(stateRef.current)
      if (!step.snapshot) return false
      update(step.state)
      apply(step.snapshot)
      return true
    },
    [update]
  )

  return {
    history: state.entries,
    historyIndex: state.index,
    commitHistory,
    resetHistory,
    handleUndo,
    handleRedo,
  }
}
