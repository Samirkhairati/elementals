import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Layer, LayerType, ImageItem, TileSelection, ActiveTool, PaintMode, DebugInfo, MapData } from '@/types/editor'
import { useSyncedState } from '@/hooks/useSyncedState'
import { clampEntitiesIndex, entitiesIndexAfterInsert, entitiesIndexAfterRemove } from '@/lib/layerOrder'

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
  /** Image layers: the sprite asset waiting to be dropped on the map, and the image picked on the canvas. */
  const [pendingImage, setPendingImage] = useState<{ assetId: string } | null>(null)
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [tileSelection, setTileSelection] = useState<TileSelection | null>(null)
  const [activeTool, setActiveTool] = useState<ActiveTool>('brush')
  const [paintMode, setPaintMode] = useState<PaintMode>('discontinuous')
  const [isPainting, setIsPainting] = useState(false)
  const [paintStartPos, setPaintStartPos] = useState<{ x: number; y: number } | null>(null)
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null)

  /** Activating a layer drops the multi-selection (use `selectLayer` with `additive` to extend it). */
  const setActiveLayerId = useCallback((next: React.SetStateAction<string | null>) => {
    setActiveLayerIdRaw(next)
    // Functional updates come from undo/redo, which keeps the selection (stale ids are ignored later).
    if (typeof next !== 'function') {
      setSelectedLayerIds([])
      setSelectedImageId(null)
    }
  }, [])

  /** Plain click: only this layer. Ctrl/Cmd+click: add it to (or remove it from) the multi-selection. */
  const selectLayer = useCallback(
    (id: string, additive = false) => {
      if (!additive) {
        setActiveLayerId(id)
        return
      }
      setSelectedImageId(null)
      setSelectedLayerIds(prev => {
        const set = new Set(prev)
        if (activeLayerId) set.add(activeLayerId)
        if (set.has(id)) set.delete(id)
        else set.add(id)
        return [...set]
      })
      setActiveLayerIdRaw(id)
    },
    [activeLayerId, setActiveLayerId]
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
      commitNewLayers(prev => prev.map(l => (l.id === id ? { ...l, visible: !l.visible } : l)))
    },
    [commitNewLayers]
  )

  const toggleLayerLock = useCallback(
    (id: string) => {
      commitNewLayers(prev => prev.map(l => (l.id === id ? { ...l, locked: !l.locked } : l)))
    },
    [commitNewLayers]
  )

  const handleCreateLayerOfType = useCallback(
    (type: LayerType) => {
      let createdId: string | null = null
      let insertedAt = -1
      let countBefore = 0
      commitNewLayers(
        prev => {
          // Special layer singleton check
          if (['collision', 'terrain', 'encounters'].includes(type) && prev.some(l => l.type === type)) {
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
            name = 'Collision'
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
          } else if (type === 'objects') {
            let counter = 1
            while (prev.some(l => l.name === (counter === 1 ? 'Objects' : `Objects ${counter}`))) {
              counter++
            }
            name = counter === 1 ? 'Objects' : `Objects ${counter}`
          }

          const newLayer: Layer = {
            id: crypto.randomUUID(),
            name,
            type,
            visible: true,
            locked: false,
            ...(type === 'image' ? { images: [] } : {}),
          }
          createdId = newLayer.id

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
          if (createdId) setActiveLayerId(createdId)
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

  const handleDuplicateLayer = useCallback(
    (id: string) => {
      let createdId: string | null = null
      let insertedAt = -1
      let countBefore = 0
      commitNewLayers(
        prev => {
          const targetIndex = prev.findIndex(l => l.id === id)
          if (targetIndex === -1) return prev
          const targetLayer = prev[targetIndex]
          const newLayer: Layer = {
            ...targetLayer,
            id: crypto.randomUUID(),
            name: `${targetLayer.name} Copy`,
            data: targetLayer.data ? JSON.parse(JSON.stringify(targetLayer.data)) : undefined,
            images: targetLayer.images?.map(img => ({ ...img, id: crypto.randomUUID() })),
          }
          createdId = newLayer.id
          const next = [...prev]
          next.splice(targetIndex + 1, 0, newLayer)
          insertedAt = targetIndex + 1
          countBefore = prev.length
          return next
        },
        () => {
          if (createdId) setActiveLayerId(createdId)
          if (insertedAt >= 0) shiftEntitiesIndex(k => entitiesIndexAfterInsert(k, insertedAt, countBefore))
        }
      )
    },
    [commitNewLayers, setActiveLayerId, shiftEntitiesIndex]
  )

  const handleDeleteLayer = useCallback(
    (id: string) => {
      let removedAt = -1
      let countBefore = 0
      commitNewLayers(
        prev => {
          removedAt = prev.findIndex(l => l.id === id)
          countBefore = prev.length
          return prev.filter(l => l.id !== id)
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

  const handleReorderLayers = useCallback(
    (newLayers: Layer[]) => {
      updateLayers(newLayers)
    },
    [updateLayers]
  )

  // ── Image layers ──────────────────────────────────────────────────────────
  const startImagePlacement = useCallback((assetId: string) => setPendingImage({ assetId }), [])
  const cancelImagePlacement = useCallback(() => setPendingImage(null), [])

  useEffect(() => {
    if (!pendingImage) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingImage(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pendingImage])

  const addImage = useCallback(
    (layerId: string, item: Omit<ImageItem, 'id'>): string | null => {
      let createdId: string | null = null
      commitNewLayers(
        prev => {
          const index = prev.findIndex(l => l.id === layerId && l.type === 'image')
          if (index === -1) return prev
          const image: ImageItem = { ...item, id: crypto.randomUUID() }
          createdId = image.id
          const next = [...prev]
          next[index] = { ...prev[index], images: [...(prev[index].images || []), image] }
          return next
        },
        () => {
          if (createdId) setSelectedImageId(createdId)
        }
      )
      return createdId
    },
    [commitNewLayers]
  )

  const updateImage = useCallback(
    (layerId: string, imageId: string, patch: Partial<Omit<ImageItem, 'id'>>) => {
      commitNewLayers(prev => {
        const index = prev.findIndex(l => l.id === layerId && l.type === 'image')
        if (index === -1) return prev
        const images = prev[index].images || []
        const current = images.find(img => img.id === imageId)
        if (!current) return prev
        const changed = (Object.keys(patch) as (keyof typeof patch)[]).some(key => current[key] !== patch[key])
        if (!changed) return prev
        const next = [...prev]
        next[index] = { ...prev[index], images: images.map(img => (img.id === imageId ? { ...img, ...patch } : img)) }
        return next
      })
    },
    [commitNewLayers]
  )

  const deleteImage = useCallback(
    (layerId: string, imageId: string) => {
      commitNewLayers(
        prev => {
          const index = prev.findIndex(l => l.id === layerId && l.type === 'image')
          if (index === -1) return prev
          const images = prev[index].images || []
          if (!images.some(img => img.id === imageId)) return prev
          const next = [...prev]
          next[index] = { ...prev[index], images: images.filter(img => img.id !== imageId) }
          return next
        },
        () => setSelectedImageId(current => (current === imageId ? null : current))
      )
    },
    [commitNewLayers]
  )

  const activeLayerType = useMemo(
    () => layers.find(l => l.id === activeLayerId)?.type || null,
    [layers, activeLayerId]
  )

  return {
    layers,
    getLayers,
    setLayers,
    activeLayerId,
    setActiveLayerId,
    selectedLayerIds,
    selectLayer,
    pinSelection,
    setPinSelection,
    pendingImage,
    startImagePlacement,
    cancelImagePlacement,
    selectedImageId,
    setSelectedImageId,
    addImage,
    updateImage,
    deleteImage,
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
    handleCreateLayer,
    handleCreateLayerOfType,
    handleRenameLayer,
    handleDuplicateLayer,
    handleDeleteLayer,
    handleReorderLayers,
  }
}
