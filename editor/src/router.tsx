import { createRouter, createRoute, createRootRoute, createHashHistory, Outlet } from '@tanstack/react-router'
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { useThemeStore } from '@/store/themeStore'
import { useEffect, useState, useRef } from 'react'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, FolderPlus, Map as MapIcon, Layers as LayersIcon, LayoutGrid as LayoutGridIcon, ChevronRight, ChevronDown, MousePointer2, Settings2 } from "lucide-react"
import { ResizableHandle, ResizablePanel as OriginalResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
const ResizablePanel = OriginalResizablePanel as any;

// Types
import { Layer, LayerType, TileSelection, ActiveTool, PaintMode, DebugInfo, MapData, TilesetData } from '@/types/editor'

// Hooks
import { useHistory } from '@/hooks/useHistory'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { usePaintTools } from '@/hooks/usePaintTools'
import { exportMap } from '@/hooks/useExportMap'

// Panels
import { MapsPanel } from '@/components/editor/panels/MapsPanel'
import { LayersPanel } from '@/components/editor/panels/LayersPanel'
import { PropertiesPanel } from '@/components/editor/panels/PropertiesPanel'
import { ActiveSelectionPanel } from '@/components/editor/panels/ActiveSelectionPanel'
import { TilesetsPanel } from '@/components/editor/panels/TilesetsPanel'
import { TilesetPreview } from '@/components/editor/panels/TilesetPreview'

// Canvas
import { Toolbar } from '@/components/editor/canvas/Toolbar'
import { MapCanvas } from '@/components/editor/canvas/MapCanvas'

// Dialogs
import { ImportTilesetDialog } from '@/components/editor/dialogs/ImportTilesetDialog'
import { CreateFolderDialog } from '@/components/editor/dialogs/CreateFolderDialog'
import { RenameDialog } from '@/components/editor/dialogs/RenameDialog'
import { ConfirmDialog } from '@/components/editor/dialogs/ConfirmDialog'
import { CreateLayerDialog } from '@/components/editor/dialogs/CreateLayerDialog'
import { CreateMapFolderDialog } from '@/components/editor/dialogs/CreateMapFolderDialog'
import { CreateMapDialog } from '@/components/editor/dialogs/CreateMapDialog'

// ─── Root Layout ────────────────────────────────────────────────────────────

function RootComponent() {
  const mode = useThemeStore(state => state.mode)
  const accentColor = useThemeStore(state => state.accentColor)

  useEffect(() => {
    if (mode === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [mode])

  useEffect(() => {
    const root = document.documentElement
    if (accentColor === 'red') {
      root.style.setProperty('--primary', '0 84.2% 60.2%')
      root.style.setProperty('--primary-foreground', '0 100% 97%')
    } else if (accentColor === 'green') {
      root.style.setProperty('--primary', '142 71% 45%')
      root.style.setProperty('--primary-foreground', '142 100% 97%')
    } else if (accentColor === 'orange') {
      root.style.setProperty('--primary', '24.6 95% 53.1%')
      root.style.setProperty('--primary-foreground', '24.6 100% 97%')
    } else {
      root.style.setProperty('--primary', '250 65% 60%')
      root.style.setProperty('--primary-foreground', '250 100% 96%')
    }
  }, [accentColor])

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background text-foreground font-sans">
        <AppSidebar />
        <main className="flex-1 flex flex-col relative overflow-hidden">
          <div className="flex-1 overflow-hidden flex flex-col relative">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}

// ─── Index Route ─────────────────────────────────────────────────────────────

const rootRoute = createRootRoute({ component: RootComponent })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: function Index() {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-4 p-12 max-w-[1200px] mx-auto w-full">
        <h1 className="text-4xl font-bold tracking-tight">Welcome to Elementals</h1>
        <p className="text-muted-foreground text-lg max-w-md">
          Navigate to the Map Editor to start building your world.
        </p>
      </div>
    )
  },
})

// ─── Editor Route ─────────────────────────────────────────────────────────────

