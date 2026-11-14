// The scene tree of the open map and what is selected in it. The tree is the active map's `nodes`: this hook holds no copy
// of it, it reads the map and writes changes back through the map manager's synchronous setter (so several changes in one
// tick compose). Every change goes through `commit` (one history step, one save) or `commitView` (a list view change such as
// opening a group: saved with the map, no history step). The flat views (layers, entities, pictures, lookups by id) are
// `sceneIndex(nodes)`, computed once per tree identity.

import { useCallback, useMemo, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { MapData } from '@/types/editor'
import type { SceneNode } from '../../../../shared/sceneTree'
import { walkPanel } from '../../../../shared/sceneTree'
import { sceneIndex, type SceneIndex } from '@/lib/sceneIndex'
import {
  NO_SELECTION,
  clearSelection as clearSel,
  pruneSelection,
  sameView,
  selectMany as selectManyOf,
  selectNode,
  viewOf,
  type SceneSelection,
  type SelectMode,
  type SelectionView,
} from '@/lib/sceneSelection'
import { useSyncedState } from '@/hooks/useSyncedState'

const NO_NODES: SceneNode[] = []

export interface UseSceneTreeOptions {
  /** The open map (its `nodes` are the tree). */
  activeMap: MapData | null
  /** The open map, readable synchronously (event handlers, several changes in one tick). */
  getActiveMap: () => MapData | null
  /** Functional updates only. */
  setActiveMap: Dispatch<SetStateAction<MapData | null>>
  /** Called once per committed change, after the new tree is readable through `getNodes()`. */
  onCommitHistory?: (nodes: SceneNode[]) => void
}

export function useSceneTree({ activeMap, getActiveMap, setActiveMap, onCommitHistory }: UseSceneTreeOptions) {
  const nodes = activeMap?.nodes ?? NO_NODES
  const index = useMemo(() => sceneIndex(nodes), [nodes])

  /** The latest tree, readable synchronously. */
  const getNodes = useCallback(() => getActiveMap()?.nodes ?? NO_NODES, [getActiveMap])
  /** The index of the latest tree. */
  const getIndex = useCallback((): SceneIndex => sceneIndex(getNodes()), [getNodes])

  const commit = useCallback(
    (updater: (prev: SceneNode[]) => SceneNode[], onAfter?: (next: SceneNode[]) => void) => {
      // Computed from the live map, *outside* of any React updater: side effects below run exactly once.
      const prev = getNodes()
      const next = updater(prev)
      if (next === prev) return
      setActiveMap((m) => (m ? { ...m, nodes: next } : m))
      onCommitHistory?.(next)
      onAfter?.(next)
    },
    [getNodes, setActiveMap, onCommitHistory]
  )

  /** A change that is saved with the map but is not an undo step (opening and closing groups in the list). */
  const commitView = useCallback(
    (updater: (prev: SceneNode[]) => SceneNode[]) => {
      const prev = getNodes()
      const next = updater(prev)
      if (next === prev) return
      setActiveMap((m) => (m ? { ...m, nodes: next } : m))
    },
    [getNodes, setActiveMap]
  )

  // ── selection ─────────────────────────────────────────────────────────────
  const [selection, setSelectionState, selectionRef] = useSyncedState<SceneSelection>(NO_SELECTION)
  const getSelection = useCallback(() => selectionRef.current, [selectionRef])
  const setSelection = setSelectionState

  const viewRef = useRef<SelectionView | null>(null)
  const view = useMemo(() => {
    const next = viewOf(selection, index)
    if (sameView(viewRef.current, next)) return viewRef.current as SelectionView
    viewRef.current = next
    return next
  }, [selection, index])

  /** The ids of the rows the panel lists, top to bottom (closed groups hide theirs): the order a shift-click range runs in. */
  const rows = useMemo(() => walkPanel(nodes, { closed: true }).map((e) => e.node.id), [nodes])

  /** A click on a node: only it, added or removed (`toggle`), or the range to it (`range`). */
  const select = useCallback(
    (id: string, mode: SelectMode = 'replace') => {
      const tree = getNodes()
      const idx = sceneIndex(tree)
      const rowIds = mode === 'range' ? walkPanel(tree, { closed: true }).map((e) => e.node.id) : []
      setSelection((sel) => selectNode(sel, idx, id, mode, rowIds))
    },
    [getNodes, setSelection]
  )

  /** Exactly these nodes are selected. */
  const selectMany = useCallback(
    (primary: string | null, ids: readonly string[], openGroupId: string | null = null) => {
      setSelection((sel) => selectManyOf(sel, getIndex(), primary, ids, openGroupId))
    },
    [getIndex, setSelection]
  )

  const clearSelection = useCallback(() => setSelection((sel) => clearSel(sel)), [setSelection])

  /**
   * Drops selected ids that are no longer in the tree (after undo, delete, resize). With `fallback`, a selection that
   * emptied because of it goes to the topmost layer, like the active layer always did after an undo.
   */
  const pruneToTree = useCallback(
    (fallback = false) =>
      setSelection((sel) => {
        const idx = getIndex()
        const kept = pruneSelection(sel, idx)
        if (!fallback || kept.primary !== null || sel.primary === null) return kept
        const first = idx.layersTopFirst[0]
        return first ? selectNode(kept, idx, first.id) : kept
      }),
    [getIndex, setSelection]
  )

  return {
    nodes,
    getNodes,
    index,
    getIndex,
    commit,
    commitView,
    selection,
    getSelection,
    setSelection,
    view,
    rows,
    select,
    selectMany,
    clearSelection,
    pruneToTree,
  }
}

export type SceneTreeApi = ReturnType<typeof useSceneTree>
