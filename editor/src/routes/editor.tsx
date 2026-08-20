import { useState, useRef, useEffect } from 'react'
import { ResizableHandle, ResizablePanelGroup } from "@/components/ui/resizable"

// Types
import { Layer, TileSelection, ActiveTool, PaintMode, DebugInfo, MapData, TilesetData } from '@/types/editor'

// Hooks
import { useHistory } from '@/hooks/useHistory'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { usePaintTools } from '@/hooks/usePaintTools'
import { useDragResize } from '@/hooks/useDragResize'
import { exportMap } from '@/hooks/useExportMap'

// Layout
import { EditorContext } from '@/components/editor/layout/EditorContext'
import { EditorDockview } from '@/components/editor/layout/EditorDockview'
import { EditorDialogs } from '@/components/editor/layout/EditorDialogs'

export function EditorPage() {
  // ── Tilesets state ──────────────────────────────────────────────────────
  const [tilesets, setTilesets] = useState<TilesetData[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [activeTileset, setActiveTileset] = useState<TilesetData | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [tilesetDimensions, setTilesetDimensions] = useState<{ width: number; height: number } | null>(null)
  const [hoverTile, setHoverTile] = useState<{ x: number; y: number } | null>(null)
  const [tilesetSelectionStart, setTilesetSelectionStart] = useState<{ x: number; y: number } | null>(null)
  const [tilesetSelectionCurrent, setTilesetSelectionCurrent] = useState<{ x: number; y: number } | null>(null)

  // ── Maps state ──────────────────────────────────────────────────────────
  const [maps, setMaps] = useState<MapData[]>([])
  const [mapFolders, setMapFolders] = useState<string[]>([])
  const [activeMap, setActiveMap] = useState<MapData | null>(null)
  const [expandedMapFolders, setExpandedMapFolders] = useState<Set<string>>(new Set())
  const [selectedMapFolder, setSelectedMapFolder] = useState<string | null>(null)

  // ── Layers state ────────────────────────────────────────────────────────
  const [layers, setLayers] = useState<Layer[]>([])
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null)

  // ── Tile selection ──────────────────────────────────────────────────────
  const [tileSelection, setTileSelection] = useState<TileSelection | null>(null)

  // ── Tools & Paint Modes ─────────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState<ActiveTool>('brush')
  const [paintMode, setPaintMode] = useState<PaintMode>('discontinuous')
  const [isPainting, setIsPainting] = useState(false)
  const [paintStartPos, setPaintStartPos] = useState<{ x: number; y: number } | null>(null)

  // ── Debug ───────────────────────────────────────────────────────────────
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null)

  // ── Dialog state ─────────────────────────────────────────────────────────
  const [importDialog, setImportDialog] = useState<{ open: boolean; sourcePath?: string; defaultName?: string; targetFolder?: string | null }>({ open: false })
  const [nameInput, setNameInput] = useState("")
  const [createFolderDialog, setCreateFolderDialog] = useState<{ open: boolean; parentPath?: string | null }>({ open: false })
  const [createFolderName, setCreateFolderName] = useState("")
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; type: 'folder' | 'tileset' | 'map-folder' | 'map'; oldPath?: string; oldName?: string; targetFolder?: string | null }>({ open: false, type: 'folder' })
  const [renameInput, setRenameInput] = useState("")
  const [createMapDialog, setCreateMapDialog] = useState<{ open: boolean; parentPath?: string | null }>({ open: false })
  const [createMapData, setCreateMapData] = useState({ name: '', width: 50, height: 50 })
  const [createMapFolderDialog, setCreateMapFolderDialog] = useState<{ open: boolean; parentPath?: string | null }>({ open: false })
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; description: string; action: () => void }>({ open: false, title: '', description: '', action: () => {} })
  const [createMapFolderName, setCreateMapFolderName] = useState("")

  // Drag handle hook removed for dockview

  // ── History hook ─────────────────────────────────────────────────────────
  const {
    history,
    historyIndex,
    setHistory,
    setHistoryIndex,
    commitHistory,
    handleCommit,
    handleUndo,
    handleRedo,
  } = useHistory(setLayers)

  const boundHandleUndo = () => handleUndo(layers, setLayers, activeMap, setActiveMap)
  const boundHandleRedo = () => handleRedo(layers, setLayers, activeMap, setActiveMap)

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useKeyboardShortcuts({
    handleUndo: boundHandleUndo,
    handleRedo: boundHandleRedo,
    setActiveTool,
    deps: [history, historyIndex, activeMap],
  })

  // ── Paint tools hook ─────────────────────────────────────────────────────
  const { handlePaint, handlePaintBucket, handleRectangleFill } = usePaintTools({
    activeMap,
    activeLayerId,
    tileSelection,
    activeTool,
    paintMode,
    paintStartPos,
    setLayers,
    commitHistory,
    setDebugInfo,
    setActiveMap,
  })

  // ── Data loading ─────────────────────────────────────────────────────────
  const loadData = async () => {
    if (!window.electronAPI) return
    const res = await window.electronAPI.getTilesets()
    if (res.success) {
      setFolders(res.folders || [])
      setTilesets(res.tilesets || [])
    }
    const mapRes = await window.electronAPI.getMaps()
    if (mapRes.success) {
      setMapFolders(mapRes.folders || [])
      setMaps(mapRes.maps || [])
    }
  }

  useEffect(() => { loadData() }, [])

  // ── Collision Virtual Tile Effect ─────────────────────────────────────────
  const layersRef = useRef(layers)
  useEffect(() => { layersRef.current = layers }, [layers])
  
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

  // ── Tileset folder keyboard delete ────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedFolder) {
        const targetTag = (e.target as HTMLElement)?.tagName
        if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return
        const hasSubfolders = folders.some(sub => sub.startsWith(selectedFolder + '/'))
        const hasTilesets = tilesets.some(t => t.folderPath === selectedFolder || (t.folderPath && t.folderPath.startsWith(selectedFolder + '/')))
        if (!hasSubfolders && !hasTilesets) {
          handleDeleteFolder(selectedFolder)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedFolder, folders, tilesets])

  // ── Layer helpers ─────────────────────────────────────────────────────────
  const updateLayers = (newLayers: Layer[]) => {
    setLayers(newLayers)
    if (activeMap) {
      const updatedMap = { ...activeMap, layers: newLayers }
      setActiveMap(updatedMap)
      window.electronAPI?.saveMap(activeMap.folderPath, activeMap.fileName, updatedMap)
    }
  }

  const toggleLayerVisibility = (id: string) => updateLayers(layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l))
  const toggleLayerLock = (id: string) => updateLayers(layers.map(l => l.id === id ? { ...l, locked: !l.locked } : l))

  const handleCreateLayer = () => {
    let counter = 1
    while (layers.some(l => l.name === `Layer ${counter}`)) {
      counter++
    }
    const newLayer: Layer = { id: crypto.randomUUID(), name: `Layer ${counter}`, type: 'tile', visible: true, locked: false }
    const newLayers = [newLayer, ...layers]
    updateLayers(newLayers)
    setActiveLayerId(newLayer.id)
  }

  const handleDeleteLayer = (id: string) => {
    const newLayers = layers.filter(l => l.id !== id)
    updateLayers(newLayers)
    if (activeLayerId === id) {
      setActiveLayerId(newLayers.length > 0 ? newLayers[0].id : null)
    }
  }

  const handleReorderLayers = (newLayers: Layer[]) => {
    updateLayers(newLayers)
  }

  // ── Map selection helper ───────────────────────────────────────────────────
  const onSelectMap = (m: MapData) => {
    setActiveMap(m)
    const initLayers = m.layers || []
    setLayers(initLayers)
    setActiveLayerId(initLayers?.[0]?.id || null)
    setHistory([{ layers: JSON.parse(JSON.stringify(initLayers)) }])
    setHistoryIndex(0)
  }

  // ── Tileset CRUD ───────────────────────────────────────────────────────────
  const handlePickFile = async (targetFolder: string | null = null) => {
    if (!window.electronAPI) return
    const res = await window.electronAPI.pickTilesetFile()
    if (res.success && res.sourcePath) {
      setNameInput(res.defaultName || "")
      setImportDialog({ open: true, sourcePath: res.sourcePath, defaultName: res.defaultName, targetFolder })
    }
  }

  const handleConfirmImport = async () => {
    const cleanName = nameInput.trim()
    if (!cleanName) { alert("Tileset name cannot be empty"); return }
    if (!window.electronAPI || !importDialog.sourcePath) return
    const res = await window.electronAPI.importTileset(importDialog.sourcePath, cleanName, importDialog.targetFolder || null)
    if (res.success) {
      if (importDialog.targetFolder) setExpandedFolders(prev => new Set(prev).add(importDialog.targetFolder!))
      setImportDialog({ open: false })
      loadData()
    } else {
      alert("Import failed: " + res.error)
    }
  }

  const handleOpenCreateFolderDialog = (parentPath: string | null = null) => {
    let counter = 1
    let defaultName = `Folder ${counter}`
    while (folders.includes(parentPath ? `${parentPath}/${defaultName}` : defaultName)) {
      counter++
      defaultName = `Folder ${counter}`
    }
    setCreateFolderName(defaultName)
    setCreateFolderDialog({ open: true, parentPath })
  }

  const handleConfirmCreateFolder = async () => {
    const cleanName = createFolderName.trim()
    if (!cleanName) { alert("Folder name cannot be empty"); return }
    const targetPath = createFolderDialog.parentPath ? `${createFolderDialog.parentPath}/${cleanName}` : cleanName
    if (folders.includes(targetPath)) { alert(`A folder named "${cleanName}" already exists in this location.`); return }
    if (!window.electronAPI) return
    const res = await window.electronAPI.createFolder(createFolderDialog.parentPath || null, cleanName)
    if (res.success) {
      if (createFolderDialog.parentPath) setExpandedFolders(prev => new Set(prev).add(createFolderDialog.parentPath!))
      setCreateFolderDialog({ open: false })
      loadData()
    } else { alert(res.error) }
  }

  const handleDeleteFolder = (folderPath: string) => {
    setConfirmDialog({
      open: true,
      title: "Delete Folder",
      description: `Are you sure you want to delete folder "${folderPath}"?`,
      action: async () => {
        if (!window.electronAPI) return
        const res = await window.electronAPI.deleteFolder(folderPath)
        if (res.success) {
          if (selectedFolder === folderPath) setSelectedFolder(null)
          loadData()
        } else { alert(res.error) }
      }
    })
  }

  const handleDrop = async (e: React.DragEvent, targetFolder: string | null) => {
    e.preventDefault()
    const fileName = e.dataTransfer.getData('fileName')
    const sourceFolder = e.dataTransfer.getData('sourceFolder')
    if (!fileName || sourceFolder === String(targetFolder)) return
    if (!window.electronAPI) return
    const res = await window.electronAPI.moveTileset(fileName, sourceFolder === 'null' ? null : sourceFolder, targetFolder)
    if (res.success) loadData()
    else alert(res.error)
  }

  const toggleFolder = (folder: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })
  }

  // ── Map CRUD ───────────────────────────────────────────────────────────────
  const handleDeleteMap = (folderPath: string | null, fileName: string) => {
    setConfirmDialog({
      open: true,
      title: "Delete Map",
      description: `Are you sure you want to delete map "${fileName}"?`,
      action: async () => {
        if (!window.electronAPI) return
        const res = await window.electronAPI.deleteMap(folderPath, fileName)
        if (res.success) {
          if (activeMap?.fileName === fileName && activeMap?.folderPath === folderPath) {
            setActiveMap(null); setLayers([]); setActiveLayerId(null)
          }
          loadData()
        } else { alert(res.error) }
      }
    })
  }

  const handleDeleteMapFolder = (folderPath: string) => {
    setConfirmDialog({
      open: true,
      title: "Delete Map Folder",
      description: `Are you sure you want to delete map folder "${folderPath}"?`,
      action: async () => {
        if (!window.electronAPI) return
        const res = await window.electronAPI.deleteMapFolder(folderPath)
        if (res.success) {
          if (selectedMapFolder === folderPath) setSelectedMapFolder(null)
          loadData()
        } else { alert(res.error) }
      }
    })
  }

  const handleConfirmCreateMapFolder = async () => {
    const cleanName = createMapFolderName.trim()
    if (!cleanName) { alert("Folder name cannot be empty"); return }
    const targetPath = createMapFolderDialog.parentPath ? `${createMapFolderDialog.parentPath}/${cleanName}` : cleanName
    if (mapFolders.includes(targetPath)) { alert(`A folder named "${cleanName}" already exists in this location.`); return }
    if (!window.electronAPI) return
    const res = await window.electronAPI.createMapFolder(createMapFolderDialog.parentPath || null, cleanName)
    if (res.success) {
      if (createMapFolderDialog.parentPath) setExpandedMapFolders(prev => new Set(prev).add(createMapFolderDialog.parentPath!))
      setCreateMapFolderDialog({ open: false })
      loadData()
    } else { alert(res.error) }
  }

  const handleConfirmCreateMap = async () => {
    const cleanName = createMapData.name.trim()
    if (!cleanName || createMapData.width <= 0 || createMapData.height <= 0) { alert("Invalid map data"); return }
    if (!window.electronAPI) return
    const res = await window.electronAPI.createMap(cleanName, createMapData.width, createMapData.height, createMapDialog.parentPath || null)
    if (res.success) {
      if (createMapDialog.parentPath) setExpandedMapFolders(prev => new Set(prev).add(createMapDialog.parentPath!))
      setCreateMapDialog({ open: false })
      loadData()
      const initLayers = res.map.layers || []
      setActiveMap(res.map)
      setLayers(initLayers)
      setActiveLayerId(initLayers?.[0]?.id || null)
      setHistory([{ layers: JSON.parse(JSON.stringify(initLayers)) }])
      setHistoryIndex(0)
    } else { alert(res.error) }
  }

  const handleMapDrop = async (e: React.DragEvent, targetFolder: string | null) => {
    e.preventDefault()
    const fileName = e.dataTransfer.getData('mapFileName')
    const sourceFolder = e.dataTransfer.getData('mapSourceFolder')
    if (!fileName || sourceFolder === String(targetFolder)) return
    if (!window.electronAPI) return
    const res = await window.electronAPI.moveMap(fileName, sourceFolder === 'null' ? null : sourceFolder, targetFolder)
    if (res.success) loadData()
    else alert(res.error)
  }

  const toggleMapFolder = (folder: string) => {
    setExpandedMapFolders(prev => {
      const next = new Set(prev)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })
  }

  const handleConfirmRename = async () => {
    const cleanName = renameInput.trim()
    if (!cleanName) { alert("Name cannot be empty"); return }
    if (!window.electronAPI) return
    let res
    if (renameDialog.type === 'folder' && renameDialog.oldPath) {
      res = await window.electronAPI.renameFolder(renameDialog.oldPath, cleanName)
    } else if (renameDialog.type === 'tileset' && renameDialog.oldPath) {
      res = await window.electronAPI.renameTileset(renameDialog.targetFolder || null, renameDialog.oldPath, cleanName)
    } else if (renameDialog.type === 'map-folder' && renameDialog.oldPath) {
      res = await window.electronAPI.renameMapFolder(renameDialog.oldPath, cleanName)
    } else if (renameDialog.type === 'map' && renameDialog.oldPath) {
      res = await window.electronAPI.renameMap(renameDialog.targetFolder || null, renameDialog.oldPath, cleanName)
    }
    if (res?.success) { setRenameDialog({ open: false, type: 'folder' }); loadData() }
    else { alert(res?.error) }
  }

  const handleExportMap = (m: any) => exportMap(m, tilesets, activeMap, layers)

  const activeLayerType = layers.find(l => l.id === activeLayerId)?.type || null

  const contextValue = {
    maps, mapFolders, activeMap, expandedMapFolders, selectedMapFolder, setSelectedMapFolder, toggleMapFolder, setCreateMapData, setCreateMapDialog, setCreateMapFolderName, setCreateMapFolderDialog, setRenameInput, setRenameDialog, handleDeleteMapFolder, handleDeleteMap, handleExportMap, handleMapDrop, onSelectMap,
    layers, activeLayerId, setActiveLayerId, toggleLayerVisibility, toggleLayerLock, handleDeleteLayer, handleReorderLayers, handleCreateLayer, updateLayers,
    historyIndex, historyLength: history.length, activeTool, paintMode, handleUndo: boundHandleUndo, handleRedo: boundHandleRedo, setActiveTool, setPaintMode, tilesets, tileSelection, setTileSelection, isPainting, setIsPainting, paintStartPos, setPaintStartPos, debugInfo, handlePaint, handlePaintBucket, handleRectangleFill, handleCommit,
    folders, activeTileset, setActiveTileset, expandedFolders, selectedFolder, setSelectedFolder, toggleFolder, handlePickFile, handleOpenCreateFolderDialog, handleDeleteFolder, handleDrop, activeLayerType,
    tilesetDimensions, setTilesetDimensions, tilesetSelectionStart, setTilesetSelectionStart, tilesetSelectionCurrent, setTilesetSelectionCurrent, hoverTile, setHoverTile
  }

  return (
    <EditorContext.Provider value={contextValue}>
      <div className="flex flex-1 overflow-hidden h-full w-full">
        <EditorDockview />

      <EditorDialogs
        importDialog={importDialog}
        setImportDialog={setImportDialog}
        nameInput={nameInput}
        setNameInput={setNameInput}
        handleConfirmImport={handleConfirmImport}
        createFolderDialog={createFolderDialog}
        setCreateFolderDialog={setCreateFolderDialog}
        createFolderName={createFolderName}
        setCreateFolderName={setCreateFolderName}
        handleConfirmCreateFolder={handleConfirmCreateFolder}
        renameDialog={renameDialog}
        setRenameDialog={setRenameDialog}
        renameInput={renameInput}
        setRenameInput={setRenameInput}
        handleConfirmRename={handleConfirmRename}
        createMapFolderDialog={createMapFolderDialog}
        setCreateMapFolderDialog={setCreateMapFolderDialog}
        createMapFolderName={createMapFolderName}
        setCreateMapFolderName={setCreateMapFolderName}
        handleConfirmCreateMapFolder={handleConfirmCreateMapFolder}
        createMapDialog={createMapDialog}
        setCreateMapDialog={setCreateMapDialog}
        createMapData={createMapData}
        setCreateMapData={setCreateMapData}
        handleConfirmCreateMap={handleConfirmCreateMap}
        confirmDialog={confirmDialog}
        setConfirmDialog={setConfirmDialog}
      />
    </div>
    </EditorContext.Provider>
  )
}