const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/editor',
  component: function EditorPage() {
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
    const [createLayerDialog, setCreateLayerDialog] = useState(false)
    const [newLayerData, setNewLayerData] = useState<{ name: string; type: LayerType }>({ name: '', type: 'tile' })
    const [createMapDialog, setCreateMapDialog] = useState<{ open: boolean; parentPath?: string | null }>({ open: false })
    const [createMapData, setCreateMapData] = useState({ name: '', width: 50, height: 50 })
    const [createMapFolderDialog, setCreateMapFolderDialog] = useState<{ open: boolean; parentPath?: string | null }>({ open: false })
    const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; description: string; action: () => void }>({ open: false, title: '', description: '', action: () => {} })
    const [createMapFolderName, setCreateMapFolderName] = useState("")


    // ── Panel Refs & Collapse State ──────────────────────────────────────────
    const mapsPanelRef = useRef<any>(null)
    const layersPanelRef = useRef<any>(null)
    const activeSelectionPanelRef = useRef<any>(null)
    const propertiesPanelRef = useRef<any>(null)
    const tilesetsPanelRef = useRef<any>(null)
    const previewPanelRef = useRef<any>(null)
    
    const [mapsCollapsed, setMapsCollapsed] = useState(false)
    const [layersCollapsed, setLayersCollapsed] = useState(false)
    const [activeSelectionCollapsed, setActiveSelectionCollapsed] = useState(false)
    const [propertiesCollapsed, setPropertiesCollapsed] = useState(false)
    const [tilesetsCollapsed, setTilesetsCollapsed] = useState(false)
    const [previewCollapsed, setPreviewCollapsed] = useState(false)

    const togglePanel = (ref: React.RefObject<any>, setter: React.Dispatch<React.SetStateAction<boolean>>, isCollapsed: boolean) => {
      if (!ref.current) return
      if (isCollapsed) {
        ref.current.expand()
        setter(false)
      } else {
        ref.current.collapse()
        setter(true)
      }
    }

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

    const handleConfirmCreateLayer = () => {
      const cleanName = newLayerData.name.trim()
      if (!cleanName) { alert("Layer name cannot be empty"); return }
      const newLayer: Layer = { id: crypto.randomUUID(), name: cleanName, type: newLayerData.type, visible: true, locked: false }
      const newLayers = [newLayer, ...layers]
      updateLayers(newLayers)
      setActiveLayerId(newLayer.id)
      setCreateLayerDialog(false)
      setNewLayerData({ name: '', type: 'tile' })
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

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────
    return (
      <div className="flex flex-1 overflow-hidden h-full w-full">
        <ResizablePanelGroup orientation="horizontal">
          {/* ── Left Sidebar ────────────────────────────────────────────── */}
          <ResizablePanel defaultSize="20%" minSize="15%" maxSize="30%" className="flex flex-col z-10 shadow-xl bg-sidebar-background border-r border-border min-w-0 min-h-0">
            <div className="flex flex-col h-full w-full">

              {/* Maps Panel */}
              <div className={`flex flex-col overflow-hidden transition-all ${mapsCollapsed ? "h-10 shrink-0" : "flex-1 min-h-0"}`}>
                <div onClick={() => setMapsCollapsed(!mapsCollapsed)} className="h-10 border-b border-sidebar-border flex items-center justify-between px-3 shrink-0 bg-sidebar-background cursor-pointer hover:bg-sidebar-accent/50 transition-colors select-none">
                  <div className="flex items-center gap-1 text-sidebar-foreground/70">{mapsCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}<MapIcon className="w-4 h-4 ml-0.5" /><h2 className="text-xs font-semibold font-mono tracking-wider uppercase ml-1">MAPS</h2></div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => { setCreateMapFolderName(`Folder ${mapFolders.length + 1}`); setCreateMapFolderDialog({ open: true, parentPath: null }); }} className="p-1.5 hover:bg-sidebar-accent rounded-md text-sidebar-foreground" title="New Folder">
                      <FolderPlus className="w-4 h-4" />
                    </button>
                    <button onClick={() => { setCreateMapData({ name: '', width: 50, height: 50 }); setCreateMapDialog({ open: true, parentPath: null }); }} className="p-1.5 hover:bg-sidebar-accent rounded-md text-sidebar-foreground" title="New Map">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {!mapsCollapsed && (<div className="flex-1 overflow-y-auto p-2 font-mono text-xs">
                  <MapsPanel
                    maps={maps}
                    mapFolders={mapFolders}
                    activeMap={activeMap}
                    expandedMapFolders={expandedMapFolders}
                    selectedMapFolder={selectedMapFolder}
                    setSelectedMapFolder={setSelectedMapFolder}
                    toggleMapFolder={toggleMapFolder}
                    setCreateMapData={setCreateMapData}
                    setCreateMapDialog={setCreateMapDialog}
                    setCreateMapFolderName={setCreateMapFolderName}
                    setCreateMapFolderDialog={setCreateMapFolderDialog}
                    setRenameInput={setRenameInput}
                    setRenameDialog={setRenameDialog}
                    handleDeleteMapFolder={handleDeleteMapFolder}
                    handleDeleteMap={handleDeleteMap}
                    handleExportMap={handleExportMap}
                    handleMapDrop={handleMapDrop}
                    onSelectMap={onSelectMap}
                  />
                </div>)}
              </div>

              

              {/* Layers Panel */}
              <div className={`flex flex-col overflow-hidden transition-all border-t border-sidebar-border ${layersCollapsed ? "h-10 shrink-0" : "flex-1 min-h-0"}`}>
                <div onClick={() => setLayersCollapsed(!layersCollapsed)} className="h-10 border-b border-sidebar-border flex items-center justify-between px-3 shrink-0 bg-sidebar-background cursor-pointer hover:bg-sidebar-accent/50 transition-colors select-none">
                  <div className="flex items-center gap-1 text-sidebar-foreground/70">{layersCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}<LayersIcon className="w-4 h-4 ml-0.5" /><h2 className="text-xs font-semibold font-mono tracking-wider uppercase ml-1">LAYERS</h2></div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => { if (!activeMap) { alert("Please select a map first"); return; } setCreateLayerDialog(true) }} className="p-1.5 hover:bg-sidebar-accent rounded-md text-sidebar-foreground" title="New Layer">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {!layersCollapsed && (<div className="flex-1 overflow-y-auto p-2 font-mono text-xs">
                  <LayersPanel
                    layers={layers}
                    activeLayerId={activeLayerId}
                    setActiveLayerId={setActiveLayerId}
                    toggleLayerVisibility={toggleLayerVisibility}
                    toggleLayerLock={toggleLayerLock}
                  />
                </div>)}
              </div>

              

              {/* Active Selection Panel */}
              <div className={`flex flex-col bg-card/40 overflow-hidden transition-all border-t border-sidebar-border ${activeSelectionCollapsed ? "h-10 shrink-0" : "flex-1 min-h-0"}`}>
                <div onClick={() => setActiveSelectionCollapsed(!activeSelectionCollapsed)} className="h-10 border-b border-sidebar-border flex items-center justify-between px-3 shrink-0 bg-sidebar-background cursor-pointer hover:bg-sidebar-accent/50 transition-colors select-none">
                  <div className="flex items-center gap-1 text-sidebar-foreground/70">{activeSelectionCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}<MousePointer2 className="w-4 h-4 ml-0.5" /><span className="text-xs font-semibold font-mono tracking-wider uppercase ml-1">ACTIVE SELECTION</span></div>
                </div>
                <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-muted/10">
                  <ActiveSelectionPanel tileSelection={tileSelection} tilesets={tilesets} />
                </div>
              </div>

              

              {/* Properties Panel */}
              <div className={`flex flex-col bg-card/40 overflow-hidden transition-all border-t border-sidebar-border ${propertiesCollapsed ? "h-10 shrink-0" : "flex-1 min-h-0"}`}>
                <div onClick={() => setPropertiesCollapsed(!propertiesCollapsed)} className="h-10 border-b border-sidebar-border flex items-center justify-between px-3 shrink-0 bg-sidebar-background cursor-pointer hover:bg-sidebar-accent/50 transition-colors select-none">
                  <div className="flex items-center gap-1 text-sidebar-foreground/70">{propertiesCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}<Settings2 className="w-4 h-4 ml-0.5" /><span className="text-xs font-semibold font-mono tracking-wider uppercase ml-1">PROPERTIES</span></div>
                </div>
                {!propertiesCollapsed && (<div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-start text-xs text-muted-foreground text-center">
                  <PropertiesPanel layers={layers} activeLayerId={activeLayerId} updateLayers={updateLayers} />
                </div>)}
              </div>

            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="bg-border" />

          {/* ── Center Canvas ────────────────────────────────────────────── */}
          <ResizablePanel defaultSize="55%" minSize="30%" className="flex flex-col min-w-0 min-h-0">
            <div className="flex-1 bg-muted/10 relative overflow-hidden flex flex-col min-w-0 min-h-0">
              <Toolbar
                historyIndex={historyIndex}
                historyLength={history.length}
                activeTool={activeTool}
                paintMode={paintMode}
                handleUndo={boundHandleUndo}
                handleRedo={boundHandleRedo}
                setActiveTool={setActiveTool}
                setPaintMode={setPaintMode}
              />
              <MapCanvas
                activeMap={activeMap}
                layers={layers}
                tilesets={tilesets}
                tileSelection={tileSelection}
                setTileSelection={setTileSelection}
                activeTool={activeTool}
                paintMode={paintMode}
                activeLayerId={activeLayerId}
                isPainting={isPainting}
                setIsPainting={setIsPainting}
                paintStartPos={paintStartPos}
                setPaintStartPos={setPaintStartPos}
                debugInfo={debugInfo}
                handlePaint={handlePaint}
                handlePaintBucket={handlePaintBucket}
                handleRectangleFill={handleRectangleFill}
                handleCommit={handleCommit}
              />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="bg-border" />

          {/* ── Right Sidebar ─────────────────────────────────────────────── */}
          <ResizablePanel defaultSize="25%" minSize="15%" maxSize="40%" className="flex flex-col z-10 shadow-xl bg-sidebar-background border-l border-border min-w-0 min-h-0">
            <div className="flex flex-col h-full w-full">

              {/* Tilesets Panel */}
              <div className={`flex flex-col overflow-hidden transition-all ${tilesetsCollapsed ? "h-10 shrink-0" : "flex-1 min-h-0"}`}>
                <div onClick={() => setTilesetsCollapsed(!tilesetsCollapsed)} className="h-10 border-b border-sidebar-border flex items-center justify-between px-3 shrink-0 bg-sidebar-background cursor-pointer hover:bg-sidebar-accent/50 transition-colors select-none">
                  <div className="flex items-center gap-1 text-sidebar-foreground/70">{tilesetsCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}<LayoutGridIcon className="w-4 h-4 ml-0.5" /><h2 className="text-xs font-semibold font-mono tracking-wider uppercase ml-1">TILESETS</h2></div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => handleOpenCreateFolderDialog(null)} className="p-1.5 hover:bg-sidebar-accent rounded-md text-sidebar-foreground" title="New Folder">
                      <FolderPlus className="w-4 h-4" />
                    </button>
                    <button onClick={() => handlePickFile(null)} className="flex items-center gap-1 text-xs font-medium font-mono bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity shadow-sm">
                      <Plus className="w-3.5 h-3.5" /> Add
                    </button>
                  </div>
                </div>
                {!tilesetsCollapsed && (<div
                  className="flex-1 overflow-y-auto p-2 font-mono text-xs"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, null)}
                >
                  <TilesetsPanel
                    tilesets={tilesets}
                    folders={folders}
                    activeTileset={activeTileset}
                    setActiveTileset={setActiveTileset}
                    expandedFolders={expandedFolders}
                    selectedFolder={selectedFolder}
                    setSelectedFolder={setSelectedFolder}
                    toggleFolder={toggleFolder}
                    handlePickFile={handlePickFile}
                    handleOpenCreateFolderDialog={handleOpenCreateFolderDialog}
                    setRenameInput={setRenameInput}
                    setRenameDialog={setRenameDialog}
                    handleDeleteFolder={handleDeleteFolder}
                    handleDrop={handleDrop}
                  />
                </div>)}
              </div>

              

              {/* Tileset Preview Panel */}
              <div className={`flex flex-col bg-card/40 overflow-hidden transition-all border-t border-sidebar-border ${previewCollapsed ? "h-10 shrink-0" : "flex-1 min-h-0"}`}>
                <div onClick={() => setPreviewCollapsed(!previewCollapsed)} className="h-10 border-b border-sidebar-border flex items-center justify-between px-3 shrink-0 bg-sidebar-background cursor-pointer hover:bg-sidebar-accent/50 transition-colors select-none">
                  <div className="flex items-center gap-1 text-sidebar-foreground/70">{previewCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}<span className="text-xs font-semibold font-mono tracking-wider uppercase ml-1">PREVIEW</span></div>
                </div>
                <div className="flex-1 overflow-auto p-4 relative bg-muted/10">
                  <TilesetPreview
                    activeTileset={activeTileset}
                    tilesetDimensions={tilesetDimensions}
                    setTilesetDimensions={setTilesetDimensions}
                    tileSelection={tileSelection}
                    setTileSelection={setTileSelection}
                    tilesetSelectionStart={tilesetSelectionStart}
                    setTilesetSelectionStart={setTilesetSelectionStart}
                    tilesetSelectionCurrent={tilesetSelectionCurrent}
                    setTilesetSelectionCurrent={setTilesetSelectionCurrent}
                    hoverTile={hoverTile}
                    setHoverTile={setHoverTile}
                  />
                </div>
              </div>

            </div>
          </ResizablePanel>
        </ResizablePanelGroup>

        {/* ── Dialogs ──────────────────────────────────────────────────────── */}
        <ImportTilesetDialog
          open={importDialog.open}
          nameInput={nameInput}
          setNameInput={setNameInput}
          onClose={() => setImportDialog({ open: false })}
          onConfirm={handleConfirmImport}
        />
        <CreateFolderDialog
          open={createFolderDialog.open}
          folderName={createFolderName}
          setFolderName={setCreateFolderName}
          onClose={() => setCreateFolderDialog({ open: false })}
          onConfirm={handleConfirmCreateFolder}
        />
        <RenameDialog
          open={renameDialog.open}
          type={renameDialog.type}
          renameInput={renameInput}
          setRenameInput={setRenameInput}
          onClose={() => setRenameDialog({ open: false, type: 'folder' })}
          onConfirm={handleConfirmRename}
        />
        <CreateLayerDialog
          open={createLayerDialog}
          name={newLayerData.name}
          type={newLayerData.type}
          setName={(v) => setNewLayerData(d => ({ ...d, name: v }))}
          setType={(v) => setNewLayerData(d => ({ ...d, type: v }))}
          onClose={setCreateLayerDialog}
          onConfirm={handleConfirmCreateLayer}
        />
        <CreateMapFolderDialog
          open={createMapFolderDialog.open}
          folderName={createMapFolderName}
          setFolderName={setCreateMapFolderName}
          onClose={() => setCreateMapFolderDialog({ open: false })}
          onConfirm={handleConfirmCreateMapFolder}
        />
        <CreateMapDialog
          open={createMapDialog.open}
          name={createMapData.name}
          width={createMapData.width}
          height={createMapData.height}
          setName={(v) => setCreateMapData(d => ({ ...d, name: v }))}
          setWidth={(v) => setCreateMapData(d => ({ ...d, width: v }))}
          setHeight={(v) => setCreateMapData(d => ({ ...d, height: v }))}
          onClose={() => setCreateMapDialog({ open: false })}
          onConfirm={handleConfirmCreateMap}
        />
        <ConfirmDialog 
          open={confirmDialog.open} 
          title={confirmDialog.title} 
          description={confirmDialog.description} 
          onClose={() => setConfirmDialog(prev => ({ ...prev, open: false }))} 
          onConfirm={confirmDialog.action} 
        />
      </div>
    )
  }
})

