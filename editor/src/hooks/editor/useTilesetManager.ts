import { useState, useEffect, useCallback } from 'react'
import { TilesetData } from '@/types/editor'

interface UseTilesetManagerOptions {
  onOpenImportDialog?: (data: { sourcePath: string; defaultName: string; targetFolder: string | null }) => void
}

export function useTilesetManager(options: UseTilesetManagerOptions = {}) {
  const { onOpenImportDialog } = options

  const [tilesets, setTilesets] = useState<TilesetData[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [activeTileset, setActiveTileset] = useState<TilesetData | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [tilesetDimensions, setTilesetDimensions] = useState<{ width: number; height: number } | null>(null)
  const [hoverTile, setHoverTile] = useState<{ x: number; y: number } | null>(null)
  const [tilesetSelectionStart, setTilesetSelectionStart] = useState<{ x: number; y: number } | null>(null)
  const [tilesetSelectionCurrent, setTilesetSelectionCurrent] = useState<{ x: number; y: number } | null>(null)

  const loadTilesets = useCallback(async () => {
    if (!window.electronAPI) return
    const res = await window.electronAPI.getTilesets()
    if (res.success) {
      setFolders(res.folders || [])
      setTilesets(res.tilesets || [])
    }
  }, [])

  const toggleFolder = useCallback((folder: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })
  }, [])

  const handlePickFile = useCallback(async (targetFolder: string | null = null) => {
    if (!window.electronAPI) return
    const res = await window.electronAPI.pickTilesetFile()
    if (res.success && res.sourcePath) {
      onOpenImportDialog?.({
        sourcePath: res.sourcePath,
        defaultName: res.defaultName || '',
        targetFolder,
      })
    }
  }, [onOpenImportDialog])

  return {
    tilesets,
    setTilesets,
    folders,
    setFolders,
    activeTileset,
    setActiveTileset,
    expandedFolders,
    setExpandedFolders,
    tilesetDimensions,
    setTilesetDimensions,
    hoverTile,
    setHoverTile,
    tilesetSelectionStart,
    setTilesetSelectionStart,
    tilesetSelectionCurrent,
    setTilesetSelectionCurrent,
    loadTilesets,
    toggleFolder,
    handlePickFile,
  }
}
