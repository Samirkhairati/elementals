// The layers of the open map on top of the scene tree (`useSceneTree`): which node is active, creating, copying, deleting,
// grouping and moving nodes, and the tile-painting state. The pictures of image layers are `useImageItems`, composed here
// so the editor sees one manager. Every change goes through the tree's `commit`.

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { snapshot, useEditorClipboard } from '@/store/editorClipboard'
import type { TileSelection, ActiveTool, PaintMode, DebugInfo } from '@/types/editor'
import {
  addNode,
  copiesOf,
  deleteNodes,
  duplicateNodes,
  expandTo,
  groupNodes,
  makeNode,
  newNodeName,
  pasteCopies,
  patchNode,
  renameNode,
  setCollapsed,
  setLocked,
  setVisible,
  setYSort,
  moveNodesTo,
  parentPathFor,
  ungroupNode,
  type DropWhere,
  type NewNodeType,
} from '@/lib/sceneOps'
import { sceneIndex } from '@/lib/sceneIndex'
import { NO_SELECTION, pruneSelection, selectNode, type SelectMode } from '@/lib/sceneSelection'
import { collisionLayerLike, insertNode, isBranch, isContainer, isLayerNode, updateNode, type CollisionShapeNode } from '../../../../shared/sceneTree'
import { nextTileGroupName } from '../../../../shared/collisionLayers'
import type { CollisionShape } from '../../../../shared/collisionShapes'
import { useImageItems } from './useImageItems'
import type { SceneTreeApi } from './useSceneTree'

const newId = () => crypto.randomUUID()

