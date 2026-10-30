import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Layer, LayerType, TileSelection, ActiveTool, PaintMode, DebugInfo, MapData } from '@/types/editor'
import { useSyncedState } from '@/hooks/useSyncedState'

interface UseLayerManagerOptions {
  /** Functional updates only: the manager never closes over the current map. */
  setActiveMap: React.Dispatch<React.SetStateAction<MapData | null>>
  /** Called once per committed layer mutation, after the new layers are readable via `getLayers()`. */
  onCommitHistory?: (layers: Layer[]) => void
}

export function useLayerManager(options: UseLayerManagerOptions) {
  const { setActiveMap, onCommitHistory } = options

  const [layers, setLayers, layersRef] = useSyncedState<Layer[]>([])
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null)
  const [tileSelection, setTileSelection] = useState<TileSelection | null>(null)
  const [activeTool, setActiveTool] = useState<ActiveTool>('brush')
  const [paintMode, setPaintMode] = useState<PaintMode>('discontinuous')
  const [isPainting, setIsPainting] = useState(false)
  const [paintStartPos, setPaintStartPos] = useState<{ x: number; y: number } | null>(null)
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null)

  /** Latest layers, readable synchronously (e.g. for history snapshots / paint ops). */
  const getLayers = useCallback(() => layersRef.current, [layersRef])

  // ── Collision Virtual Tile Effect ─────────────────────────────────────────
  const prevTileSelectionRef = useRef<TileSelection | null>(null)

  useEffect(() => {
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
  }, [activeLayerId, layersRef])

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
          }
          createdId = newLayer.id

          let insertIndex = 0
          if (type === 'tile') {
            // Keep special layers on top of tile layers by default: insert tile layer below special layers at the top
            while (
              insertIndex < prev.length &&
              ['collision', 'terrain', 'encounters'].includes(prev[insertIndex].type)
            ) {
              insertIndex++
            }
          }
          const next = [...prev]
          next.splice(insertIndex, 0, newLayer)
          return next
        },
        () => {
          if (createdId) setActiveLayerId(createdId)
        }
      )
    },
    [commitNewLayers]
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
          }
          createdId = newLayer.id
          const next = [...prev]
          next.splice(targetIndex + 1, 0, newLayer)
          return next
        },
        () => {
          if (createdId) setActiveLayerId(createdId)
        }
      )
    },
    [commitNewLayers]
  )

  const handleDeleteLayer = useCallback(
    (id: string) => {
      commitNewLayers(
        prev => prev.filter(l => l.id !== id),
        next => {
          setActiveLayerId(current => (current === id ? (next.length > 0 ? next[0].id : null) : current))
        }
      )
    },
    [commitNewLayers]
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
    layers,
    getLayers,
    setLayers,
    activeLayerId,
    setActiveLayerId,
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
