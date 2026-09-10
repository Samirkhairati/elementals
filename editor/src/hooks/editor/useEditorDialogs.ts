import { useState, useCallback } from 'react'
import { MapData } from '@/types/editor'

interface UseEditorDialogsOptions {
  folders: string[]
  mapFolders: string[]
  setExpandedFolders: React.Dispatch<React.SetStateAction<Set<string>>>
  setExpandedMapFolders: React.Dispatch<React.SetStateAction<Set<string>>>
  loadData: () => Promise<void>
  onMapCreated?: (map: MapData) => void
}

export function useEditorDialogs(options: UseEditorDialogsOptions) {
  const {
    folders,
    mapFolders,
    setExpandedFolders,
    setExpandedMapFolders,
    loadData,
    onMapCreated,
  } = options

  // Dialog open/data states
  const [importDialog, setImportDialog] = useState<{
    open: boolean
    sourcePath?: string
    defaultName?: string
    targetFolder?: string | null
  }>({ open: false })
  const [nameInput, setNameInput] = useState('')

  const [createFolderDialog, setCreateFolderDialog] = useState<{
    open: boolean
    parentPath?: string | null
  }>({ open: false })
  const [createFolderName, setCreateFolderName] = useState('')

  const [renameDialog, setRenameDialog] = useState<{
    open: boolean
    type: 'folder' | 'tileset' | 'map-folder' | 'map'
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

  // ── Tileset Import Confirmation ───────────────────────────────────────────
  const handleConfirmImport = useCallback(async () => {
    const cleanName = nameInput.trim()
    if (!cleanName) {
      alert('Tileset name cannot be empty')
      return
    }
    if (!window.electronAPI || !importDialog.sourcePath) return
    const res = await window.electronAPI.importTileset(
      importDialog.sourcePath,
      cleanName,
      importDialog.targetFolder || null
    )
    if (res.success) {
      if (importDialog.targetFolder) {
        setExpandedFolders(prev => new Set(prev).add(importDialog.targetFolder!))
      }
      setImportDialog({ open: false })
      loadData()
    } else {
      alert('Import failed: ' + res.error)
    }
  }, [nameInput, importDialog, setExpandedFolders, loadData])

  // ── Create Tileset Folder Confirmation ────────────────────────────────────
  const handleConfirmCreateFolder = useCallback(async () => {
    const cleanName = createFolderName.trim()
    if (!cleanName) {
      alert('Folder name cannot be empty')
      return
    }
    const targetPath = createFolderDialog.parentPath
      ? `${createFolderDialog.parentPath}/${cleanName}`
      : cleanName
    if (folders.includes(targetPath)) {
      alert(`A folder named "${cleanName}" already exists in this location.`)
      return
    }
    if (!window.electronAPI) return
    const res = await window.electronAPI.createFolder(
      createFolderDialog.parentPath || null,
      cleanName
    )
    if (res.success) {
      if (createFolderDialog.parentPath) {
        setExpandedFolders(prev => new Set(prev).add(createFolderDialog.parentPath!))
      }
      setCreateFolderDialog({ open: false })
      loadData()
    } else {
      alert(res.error)
    }
  }, [createFolderName, createFolderDialog, folders, setExpandedFolders, loadData])

  // ── Universal Rename Confirmation ─────────────────────────────────────────
  const handleConfirmRename = useCallback(async () => {
    const cleanName = renameInput.trim()
    if (!cleanName) {
      alert('Name cannot be empty')
      return
    }
    if (!window.electronAPI) return
    let res
    if (renameDialog.type === 'folder' && renameDialog.oldPath) {
      res = await window.electronAPI.renameFolder(renameDialog.oldPath, cleanName)
    } else if (renameDialog.type === 'tileset' && renameDialog.oldPath) {
      res = await window.electronAPI.renameTileset(
        renameDialog.targetFolder || null,
        renameDialog.oldPath,
        cleanName
      )
    } else if (renameDialog.type === 'map-folder' && renameDialog.oldPath) {
      res = await window.electronAPI.renameMapFolder(renameDialog.oldPath, cleanName)
    } else if (renameDialog.type === 'map' && renameDialog.oldPath) {
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
  }, [renameInput, renameDialog, loadData])

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
      loadData()
      onMapCreated?.(res.map)
    } else {
      alert(res.error)
    }
  }, [createMapData, createMapDialog, setExpandedMapFolders, loadData, onMapCreated])

  return {
    importDialog,
    setImportDialog,
    nameInput,
    setNameInput,
    handleConfirmImport,
    createFolderDialog,
    setCreateFolderDialog,
    createFolderName,
    setCreateFolderName,
    handleConfirmCreateFolder,
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