// ─── Settings Route ───────────────────────────────────────────────────────────

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: function SettingsPage() {
    const { mode, setMode, accentColor, setAccentColor } = useThemeStore()

    return (
      <div className="max-w-2xl space-y-8 mx-auto w-full pt-14 p-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your app preferences.</p>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 rounded-lg border bg-card/40">
            <div className="space-y-0.5">
              <label className="text-base font-medium">Dark Mode</label>
              <p className="text-sm text-muted-foreground">Toggle between light and dark theme.</p>
            </div>
            <Switch
              checked={mode === 'dark'}
              onCheckedChange={(checked) => setMode(checked ? 'dark' : 'light')}
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border bg-card/40">
            <div className="space-y-0.5">
              <label className="text-base font-medium">Accent Color</label>
              <p className="text-sm text-muted-foreground">Choose a primary accent color for the UI.</p>
            </div>
            <Select value={accentColor} onValueChange={setAccentColor}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select accent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blue">Purple (Default)</SelectItem>
                <SelectItem value="red">Red</SelectItem>
                <SelectItem value="green">Green</SelectItem>
                <SelectItem value="orange">Orange</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    )
  }
})

// ─── Router ───────────────────────────────────────────────────────────────────

const routeTree = rootRoute.addChildren([indexRoute, editorRoute, settingsRoute])
const hashHistory = createHashHistory()

export const router = createRouter({
  routeTree,
  history: hashHistory,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
