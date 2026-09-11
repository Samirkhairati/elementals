import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Layer, LayerType, TileSelection, ActiveTool, PaintMode, DebugInfo, MapData } from '@/types/editor'

interface UseLayerManagerOptions {
  activeMap: MapData | null
  setActiveMap: React.Dispatch<React.SetStateAction<MapData | null>>
  onCommitHistory?: (layers: Layer[]) => void
}

export function useLayerManager(options: UseLayerManagerOptions) {
  const { activeMap, setActiveMap, onCommitHistory } = options

  const [layers, setLayers] = useState<Layer[]>([])
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null)
  const [tileSelection, setTileSelection] = useState<TileSelection | null>(null)
  const [activeTool, setActiveTool] = useState<ActiveTool>('brush')
  const [paintMode, setPaintMode] = useState<PaintMode>('discontinuous')
  const [isPainting, setIsPainting] = useState(false)
  const [paintStartPos, setPaintStartPos] = useState<{ x: number; y: number } | null>(null)
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null)

  // ── Collision Virtual Tile Effect ─────────────────────────────────────────
  const layersRef = useRef(layers)
  useEffect(() => {
    layersRef.current = layers
  }, [layers])

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
  }, [activeLayerId])

  // ── Layer helpers ─────────────────────────────────────────────────────────
  const updateLayers = useCallback((newLayers: Layer[]) => {
    setLayers(newLayers)
    if (activeMap) {
      const updatedMap = { ...activeMap, layers: newLayers }
      setActiveMap(updatedMap)
      window.electronAPI?.saveMap(activeMap.folderPath, activeMap.fileName, updatedMap)
    }
    onCommitHistory?.(newLayers)
  }, [activeMap, setActiveMap, onCommitHistory])

  const toggleLayerVisibility = useCallback((id: string) => {
    setLayers(prev => {
      const newLayers = prev.map(l => (l.id === id ? { ...l, visible: !l.visible } : l))
      if (activeMap) {
        const updatedMap = { ...activeMap, layers: newLayers }
        setActiveMap(updatedMap)
        window.electronAPI?.saveMap(activeMap.folderPath, activeMap.fileName, updatedMap)
      }
      return newLayers
    })
  }, [activeMap, setActiveMap])

  const toggleLayerLock = useCallback((id: string) => {
    setLayers(prev => {
      const newLayers = prev.map(l => (l.id === id ? { ...l, locked: !l.locked } : l))
      if (activeMap) {
        const updatedMap = { ...activeMap, layers: newLayers }
        setActiveMap(updatedMap)
        window.electronAPI?.saveMap(activeMap.folderPath, activeMap.fileName, updatedMap)
      }
      return newLayers
    })
  }, [activeMap, setActiveMap])

  const handleCreateLayerOfType = useCallback((type: LayerType) => {
    setLayers(prev => {
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
      const newLayers = [newLayer, ...prev]
      if (activeMap) {
        const updatedMap = { ...activeMap, layers: newLayers }
        setActiveMap(updatedMap)
        window.electronAPI?.saveMap(activeMap.folderPath, activeMap.fileName, updatedMap)
      }
      setActiveLayerId(newLayer.id)
      onCommitHistory?.(newLayers)
      return newLayers
    })
  }, [activeMap, setActiveMap, onCommitHistory])

  const handleCreateLayer = useCallback(() => {
    handleCreateLayerOfType('tile')
  }, [handleCreateLayerOfType])

  const handleRenameLayer = useCallback((id: string, newName: string) => {
    const cleanName = newName.trim()
    if (!cleanName) return
    setLayers(prev => {
      const newLayers = prev.map(l => (l.id === id ? { ...l, name: cleanName } : l))
      if (activeMap) {
        const updatedMap = { ...activeMap, layers: newLayers }
        setActiveMap(updatedMap)
        window.electronAPI?.saveMap(activeMap.folderPath, activeMap.fileName, updatedMap)
      }
      onCommitHistory?.(newLayers)
      return newLayers
    })
  }, [activeMap, setActiveMap, onCommitHistory])

  const handleDuplicateLayer = useCallback((id: string) => {
    setLayers(prev => {
      const targetIndex = prev.findIndex(l => l.id === id)
      if (targetIndex === -1) return prev
      const targetLayer = prev[targetIndex]
      const newLayer: Layer = {
        ...targetLayer,
        id: crypto.randomUUID(),
        name: `${targetLayer.name} Copy`,
        data: targetLayer.data ? JSON.parse(JSON.stringify(targetLayer.data)) : undefined,
      }
      const newLayers = [...prev]
      newLayers.splice(targetIndex + 1, 0, newLayer)
      if (activeMap) {
        const updatedMap = { ...activeMap, layers: newLayers }
        setActiveMap(updatedMap)
        window.electronAPI?.saveMap(activeMap.folderPath, activeMap.fileName, updatedMap)
      }
      setActiveLayerId(newLayer.id)
      onCommitHistory?.(newLayers)
      return newLayers
    })
  }, [activeMap, setActiveMap, onCommitHistory])

  const handleDeleteLayer = useCallback((id: string) => {
    setLayers(prev => {
      const newLayers = prev.filter(l => l.id !== id)
      if (activeMap) {
        const updatedMap = { ...activeMap, layers: newLayers }
        setActiveMap(updatedMap)
        window.electronAPI?.saveMap(activeMap.folderPath, activeMap.fileName, updatedMap)
      }
      if (activeLayerId === id) {
        setActiveLayerId(newLayers.length > 0 ? newLayers[0].id : null)
      }
      onCommitHistory?.(newLayers)
      return newLayers
    })
  }, [activeMap, setActiveMap, activeLayerId, onCommitHistory])

  const handleReorderLayers = useCallback((newLayers: Layer[]) => {
    updateLayers(newLayers)
  }, [updateLayers])

  const activeLayerType = useMemo(
    () => layers.find(l => l.id === activeLayerId)?.type || null,
    [layers, activeLayerId]
  )

  return {
    layers,
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
