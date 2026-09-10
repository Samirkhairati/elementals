import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Layer, TileSelection, ActiveTool, PaintMode, DebugInfo, MapData } from '@/types/editor'

interface UseLayerManagerOptions {
  activeMap: MapData | null
  setActiveMap: React.Dispatch<React.SetStateAction<MapData | null>>
}

export function useLayerManager(options: UseLayerManagerOptions) {
  const { activeMap, setActiveMap } = options

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
  }, [activeMap, setActiveMap])

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

  const handleCreateLayer = useCallback(() => {
    setLayers(prev => {
      let counter = 1
      while (prev.some(l => l.name === `Layer ${counter}`)) {
        counter++
      }
      const newLayer: Layer = {
        id: crypto.randomUUID(),
        name: `Layer ${counter}`,
        type: 'tile',
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
      return newLayers
    })
  }, [activeMap, setActiveMap])

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
      return newLayers
    })
  }, [activeMap, setActiveMap, activeLayerId])

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
    handleDeleteLayer,
    handleReorderLayers,
  }
}
