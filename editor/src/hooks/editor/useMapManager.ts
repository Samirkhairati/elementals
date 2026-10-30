import { useState, useCallback } from 'react'
import { MapData, Layer, EntityData } from '@/types/editor'
import { mapSaveQueue } from '@/lib/saveQueue'
import { useSyncedState } from '@/hooks/useSyncedState'

interface UseMapManagerOptions {
  onMapSelected?: (layers: Layer[], entities?: EntityData[]) => void
  /** Called after the active map was removed (deleted) on disk. */
  onClearActiveMap?: () => void
  onOpenConfirmDialog?: (config: { title: string; description: string; action: () => void }) => void
}

export function useMapManager(options: UseMapManagerOptions = {}) {
  const { onMapSelected, onClearActiveMap, onOpenConfirmDialog } = options

  const [maps, setMaps] = useState<MapData[]>([])
  const [mapFolders, setMapFolders] = useState<string[]>([])
  const [activeMap, setActiveMapOnly, activeMapRef] = useSyncedState<MapData | null>(null)
  const [expandedMapFolders, setExpandedMapFolders] = useState<Set<string>>(new Set())

  /** Latest active map, readable synchronously. */
  const getActiveMap = useCallback(() => activeMapRef.current, [activeMapRef])

  /**
   * Set the active map and mirror it into `maps` (so inactive tabs / re-selection see current data).
   * The next value is computed from the ref, outside of React updaters, so the `maps` sync runs once.
   */
  const setActiveMapAndSync = useCallback(
    (action: React.SetStateAction<MapData | null>) => {
      const prevActive = activeMapRef.current
      const nextActive = typeof action === 'function' ? action(prevActive) : action
      if (nextActive === prevActive) return
      setActiveMapOnly(nextActive)
      if (nextActive) {
        setMaps(prevMaps =>
          prevMaps.map(m =>
            m.fileName === nextActive.fileName && (m.folderPath || null) === (nextActive.folderPath || null)
              ? nextActive
              : m
          )
        )
      }
    },
    [activeMapRef, setActiveMapOnly]
  )

  const loadMaps = useCallback(async () => {
    if (!window.electronAPI) return []
    const mapRes = await window.electronAPI.getMaps()
    if (mapRes.success) {
      const loadedMaps = mapRes.maps || []
      setMapFolders(mapRes.folders || [])
      setMaps(loadedMaps)
      // A rename rewrites `name` on disk; keep the open map in sync so the next
      // autosave does not write the stale name back over it.
      const current = activeMapRef.current
      const onDisk = current
        ? loadedMaps.find(
            m => m.fileName === current.fileName && (m.folderPath || null) === (current.folderPath || null)
          )
        : undefined
      if (current && onDisk && onDisk.name !== current.name) {
        setActiveMapOnly({ ...current, name: onDisk.name })
      }
      return loadedMaps
    }
    return []
  }, [activeMapRef, setActiveMapOnly])

  const toggleMapFolder = useCallback((folder: string) => {
    setExpandedMapFolders(prev => {
      const next = new Set(prev)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })
  }, [])

  const [deletedMapsHistory, setDeletedMapsHistory] = useState<
    { mapData: MapData; folderPath: string | null; fileName: string }[]
  >([])
  const [restoredMapsHistory, setRestoredMapsHistory] = useState<
    { mapData: MapData; folderPath: string | null; fileName: string }[]
  >([])

  const onSelectMap = useCallback((m: MapData) => {
    setActiveMapAndSync(m)
    const initLayers = m.layers || []
    const initEntities = m.entities || []
    onMapSelected?.(initLayers, initEntities)
  }, [onMapSelected, setActiveMapAndSync])

  const handleDeleteMap = useCallback((folderPath: string | null, fileName: string) => {
    const targetMap =
      maps.find(m => m.fileName === fileName && m.folderPath === folderPath) ||
      (activeMap?.fileName === fileName && activeMap?.folderPath === folderPath ? activeMap : null)

    onOpenConfirmDialog?.({
      title: 'Delete Map',
      description: `Are you sure you want to delete map "${fileName}"?`,
      action: async () => {
        if (!window.electronAPI) return
        if (targetMap) {
          setDeletedMapsHistory(prev => [...prev, { mapData: targetMap, folderPath, fileName }])
          setRestoredMapsHistory([])
        }
        // A pending debounced autosave must never land after (and resurrect) the deleted file.
        await mapSaveQueue.flushAll()
        const res = await window.electronAPI.deleteMap(folderPath, fileName)
        if (res.success) {
          if (activeMap?.fileName === fileName && activeMap?.folderPath === folderPath) {
            setActiveMapAndSync(null)
            onClearActiveMap?.()
          }
          loadMaps()
        } else {
          alert(res.error)
        }
      },
    })
  }, [maps, activeMap, onClearActiveMap, onOpenConfirmDialog, loadMaps, setActiveMapAndSync])

  const undoDeleteMap = useCallback(async () => {
    if (deletedMapsHistory.length === 0 || !window.electronAPI) return false
    const lastDeleted = deletedMapsHistory[deletedMapsHistory.length - 1]
    setDeletedMapsHistory(prev => prev.slice(0, -1))
    setRestoredMapsHistory(prev => [...prev, lastDeleted])
    await window.electronAPI.saveMap(lastDeleted.folderPath, lastDeleted.fileName, lastDeleted.mapData)
    await loadMaps()
    onSelectMap(lastDeleted.mapData)
    return true
  }, [deletedMapsHistory, loadMaps, onSelectMap])

  const redoDeleteMap = useCallback(async () => {
    if (restoredMapsHistory.length === 0 || !window.electronAPI) return false
    const lastRestored = restoredMapsHistory[restoredMapsHistory.length - 1]
    setRestoredMapsHistory(prev => prev.slice(0, -1))
    setDeletedMapsHistory(prev => [...prev, lastRestored])
    await mapSaveQueue.flushAll()
    await window.electronAPI.deleteMap(lastRestored.folderPath, lastRestored.fileName)
    if (activeMap?.fileName === lastRestored.fileName && activeMap?.folderPath === lastRestored.folderPath) {
      setActiveMapAndSync(null)
      onClearActiveMap?.()
    }
    await loadMaps()
    return true
  }, [restoredMapsHistory, activeMap, onClearActiveMap, loadMaps, setActiveMapAndSync])

  const handleDeleteMapFolder = useCallback((folderPath: string) => {
    onOpenConfirmDialog?.({
      title: 'Delete Map Folder',
      description: `Are you sure you want to delete folder "${folderPath}" and all its contents?`,
      action: async () => {
        if (!window.electronAPI) return
        await mapSaveQueue.flushAll()
        const res = await window.electronAPI.deleteMapFolder(folderPath)
        if (res.success) {
          if (activeMap?.folderPath === folderPath || activeMap?.folderPath?.startsWith(folderPath + '/')) {
            setActiveMapAndSync(null)
            onClearActiveMap?.()
          }
          loadMaps()
        } else {
          alert(res.error)
        }
      },
    })
  }, [activeMap, onClearActiveMap, onOpenConfirmDialog, loadMaps, setActiveMapAndSync])

  const handleMapDrop = useCallback(async (e: React.DragEvent, targetFolder: string | null) => {
    e.preventDefault()
    const fileName = e.dataTransfer.getData('mapFileName')
    const sourceFolder = e.dataTransfer.getData('mapSourceFolder')
    if (!fileName || sourceFolder === String(targetFolder)) return
    if (!window.electronAPI) return
    await mapSaveQueue.flushAll()
    const res = await window.electronAPI.moveMap(
      fileName,
      sourceFolder === 'null' ? null : sourceFolder,
      targetFolder
    )
    if (res.success) loadMaps()
    else alert(res.error)
  }, [loadMaps])

  return {
    maps,
    setMaps,
    mapFolders,
    setMapFolders,
    activeMap,
    getActiveMap,
    setActiveMap: setActiveMapAndSync,
    expandedMapFolders,
    setExpandedMapFolders,
    loadMaps,
    toggleMapFolder,
    onSelectMap,
    handleDeleteMap,
    handleDeleteMapFolder,
    handleMapDrop,
    undoDeleteMap,
    redoDeleteMap,
    deletedMapsHistory,
    restoredMapsHistory,
  }
}
