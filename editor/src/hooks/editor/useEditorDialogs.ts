import { useState, useCallback } from 'react'
import { MapData } from '@/types/editor'
import { mapSaveQueue } from '@/lib/saveQueue'

interface UseEditorDialogsOptions {
  folders: string[]
  mapFolders: string[]
  setExpandedFolders: React.Dispatch<React.SetStateAction<Set<string>>>
  setExpandedMapFolders: React.Dispatch<React.SetStateAction<Set<string>>>
  loadData: () => Promise<void>
  onMapCreated?: (map: MapData) => void
  onRenameLayer?: (id: string, newName: string) => void
}

export function useEditorDialogs(options: UseEditorDialogsOptions) {
  const {
    folders,
    mapFolders,
    setExpandedFolders,
    setExpandedMapFolders,
    loadData,
    onMapCreated,
    onRenameLayer,
  } = options

  // Dialog open/data states
  const [renameDialog, setRenameDialog] = useState<{
    open: boolean
    type: 'folder' | 'map-folder' | 'map' | 'layer'
    oldPath?: string
    oldName?: string
    targetFolder?: string | null
  }>({ open: false, type: 'folder' })
  const [renameInput, setRenameInput] = useState('')

  const [createMapDialog, setCreateMapDialog] = useState<{
    open: boolean
    parentPath?: string | null
  }>({ open: false })
  const [createMapData, setCreateMapData] = useState({ name: '', width: 50, height: 50 })

  const [createMapFolderDialog, setCreateMapFolderDialog] = useState<{
    open: boolean
    parentPath?: string | null
  }>({ open: false })
  const [createMapFolderName, setCreateMapFolderName] = useState('')

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    action: () => void
  }>({ open: false, title: '', description: '', action: () => {} })

  // ── Universal Rename Confirmation ─────────────────────────────────────────
  const handleConfirmRename = useCallback(async () => {
    const cleanName = renameInput.trim()
    if (!cleanName) {
      alert('Name cannot be empty')
      return
    }
    if (renameDialog.type === 'layer' && renameDialog.oldPath) {
      onRenameLayer?.(renameDialog.oldPath, cleanName)
      setRenameDialog({ open: false, type: 'folder' })
      return
    }
    if (!window.electronAPI) return
    let res
    if (renameDialog.type === 'map-folder' && renameDialog.oldPath) {
      // Pending debounced autosaves target the old path: write them before the files move.
      await mapSaveQueue.flushAll()
      res = await window.electronAPI.renameMapFolder(renameDialog.oldPath, cleanName)
    } else if (renameDialog.type === 'map' && renameDialog.oldPath) {
      await mapSaveQueue.flushAll()
      res = await window.electronAPI.renameMap(
        renameDialog.targetFolder || null,
        renameDialog.oldPath,
        cleanName
      )
    }
    if (res?.success) {
      setRenameDialog({ open: false, type: 'folder' })
      loadData()
    } else {
      alert(res?.error)
    }
  }, [renameInput, renameDialog, loadData, onRenameLayer])

  // ── Create Map Folder Confirmation ────────────────────────────────────────
  const handleConfirmCreateMapFolder = useCallback(async () => {
    const cleanName = createMapFolderName.trim()
    if (!cleanName) {
      alert('Folder name cannot be empty')
      return
    }
    const targetPath = createMapFolderDialog.parentPath
      ? `${createMapFolderDialog.parentPath}/${cleanName}`
      : cleanName
    if (mapFolders.includes(targetPath)) {
      alert(`A folder named "${cleanName}" already exists in this location.`)
      return
    }
    if (!window.electronAPI) return
    const res = await window.electronAPI.createMapFolder(
      createMapFolderDialog.parentPath || null,
      cleanName
    )
    if (res.success) {
      if (createMapFolderDialog.parentPath) {
        setExpandedMapFolders(prev => new Set(prev).add(createMapFolderDialog.parentPath!))
      }
      setCreateMapFolderDialog({ open: false })
      document.body.style.pointerEvents = ''
      loadData()
    } else {
      alert(res.error)
    }
  }, [createMapFolderName, createMapFolderDialog, mapFolders, setExpandedMapFolders, loadData])

  // ── Create Map Confirmation ───────────────────────────────────────────────
  const handleConfirmCreateMap = useCallback(async () => {
    const cleanName = createMapData.name.trim()
    if (!cleanName || createMapData.width <= 0 || createMapData.height <= 0) {
      alert('Invalid map data')
      return
    }
    if (!window.electronAPI) return
    const res = await window.electronAPI.createMap(
      cleanName,
      createMapData.width,
      createMapData.height,
      createMapDialog.parentPath || null
    )
    if (res.success) {
      if (createMapDialog.parentPath) {
        setExpandedMapFolders(prev => new Set(prev).add(createMapDialog.parentPath!))
      }
      setCreateMapDialog({ open: false })
      document.body.style.pointerEvents = ''
      loadData()
      onMapCreated?.(res.map)
    } else {
      alert(res.error)
    }
  }, [createMapData, createMapDialog, setExpandedMapFolders, loadData, onMapCreated])

  return {
    renameDialog,
    setRenameDialog,
    renameInput,
    setRenameInput,
    handleConfirmRename,
    createMapFolderDialog,
    setCreateMapFolderDialog,
    createMapFolderName,
    setCreateMapFolderName,
    handleConfirmCreateMapFolder,
    createMapDialog,
    setCreateMapDialog,
    createMapData,
    setCreateMapData,
    handleConfirmCreateMap,
    confirmDialog,
    setConfirmDialog,
  }
}