export function useLayerManager(tree: SceneTreeApi) {
  const { commit, commitView, getNodes, getIndex, getSelection, setSelection, view, index, select, selectMany } = tree

  /** Pinned: a right-drag samples every selected layer (not just the active one) and painting writes back to all of them. */
  const [pinSelection, setPinSelection] = useState(false)
  /** The node the last "new layer / group" made (and how many were made), so the list can open its name for typing. */
  const [justCreatedLayer, setJustCreatedLayer] = useState<{ id: string; n: number } | null>(null)
  const [tileSelection, setTileSelection] = useState<TileSelection | null>(null)
  const [activeTool, setActiveTool] = useState<ActiveTool>('brush')
  const [paintMode, setPaintMode] = useState<PaintMode>('discontinuous')
  const [isPainting, setIsPainting] = useState(false)
  const [paintStartPos, setPaintStartPos] = useState<{ x: number; y: number } | null>(null)
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null)

  const images = useImageItems(tree)

  const { activeLayerId, selectedLayerIds } = view

  /** Activating a layer drops the multi-selection (use `select` with a mode to extend it). `null` clears the selection. */
  const setActiveLayerId = useCallback(
    (id: string | null) => {
      if (id === null) setSelection((sel) => ({ ...sel, ids: [], primary: null, anchor: null, openGroupId: null }))
      else select(id)
    },
    [select, setSelection]
  )

  /** A click on a layer row or picture: only it, added or removed (`toggle`), or the range to it (`range`). `additive` is the old boolean | 'range' form. */
  const selectLayer = useCallback((id: string, additive: boolean | 'range' | SelectMode = false) => select(id, additive === true ? 'toggle' : additive === false ? 'replace' : additive), [select])

  // ── Collision Virtual Tile Effect ─────────────────────────────────────────
  const prevTileSelectionRef = useRef<TileSelection | null>(null)
  const activeType = useMemo(() => index.byId.get(activeLayerId ?? '')?.node.type ?? null, [index, activeLayerId])

  useEffect(() => {
    // A pinned (possibly multi-layer) selection is the user's; it is not swapped for the collision marker.
    if (pinSelection) return
    if (activeType === 'collision') {
      setTileSelection((current) => {
        if (current?.tiles[0]?.tilesetId !== '__collision__') {
          prevTileSelectionRef.current = current
        }
        return { width: 1, height: 1, tiles: [{ tilesetId: '__collision__', x: 0, y: 0 }] }
      })
    } else if (activeType === 'tile') {
      setTileSelection((current) => {
        if (current?.tiles[0]?.tilesetId === '__collision__') {
          return prevTileSelectionRef.current
        }
        return current
      })
    }
  }, [activeType, pinSelection])

  // ── Node helpers ──────────────────────────────────────────────────────────
  const toggleNodeVisibility = useCallback(
    (id: string) => {
      commit((prev) => {
        const node = sceneIndex(prev).byId.get(id)?.node
        return node ? setVisible(prev, id, node.visible === false) : prev
      })
    },
    [commit]
  )

  const toggleNodeLock = useCallback(
    (id: string) => {
      commit((prev) => {
        const node = sceneIndex(prev).byId.get(id)?.node
        return node ? setLocked(prev, id, node.locked !== true) : prev
      })
    },
    [commit]
  )

  /** Y-sort on (a Node2D becomes a YSort) or off (a YSort becomes a Node2D). */
  const setNodeYSort = useCallback((id: string, value: boolean | undefined) => commit((prev) => setYSort(prev, id, value)), [commit])

  /** Whether a click on one of the sprites of a Node2D / YSort picks all of them. */
  const setPickAsOne = useCallback(
    (id: string, value: boolean) =>
      commit((prev) => {
        const node = sceneIndex(prev).byId.get(id)?.node
        if (!node || (node.type !== 'group' && node.type !== 'ySort') || (node.pickAsOne === true) === value) return prev
        if (value) return patchNode(prev, id, { pickAsOne: true })
        return updateNode(prev, id, (n) => {
          const { pickAsOne: _p, ...rest } = n as typeof node
          return rest as typeof n
        })
      }),
    [commit]
  )

  /** Opening or closing a container in the list is a view change: it is saved with the map but is not an undo step. */
  const toggleCollapsed = useCallback(
    (id: string) => {
      commitView((prev) => {
        const node = sceneIndex(prev).byId.get(id)?.node
        return node && isContainer(node) ? setCollapsed(prev, id, node.collapsed !== true) : prev
      })
    },
    [commitView]
  )

  /** Makes a node of `type` (inside `anchorId` when it holds that type, else next to it in the nearest place that does), opens its name for typing and selects it. */
  const createNode = useCallback(
    (type: NewNodeType, anchorId?: string | null) => {
      let made: string | null = null
      commit(
        (prev) => {
          // Next to the selection when that is a layer or a Node2D; leaves (entities, pictures...) do not decide where a layer goes.
          const sel = getSelection().primary
          const selected = sel ? sceneIndex(prev).byId.get(sel)?.node : undefined
          const home = selected && (isLayerNode(selected) || isBranch(selected)) ? selected.id : null
          const anchor = anchorId === undefined ? home : anchorId
          const parentPath = parentPathFor(prev, type, anchor)
          const id = newId()
          const result = addNode(prev, makeNode(type, id, newNodeName(prev, type), parentPath[parentPath.length - 1]?.type), anchor)
          if (!result.node) return prev
          made = result.node.id
          return expandTo(result.nodes, result.node.id)
        },
        () => {
          if (!made) return
          select(made)
          const id = made
          setJustCreatedLayer((prev) => ({ id, n: (prev?.n ?? 0) + 1 }))
        }
      )
    },
    [commit, getSelection, select]
  )

  /** A click on a picture (the canvas and the Scene panel). */
  const selectImage = useCallback((_layerId: string, imageId: string, mode: SelectMode = 'replace') => select(imageId, mode), [select])

  /** A new, empty tiles item in a collision layer; returns its id (null when the layer is missing). */
  const addCollisionTiles = useCallback(
    (layerId: string): string | null => {
      let made: string | null = null
      commit((prev) => {
        const layer = sceneIndex(prev).byId.get(layerId)?.node
        if (layer?.type !== 'collision') return prev
        const id = newId()
        const next = insertNode(prev, layerId, { id, type: 'collisionTiles', name: nextTileGroupName(collisionLayerLike(layer)) })
        if (next !== prev) made = id
        return next
      })
      return made
    },
    [commit]
  )

  const renameNodeTo = useCallback((id: string, name: string) => commit((prev) => renameNode(prev, id, name)), [commit])

  /** A patch of fields (`z`, `look`, ...) applied to a node in one undo step. */
  const editNode = useCallback((id: string, patch: Record<string, unknown>) => commit((prev) => patchNode(prev, id, patch)), [commit])

  /** Replaces the shapes of a collision layer (the shape editor on the canvas), one undo step. */
  const setCollisionShapes = useCallback(
    (layerId: string, shapes: readonly CollisionShape[]) => {
      commit((prev) => {
        const layer = sceneIndex(prev).byId.get(layerId)?.node
        if (layer?.type !== 'collision') return prev
        const old = new Map(layer.children.filter((c): c is CollisionShapeNode => c.type === 'collisionShape').map((c) => [c.id, c]))
        const nodes: CollisionShapeNode[] = shapes.map((s) => {
          const before = old.get(s.id)
          if (before && before.points === s.points && before.closed === s.closed && before.name === (s.name ?? '')) return before
          return { id: s.id, type: 'collisionShape', name: s.name ?? '', points: s.points, closed: s.closed }
        })
        const same = nodes.length === old.size && nodes.every((n) => old.get(n.id) === n)
        if (same) return prev
        return patchNode(prev, layerId, { children: [...layer.children.filter((c) => c.type !== 'collisionShape'), ...nodes] })
      })
    },
    [commit]
  )

  /** Deletes nodes and what is inside them in one undo step; selection ids that are gone are dropped. */
  const deleteNodesById = useCallback(
    (ids: readonly string[]) => {
      let removedLayerLike = false
      commit(
        (prev) => {
          const idx = sceneIndex(prev)
          removedLayerLike = ids.some((id) => {
            const t = idx.byId.get(id)?.node.type
            return t !== undefined && t !== 'entity' && t !== 'picture' && t !== 'collisionTiles' && t !== 'collisionShape'
          })
          return deleteNodes(prev, ids)
        },
        (next) => {
          const idx = sceneIndex(next)
          setSelection((sel) => {
            const kept = pruneSelection(sel, idx)
            if (kept.primary !== null || !removedLayerLike) return kept
            // Like deleting a layer always did: the topmost layer left becomes the active one.
            const first = idx.layersTopFirst[0]
            return first ? selectNode(NO_SELECTION, idx, first.id) : kept
          })
        }
      )
    },
    [commit, setSelection]
  )

  // ── copy, paste, duplicate, group ─────────────────────────────────────────
  /** Copy nodes to the editor clipboard (each with what is inside it); returns how many were copied. */
  const copyNodes = useCallback(
    (ids: readonly string[]) => {
      const list = copiesOf(getNodes(), ids)
      if (list.length > 0) useEditorClipboard.getState().set({ kind: 'nodes', nodes: snapshot(list) })
      return list.length
    },
    [getNodes]
  )

  /** Paste the copied nodes next to / into `targetId` (see `pasteCopies`); `at` is where copied pictures land (the cursor). */
  const pasteNodes = useCallback(
    (targetId: string | null, at: { x: number; y: number } | null = null) => {
      const content = useEditorClipboard.getState().content
      if (content?.kind !== 'nodes') return
      let ids: string[] = []
      commit(
        (prev) => {
          const result = pasteCopies(prev, content.nodes, targetId, newId, { at })
          ids = result.ids
          return result.nodes
        },
        () => {
          if (ids.length > 0) selectMany(ids[ids.length - 1], ids)
        }
      )
    },
    [commit, selectMany]
  )

  /** Duplicate nodes in one undo step; the copies are selected. */
  const duplicateNodesById = useCallback(
    (ids: readonly string[]) => {
      let made: string[] = []
      commit(
        (prev) => {
          const result = duplicateNodes(prev, ids, newId)
          made = result.ids
          return result.nodes
        },
        () => {
          if (made.length > 0) selectMany(made[made.length - 1], made)
        }
      )
    },
    [commit, selectMany]
  )

  /** Put the nodes in one new group, which sits where the highest of them was; opens its name for typing. */
  const groupNodesById = useCallback(
    (ids: readonly string[]) => {
      let made: string | null = null
      commit(
        (prev) => {
          const result = groupNodes(prev, ids, newId(), newNodeName(prev, 'group'))
          made = result.group?.id ?? null
          return result.nodes
        },
        () => {
          if (!made) return
          selectMany(made, [made])
          const id = made
          setJustCreatedLayer((prev) => ({ id, n: (prev?.n ?? 0) + 1 }))
        }
      )
    },
    [commit, selectMany]
  )

  /** A group dissolved: what it held takes its place. */
  const ungroupNodeById = useCallback(
    (id: string) => {
      commit(
        (prev) => ungroupNode(prev, id),
        (next) => setSelection((sel) => pruneSelection(sel, sceneIndex(next)))
      )
    },
    [commit, setSelection]
  )

  /** Nodes dragged in the list: dropped above / below a row or inside a container, in one undo step. */
  const moveNodes = useCallback(
    (ids: readonly string[], targetId: string, where: DropWhere) => {
      commit((prev) => {
        const next = moveNodesTo(prev, ids, targetId, where)
        return next === prev ? prev : expandTo(next, targetId)
      })
    },
    [commit]
  )

  const handleCreateLayer = useCallback(() => createNode('tile', null), [createNode])

  return {
    ...images,
    // the tree and what is selected in it
    activeLayerId,
    setActiveLayerId,
    selectedLayerIds,
    selectLayer,
    select,
    selectMany,
    selectedImageId: view.selectedImageId,
    pickedImageIds: view.pickedImageIds,
    openImageGroupId: view.openImageGroupId,
    pinSelection,
    setPinSelection,
    tileSelection,
    setTileSelection,
    activeTool,
    setActiveTool,
    paintMode,
    setPaintMode,
    isPainting,
    setIsPainting,
    paintStartPos,
    setPaintStartPos,
    debugInfo,
    setDebugInfo,
    activeLayerType: activeType,
    justCreatedLayer,
    // node operations
    createNode,
    handleCreateLayer,
    renameNode: renameNodeTo,
    selectImage,
    addCollisionTiles,
    editNode,
    setCollisionShapes,
    toggleNodeVisibility,
    toggleNodeLock,
    setNodeYSort,
    setPickAsOne,
    toggleCollapsed,
    deleteNodes: deleteNodesById,
    copyNodes,
    pasteNodes,
    duplicateNodes: duplicateNodesById,
    groupNodes: groupNodesById,
    ungroupNode: ungroupNodeById,
    moveNodes,
    getIndex,
  }
}
