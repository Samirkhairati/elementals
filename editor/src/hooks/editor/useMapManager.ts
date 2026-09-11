import { useState, useCallback } from 'react'
import { MapData, TilesetData, Layer } from '@/types/editor'
import { exportMap } from '@/hooks/useExportMap'

interface UseMapManagerOptions {
  tilesets: TilesetData[]
  layers: Layer[]
  onMapSelected?: (layers: Layer[]) => void
  onClearActiveMap?: () => void
  onOpenConfirmDialog?: (config: { title: string; description: string; action: () => void }) => void
}

export function useMapManager(options: UseMapManagerOptions) {
  const { tilesets, layers, onMapSelected, onClearActiveMap, onOpenConfirmDialog } = options

  const [maps, setMaps] = useState<MapData[]>([])
  const [mapFolders, setMapFolders] = useState<string[]>([])
  const [activeMap, setActiveMap] = useState<MapData | null>(null)
  const [expandedMapFolders, setExpandedMapFolders] = useState<Set<string>>(new Set())
  const [selectedMapFolder, setSelectedMapFolder] = useState<string | null>(null)

  const loadMaps = useCallback(async () => {
    if (!window.electronAPI) return
    const mapRes = await window.electronAPI.getMaps()
    if (mapRes.success) {
      setMapFolders(mapRes.folders || [])
      setMaps(mapRes.maps || [])
    }
  }, [])

  const toggleMapFolder = useCallback((folder: string) => {
    setExpandedMapFolders(prev => {
      const next = new Set(prev)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })
  }, [])

  const onSelectMap = useCallback((m: MapData) => {
    setActiveMap(m)
    const initLayers = m.layers || []
    onMapSelected?.(initLayers)
  }, [onMapSelected])

  const handleDeleteMap = useCallback((folderPath: string | null, fileName: string) => {
    onOpenConfirmDialog?.({
      title: 'Delete Map',
      description: `Are you sure you want to delete map "${fileName}"?`,
      action: async () => {
        if (!window.electronAPI) return
        const res = await window.electronAPI.deleteMap(folderPath, fileName)
        if (res.success) {
          if (activeMap?.fileName === fileName && activeMap?.folderPath === folderPath) {
            setActiveMap(null)
            onClearActiveMap?.()
          }
          loadMaps()
        } else {
          alert(res.error)
        }
      },
    })
  }, [activeMap, onClearActiveMap, onOpenConfirmDialog, loadMaps])

  const handleDeleteMapFolder = useCallback((folderPath: string) => {
    onOpenConfirmDialog?.({
      title: 'Delete Map Folder',
      description: `Are you sure you want to delete folder "${folderPath}" and all its contents?`,
      action: async () => {
        if (!window.electronAPI) return
        const res = await window.electronAPI.deleteMapFolder(folderPath)
        if (res.success) {
          if (selectedMapFolder === folderPath) setSelectedMapFolder(null)
          if (activeMap?.folderPath === folderPath || activeMap?.folderPath?.startsWith(folderPath + '/')) {
            setActiveMap(null)
            onClearActiveMap?.()
          }
          loadMaps()
        } else {
          alert(res.error)
        }
      },
    })
  }, [activeMap, selectedMapFolder, onClearActiveMap, onOpenConfirmDialog, loadMaps])

  const handleMapDrop = useCallback(async (e: React.DragEvent, targetFolder: string | null) => {
    e.preventDefault()
    const fileName = e.dataTransfer.getData('mapFileName')
    const sourceFolder = e.dataTransfer.getData('mapSourceFolder')
    if (!fileName || sourceFolder === String(targetFolder)) return
    if (!window.electronAPI) return
    const res = await window.electronAPI.moveMap(
      fileName,
      sourceFolder === 'null' ? null : sourceFolder,
      targetFolder
    )
    if (res.success) loadMaps()
    else alert(res.error)
  }, [loadMaps])

  const handleExportMap = useCallback((m: any) => {
    exportMap(m, tilesets, activeMap, layers)
  }, [tilesets, activeMap, layers])

  return {
    maps,
    setMaps,
    mapFolders,
    setMapFolders,
    activeMap,
    setActiveMap,
    expandedMapFolders,
    setExpandedMapFolders,
    selectedMapFolder,
    setSelectedMapFolder,
    loadMaps,
    toggleMapFolder,
    onSelectMap,
    handleDeleteMap,
    handleDeleteMapFolder,
    handleMapDrop,
    handleExportMap,
  }
}
