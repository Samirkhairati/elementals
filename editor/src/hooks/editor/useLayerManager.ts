// The layers of the open map: the list, which layer is active (and the Ctrl/Cmd+click multi-selection), creating,
// copying, deleting and reordering layers and folders, and the tile-painting state. The pictures of image layers are
// `useImageItems`, composed here so the editor sees one manager. Every change goes through `commitNewLayers`.

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { snapshot, useEditorClipboard } from '@/store/editorClipboard'
import { Layer, LayerType, TileSelection, ActiveTool, PaintMode, DebugInfo, MapData } from '@/types/editor'
import { useSyncedState } from '@/hooks/useSyncedState'
import { layersToCopy, placeLayerCopies, setFolderFlag } from '@/lib/layerFolders'
import { clampEntitiesIndex, entitiesIndexAfterInsert, entitiesIndexAfterRemove } from '@/lib/layerOrder'
import { useImageItems } from './useImageItems'

interface UseLayerManagerOptions {
  /** Functional updates only: the manager never closes over the current map. */
  setActiveMap: React.Dispatch<React.SetStateAction<MapData | null>>
  /** Called once per committed layer mutation, after the new layers are readable via `getLayers()`. */
  onCommitHistory?: (layers: Layer[]) => void
}

export function useLayerManager(options: UseLayerManagerOptions) {
  const { setActiveMap, onCommitHistory } = options

  const [layers, setLayers, layersRef] = useSyncedState<Layer[]>([])
  const [activeLayerId, setActiveLayerIdRaw] = useState<string | null>(null)
  /** Extra layers picked with Ctrl/Cmd+click. The active layer is always part of the working set on top of these. */
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([])
  /** Pinned: a right-drag samples every selected layer (not just the active one) and painting writes back to all of them. */
  const [pinSelection, setPinSelection] = useState(false)
  /** The layer the last "new layer / folder" made (and how many were made), so the list can open its name for typing. */
  const [justCreatedLayer, setJustCreatedLayer] = useState<{ id: string; n: number } | null>(null)
  const [tileSelection, setTileSelection] = useState<TileSelection | null>(null)
  const [activeTool, setActiveTool] = useState<ActiveTool>('brush')
  const [paintMode, setPaintMode] = useState<PaintMode>('discontinuous')
  const [isPainting, setIsPainting] = useState(false)
  const [paintStartPos, setPaintStartPos] = useState<{ x: number; y: number } | null>(null)
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null)

  // ── Committing layer changes ──────────────────────────────────────────────
  const commitNewLayers = useCallback(
    (updater: (prev: Layer[]) => Layer[], onAfter?: (next: Layer[]) => void) => {
      // Computed from the ref, *outside* of any React updater: side effects below run exactly once.
      const prev = layersRef.current
      const next = updater(prev)
      if (next === prev) return
      setLayers(next)
      setActiveMap(m => (m ? { ...m, layers: next } : m))
      onCommitHistory?.(next)
      onAfter?.(next)
    },
    [layersRef, setLayers, setActiveMap, onCommitHistory]
  )

  // ── Pictures of image layers (placing, picking, groups) ───────────────────
  const images = useImageItems({ layersRef, commitNewLayers, activeLayerId })
  const { setSelectedImageId } = images


  /** Activating a layer drops the multi-selection (use `selectLayer` with `additive` to extend it). */
  const setActiveLayerId = useCallback((next: React.SetStateAction<string | null>) => {
    setActiveLayerIdRaw(next)
    // Functional updates come from undo/redo, which keeps the selection (stale ids are ignored later).
    if (typeof next !== 'function') {
      setSelectedLayerIds([])
      setSelectedImageId(null)
    }
  }, [setSelectedImageId])

  /** Plain click: only this layer. Ctrl/Cmd+click: add it to (or remove it from) the multi-selection. Shift+click ('range'): everything from the active layer to it. */
  const selectLayer = useCallback(
    (id: string, additive: boolean | 'range' = false) => {
      if (!additive) {
        setActiveLayerId(id)
        return
      }
      setSelectedImageId(null)
      if (additive === 'range') {
        const rows = layersRef.current.filter(l => l.type !== 'folder').map(l => l.id)
        const from = activeLayerId ? rows.indexOf(activeLayerId) : -1
        const to = rows.indexOf(id)
        if (from === -1 || to === -1) {
          setActiveLayerId(id)
          return
        }
        setSelectedLayerIds(rows.slice(Math.min(from, to), Math.max(from, to) + 1))
        setActiveLayerIdRaw(id)
        return
      }
      setSelectedLayerIds(prev => {
        const set = new Set(prev)
        if (activeLayerId) set.add(activeLayerId)
        if (set.has(id)) set.delete(id)
        else set.add(id)
        return [...set]
      })
      setActiveLayerIdRaw(id)
    },
    [activeLayerId, setActiveLayerId, setSelectedImageId, layersRef]
  )

  /** Latest layers, readable synchronously (e.g. for history snapshots / paint ops). */
  const getLayers = useCallback(() => layersRef.current, [layersRef])

  // ── Collision Virtual Tile Effect ─────────────────────────────────────────
  const prevTileSelectionRef = useRef<TileSelection | null>(null)

  useEffect(() => {
    // A pinned (possibly multi-layer) selection is the user's; it is not swapped for the collision marker.
    if (pinSelection) return
    const layer = layersRef.current.find(l => l.id === activeLayerId)
    if (layer?.type === 'collision') {
      setTileSelection(current => {
        if (current?.tiles[0]?.tilesetId !== '__collision__') {
          prevTileSelectionRef.current = current
        }
        return { width: 1, height: 1, tiles: [{ tilesetId: '__collision__', x: 0, y: 0 }] }
      })
    } else if (layer?.type === 'tile') {
      setTileSelection(current => {
        if (current?.tiles[0]?.tilesetId === '__collision__') {
          return prevTileSelectionRef.current
        }
        return current
      })
    }
  }, [activeLayerId, layersRef, pinSelection])

  // ── Layer helpers ─────────────────────────────────────────────────────────
  /**
   * Where the Entities row sits among the layers is a map field (`entitiesIndex`: how many layers are above it).
   * It only gets written when it differs from the default, so untouched maps stay untouched.
   */
  const setEntitiesIndex = useCallback(
    (index: number) => {
      setActiveMap(m => {
        if (!m) return m
        const next = clampEntitiesIndex(index, m.layers.length)
        return clampEntitiesIndex(m.entitiesIndex, m.layers.length) === next ? m : { ...m, entitiesIndex: next }
      })
    },
    [setActiveMap]
  )

  /** Keeps the Entities row between the same layers when a layer is added or removed. */
  const shiftEntitiesIndex = useCallback(
    (shift: (current: number | undefined) => number) => {
      setActiveMap(m => {
        if (!m) return m
        const next = shift(m.entitiesIndex)
        return clampEntitiesIndex(m.entitiesIndex, Number.MAX_SAFE_INTEGER) === next ? m : { ...m, entitiesIndex: next }
      })
    },
    [setActiveMap]
  )

  const updateLayers = useCallback(
    (newLayers: Layer[]) => {
      commitNewLayers(() => newLayers)
    },
    [commitNewLayers]
  )

  const toggleLayerVisibility = useCallback(
    (id: string) => {
      commitNewLayers(prev => {
        const layer = prev.find(l => l.id === id)
        // A folder's eye sets the eye of the layers it holds too.
        if (layer?.type === 'folder') return setFolderFlag(prev, id, 'visible', !layer.visible)
        return prev.map(l => (l.id === id ? { ...l, visible: !l.visible } : l))
      })
    },
    [commitNewLayers]
  )

  const toggleLayerLock = useCallback(
    (id: string) => {
      commitNewLayers(prev => {
        const layer = prev.find(l => l.id === id)
        if (layer?.type === 'folder') return setFolderFlag(prev, id, 'locked', !layer.locked)
        return prev.map(l => (l.id === id ? { ...l, locked: !l.locked } : l))
      })
    },
    [commitNewLayers]
  )

  /** Y-sort on or off for a layer or folder; undefined goes back to following the folder (see shared/ySort.ts). */
  const setLayerYSort = useCallback(
    (id: string, value: boolean | undefined) => {
      commitNewLayers(prev => {
        const layer = prev.find(l => l.id === id)
        if (!layer || layer.ySort === value) return prev
        return prev.map(l => {
          if (l.id !== id) return l
          const { ySort: _old, ...rest } = l
          return value === undefined ? rest : { ...rest, ySort: value }
        })
      })
    },
    [commitNewLayers]
  )

  /** Opening or closing a folder in the list is a view change: it is saved with the map but is not an undo step. */
  const toggleFolderCollapsed = useCallback(
    (id: string) => {
      const prev = layersRef.current
      const next = prev.map(l => (l.id === id && l.type === 'folder' ? { ...l, collapsed: !l.collapsed } : l))
      setLayers(next)
      setActiveMap(m => (m ? { ...m, layers: next } : m))
    },
    [layersRef, setLayers, setActiveMap]
  )

  const handleCreateLayerOfType = useCallback(
    (type: LayerType, folderId?: string) => {
      let createdId: string | null = null
      let insertedAt = -1
      let countBefore = 0
      commitNewLayers(
        prev => {
          // One terrain and one encounters layer per map (collision layers can be many).
          if (['terrain', 'encounters'].includes(type) && prev.some(l => l.type === type)) {
            return prev
          }

          let name = ''
          if (type === 'tile') {
            let counter = 1
            while (prev.some(l => l.name === `Layer ${counter}`)) {
              counter++
            }
            name = `Layer ${counter}`
          } else if (type === 'collision') {
            let counter = 1
            while (prev.some(l => l.name === (counter === 1 ? 'Collision' : `Collision ${counter}`))) {
              counter++
            }
            name = counter === 1 ? 'Collision' : `Collision ${counter}`
          } else if (type === 'terrain') {
            name = 'Terrain'
          } else if (type === 'encounters') {
            name = 'Encounters'
          } else if (type === 'image') {
            let counter = 1
            while (prev.some(l => l.name === (counter === 1 ? 'Images' : `Images ${counter}`))) {
              counter++
            }
            name = counter === 1 ? 'Images' : `Images ${counter}`
          } else if (type === 'folder') {
            let counter = 1
            while (prev.some(l => l.name === (counter === 1 ? 'Folder' : `Folder ${counter}`))) {
              counter++
            }
            name = counter === 1 ? 'Folder' : `Folder ${counter}`
          } else if (type === 'objects') {
            let counter = 1
            while (prev.some(l => l.name === (counter === 1 ? 'Objects' : `Objects ${counter}`))) {
              counter++
            }
            name = counter === 1 ? 'Objects' : `Objects ${counter}`
          }

          // Created from a folder's menu: a tile, image or collision layer goes in as the folder's top layer, and the folder opens.
          const folderAt = folderId && (type === 'tile' || type === 'image' || type === 'collision') ? prev.findIndex(l => l.id === folderId && l.type === 'folder') : -1
          const newLayer: Layer = {
            id: crypto.randomUUID(),
            name,
            type,
            visible: true,
            locked: false,
            ...(type === 'image' ? { images: [] } : {}),
            ...(type === 'collision' ? { data: {}, shapes: [], tileGroups: [] } : {}),
            ...(folderAt >= 0 ? { folderId } : {}),
          }
          createdId = newLayer.id

          if (folderAt >= 0) {
            const next = prev.map((l, i) => (i === folderAt && l.collapsed ? { ...l, collapsed: false } : l))
            next.splice(folderAt + 1, 0, newLayer)
            // The Entities row is never between a folder and its layers: one sitting right below it ends up below the new layer.
            insertedAt = folderAt
            countBefore = prev.length
            return next
          }

          let insertIndex = 0
          if (type === 'tile' || type === 'image') {
            // Keep special layers on top of the drawn layers by default: insert them below the special layers at the top
            while (
              insertIndex < prev.length &&
              ['collision', 'terrain', 'encounters'].includes(prev[insertIndex].type)
            ) {
              insertIndex++
            }
          }
          const next = [...prev]
          next.splice(insertIndex, 0, newLayer)
          insertedAt = insertIndex
          countBefore = prev.length
          return next
        },
        () => {
          if (createdId) {
            setActiveLayerId(createdId)
            const id = createdId
            setJustCreatedLayer(prev => ({ id, n: (prev?.n ?? 0) + 1 }))
          }
          if (insertedAt >= 0) shiftEntitiesIndex(k => entitiesIndexAfterInsert(k, insertedAt, countBefore))
        }
      )
    },
    [commitNewLayers, setActiveLayerId, shiftEntitiesIndex]
  )

  const handleCreateLayer = useCallback(() => {
    handleCreateLayerOfType('tile')
  }, [handleCreateLayerOfType])

  const handleRenameLayer = useCallback(
    (id: string, newName: string) => {
      const cleanName = newName.trim()
      if (!cleanName) return
      commitNewLayers(prev => prev.map(l => (l.id === id ? { ...l, name: cleanName } : l)))
    },
    [commitNewLayers]
  )

  /** Insert copies of `source` layers (new ids, "Name Copy") next to the layer `afterId`, at its depth (see placeLayerCopies), in one undo step, and pick the last. */
  const insertLayerCopies = useCallback(
    (source: readonly Layer[], afterId: string | null) => {
      let placed: ReturnType<typeof placeLayerCopies> | null = null
      let countBefore = 0
      commitNewLayers(
        prev => {
          placed = placeLayerCopies(prev, source, afterId, () => crypto.randomUUID())
          countBefore = prev.length
          return placed.layers
        },
        () => {
          const done = placed as ReturnType<typeof placeLayerCopies> | null
          if (!done || done.count === 0) return
          if (done.lastId) setActiveLayerId(done.lastId)
          shiftEntitiesIndex(k => entitiesIndexAfterInsert(k, done.at, countBefore, done.count))
        }
      )
    },
    [commitNewLayers, setActiveLayerId, shiftEntitiesIndex]
  )

  /** Copy layers to the editor clipboard: tile and image layers, and folders with the layers they hold. */
  const copyLayers = useCallback(
    (ids: readonly string[]) => {
      const list = layersToCopy(layersRef.current, ids)
      if (list.length > 0) useEditorClipboard.getState().set({ kind: 'layers', layers: snapshot(list) })
      return list.length
    },
    [layersRef]
  )

  /** Duplicate several layers and folders at once (one undo step); the copies go below the lowest of them, at its depth. */
  const duplicateLayers = useCallback(
    (ids: readonly string[]) => {
      const list = layersToCopy(layersRef.current, ids)
      if (list.length === 0) return
      insertLayerCopies(list, list[list.length - 1].id)
    },
    [insertLayerCopies, layersRef]
  )

  const handleDuplicateLayer = useCallback((id: string) => duplicateLayers([id]), [duplicateLayers])

  /** Paste copied layers next to `afterId`, in its folder (see placeLayerCopies). */
  const pasteLayers = useCallback(
    (afterId: string | null) => {
      const content = useEditorClipboard.getState().content
      if (content?.kind === 'layers') insertLayerCopies(content.layers, afterId)
    },
    [insertLayerCopies]
  )

  const handleDeleteLayer = useCallback(
    (id: string) => {
      let removedAt = -1
      let countBefore = 0
      commitNewLayers(
        prev => {
          removedAt = prev.findIndex(l => l.id === id)
          countBefore = prev.length
          // Deleting a folder keeps the layers it held: they just leave it.
          return prev
            .filter(l => l.id !== id)
            .map(l => {
              if (l.folderId !== id) return l
              const { folderId: _gone, ...rest } = l
              return rest
            })
        },
        next => {
          if (removedAt >= 0) shiftEntitiesIndex(k => entitiesIndexAfterRemove(k, removedAt, countBefore))
          setSelectedLayerIds(prev => prev.filter(other => other !== id))
          setActiveLayerIdRaw(current => (current === id ? (next.length > 0 ? next[0].id : null) : current))
        }
      )
    },
    [commitNewLayers, shiftEntitiesIndex]
  )

  /** Delete several layers in one undo step (folders among them release the layers they held). */
  const handleDeleteLayers = useCallback(
    (ids: readonly string[]) => {
      const gone = new Set(ids)
      let removedAt: number[] = []
      let countBefore = 0
      commitNewLayers(
        prev => {
          removedAt = prev.flatMap((l, i) => (gone.has(l.id) ? [i] : []))
          if (removedAt.length === 0) return prev
          countBefore = prev.length
          return prev
            .filter(l => !gone.has(l.id))
            .map(l => {
              if (!l.folderId || !gone.has(l.folderId)) return l
              const { folderId: _gone, ...rest } = l
              return rest
            })
        },
        next => {
          // Highest first, so the indices below stay valid while the count shrinks.
          let count = countBefore
          for (const at of [...removedAt].reverse()) {
            const n = count
            shiftEntitiesIndex(k => entitiesIndexAfterRemove(k, at, n))
            count--
          }
          setSelectedLayerIds(prev => prev.filter(other => !gone.has(other)))
          setActiveLayerIdRaw(current => (current && gone.has(current) ? (next.length > 0 ? next[0].id : null) : current))
        }
      )
    },
    [commitNewLayers, shiftEntitiesIndex]
  )

  const handleReorderLayers = useCallback(
    (newLayers: Layer[]) => {
      updateLayers(newLayers)
    },
    [updateLayers]
  )

  const activeLayerType = useMemo(
    () => layers.find(l => l.id === activeLayerId)?.type || null,
    [layers, activeLayerId]
  )

  return {
    ...images,
    layers,
    getLayers,
    setLayers,
    activeLayerId,
    setActiveLayerId,
    selectedLayerIds,
    selectLayer,
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
    activeLayerType,
    updateLayers,
    setEntitiesIndex,
    toggleLayerVisibility,
    toggleLayerLock,
    setLayerYSort,
    toggleFolderCollapsed,
    justCreatedLayer,
    handleCreateLayer,
    handleCreateLayerOfType,
    handleRenameLayer,
    handleDuplicateLayer,
    copyLayers,
    duplicateLayers,
    pasteLayers,
    handleDeleteLayer,
    handleDeleteLayers,
    handleReorderLayers,
  }
}
