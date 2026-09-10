import { useState, useEffect, useCallback } from 'react'
import { TilesetData } from '@/types/editor'

interface UseTilesetManagerOptions {
  onOpenImportDialog?: (data: { sourcePath: string; defaultName: string; targetFolder: string | null }) => void
  onOpenCreateFolderDialog?: (parentPath: string | null, defaultName: string) => void
  onOpenConfirmDialog?: (config: { title: string; description: string; action: () => void }) => void
}

export function useTilesetManager(options: UseTilesetManagerOptions = {}) {
  const { onOpenImportDialog, onOpenCreateFolderDialog, onOpenConfirmDialog } = options

  const [tilesets, setTilesets] = useState<TilesetData[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [activeTileset, setActiveTileset] = useState<TilesetData | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
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

  const handleOpenCreateFolderDialog = useCallback((parentPath: string | null = null) => {
    let counter = 1
    let defaultName = `Folder ${counter}`
    while (folders.includes(parentPath ? `${parentPath}/${defaultName}` : defaultName)) {
      counter++
      defaultName = `Folder ${counter}`
    }
    onOpenCreateFolderDialog?.(parentPath, defaultName)
  }, [folders, onOpenCreateFolderDialog])

  const handleDeleteFolder = useCallback((folderPath: string) => {
    onOpenConfirmDialog?.({
      title: 'Delete Folder',
      description: `Are you sure you want to delete folder "${folderPath}"?`,
      action: async () => {
        if (!window.electronAPI) return
        const res = await window.electronAPI.deleteFolder(folderPath)
        if (res.success) {
          if (selectedFolder === folderPath) setSelectedFolder(null)
          loadTilesets()
        } else {
          alert(res.error)
        }
      },
    })
  }, [onOpenConfirmDialog, selectedFolder, loadTilesets])

  const handleDrop = useCallback(async (e: React.DragEvent, targetFolder: string | null) => {
    e.preventDefault()
    const fileName = e.dataTransfer.getData('fileName')
    const sourceFolder = e.dataTransfer.getData('sourceFolder')
    if (!fileName || sourceFolder === String(targetFolder)) return
    if (!window.electronAPI) return
    const res = await window.electronAPI.moveTileset(
      fileName,
      sourceFolder === 'null' ? null : sourceFolder,
      targetFolder
    )
    if (res.success) loadTilesets()
    else alert(res.error)
  }, [loadTilesets])

  // Tileset folder keyboard delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedFolder) {
        const targetTag = (e.target as HTMLElement)?.tagName
        if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return
        const hasSubfolders = folders.some(sub => sub.startsWith(selectedFolder + '/'))
        const hasTilesets = tilesets.some(
          t => t.folderPath === selectedFolder || (t.folderPath && t.folderPath.startsWith(selectedFolder + '/'))
        )
        if (!hasSubfolders && !hasTilesets) {
          handleDeleteFolder(selectedFolder)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedFolder, folders, tilesets, handleDeleteFolder])

  return {
    tilesets,
    setTilesets,
    folders,
    setFolders,
    activeTileset,
    setActiveTileset,
    expandedFolders,
    setExpandedFolders,
    selectedFolder,
    setSelectedFolder,
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
    handleOpenCreateFolderDialog,
    handleDeleteFolder,
    handleDrop,
  }
}
