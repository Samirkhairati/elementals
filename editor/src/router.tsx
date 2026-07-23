import { createRouter, createRoute, createRootRoute, createHashHistory, Outlet } from '@tanstack/react-router'
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { useThemeStore } from '@/store/themeStore'
import { useEffect, useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, FolderPlus, Folder as FolderIcon, ChevronRight, ChevronDown, Edit2, FileImage, Trash2, Layers, Eye, EyeOff, Lock, Unlock, Box, ImageIcon, CheckSquare, Hexagon, Settings2 } from "lucide-react"

export type LayerType = 'tile' | 'collision' | 'terrain' | 'objects'
export interface Layer {
  id: string
  name: string
  type: LayerType
  visible: boolean
  locked: boolean
  data?: Record<number, { tilesetId: string, x: number, y: number }>
}
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

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
        // default vibrant purple
        root.style.setProperty('--primary', '250 65% 60%')
        root.style.setProperty('--primary-foreground', '250 100% 96%')
      }
    }, [accentColor])

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background text-foreground font-sans">
        <AppSidebar />
        <main className="flex-1 flex flex-col relative overflow-hidden">
          {/* We remove the fixed header space here so the Editor can be truly full screen */}
          {/* The trigger has been moved to the sidebar itself */}
          
          <div className="flex-1 overflow-hidden flex flex-col relative">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}

const rootRoute = createRootRoute({
  component: RootComponent,
})

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

const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/editor',
  component: function EditorPage() {
    const [tilesets, setTilesets] = useState<any[]>([])
    const [folders, setFolders] = useState<string[]>([])
    const [activeTileset, setActiveTileset] = useState<any | null>(null)
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
    
    const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
    
    const [createFolderDialog, setCreateFolderDialog] = useState<{ open: boolean; parentPath?: string | null }>({ open: false })
    const [createFolderName, setCreateFolderName] = useState("")

    const [importDialog, setImportDialog] = useState<{ open: boolean; sourcePath?: string; defaultName?: string; targetFolder?: string | null }>({ open: false })
    const [nameInput, setNameInput] = useState("")

    const [renameDialog, setRenameDialog] = useState<{ open: boolean; type: 'folder' | 'tileset' | 'map-folder' | 'map'; oldPath?: string; oldName?: string; targetFolder?: string | null }>({ open: false, type: 'folder' })
    const [renameInput, setRenameInput] = useState("")

    const [layers, setLayers] = useState<Layer[]>([])
    const [activeLayerId, setActiveLayerId] = useState<string | null>(null)
    const [createLayerDialog, setCreateLayerDialog] = useState(false)
    const [newLayerData, setNewLayerData] = useState<{ name: string; type: LayerType }>({ name: '', type: 'tile' })

    const [maps, setMaps] = useState<any[]>([])
    const [mapFolders, setMapFolders] = useState<string[]>([])
    const [activeMap, setActiveMap] = useState<any | null>(null)
    const [expandedMapFolders, setExpandedMapFolders] = useState<Set<string>>(new Set())
    const [selectedMapFolder, setSelectedMapFolder] = useState<string | null>(null)
    const [createMapDialog, setCreateMapDialog] = useState<{ open: boolean; parentPath?: string | null }>({ open: false })
    const [createMapData, setCreateMapData] = useState({ name: '', width: 50, height: 50 })
    const [createMapFolderDialog, setCreateMapFolderDialog] = useState<{ open: boolean; parentPath?: string | null }>({ open: false })
    const [createMapFolderName, setCreateMapFolderName] = useState("")
    
    // Tools
    const [activeTool, setActiveTool] = useState<'brush' | 'eraser'>('brush')
    const [selectedTile, setSelectedTile] = useState<{ tilesetId: string, x: number, y: number } | null>(null)
    const [hoverTile, setHoverTile] = useState<{ x: number, y: number } | null>(null)
    const [tilesetDimensions, setTilesetDimensions] = useState<{width: number, height: number} | null>(null)
    const [isPainting, setIsPainting] = useState(false)
    
    // Canvas View Controls
    const [zoom, setZoom] = useState(1)
    const [pan, setPan] = useState({ x: 0, y: 0 })
    const [isPanning, setIsPanning] = useState(false)
    const [lastPanPos, setLastPanPos] = useState({ x: 0, y: 0 })

    const [debugInfo, setDebugInfo] = useState<{
      action: string,
      x?: number,
      y?: number,
      error?: string,
      time: number
    } | null>(null)

    const handlePaint = (gridX: number, gridY: number) => {
      const time = Date.now()
      if (!activeMap) { setDebugInfo({ action: 'paint', error: 'No active map', time }); return }
      if (!activeLayerId) { setDebugInfo({ action: 'paint', error: 'No active layer', time }); return }
      if (activeTool === 'brush' && !selectedTile) { setDebugInfo({ action: 'paint', error: 'No tile selected', time }); return }
      if (gridX < 0 || gridX >= activeMap.width || gridY < 0 || gridY >= activeMap.height) {
        setDebugInfo({ action: 'paint', error: 'Out of bounds', x: gridX, y: gridY, time })
        return
      }

      setLayers(prevLayers => {
        const layerIndex = prevLayers.findIndex(l => l.id === activeLayerId)
        if (layerIndex === -1) { setDebugInfo({ action: 'paint', error: 'Layer not found', time }); return prevLayers }
        const layer = prevLayers[layerIndex]
        if (layer.locked || !layer.visible) { setDebugInfo({ action: 'paint', error: 'Layer locked/hidden', time }); return prevLayers }

        const tileIndex = gridY * activeMap.width + gridX
        const currentData = layer.data || {}
        
        let newData = { ...currentData }
        if (activeTool === 'brush' && selectedTile) {
          const existing = newData[tileIndex]
          if (existing && existing.tilesetId === selectedTile.tilesetId && existing.x === selectedTile.x && existing.y === selectedTile.y) {
            setDebugInfo({ action: 'paint', error: 'Tile unchanged', x: gridX, y: gridY, time })
            return prevLayers // no change
          }
          newData[tileIndex] = {
            tilesetId: selectedTile.tilesetId,
            x: selectedTile.x,
            y: selectedTile.y
          }
        } else if (activeTool === 'eraser') {
          if (!newData[tileIndex]) {
            setDebugInfo({ action: 'erase', error: 'Already empty', x: gridX, y: gridY, time })
            return prevLayers // no change
          }
          delete newData[tileIndex]
        }

        const newLayers = [...prevLayers]
        newLayers[layerIndex] = { ...layer, data: newData }
        
        setDebugInfo({ action: activeTool, error: 'Success', x: gridX, y: gridY, time })
        
        // Also persist to backend
        if (activeMap) {
          const updatedMap = { ...activeMap, layers: newLayers }
          setActiveMap(updatedMap)
          window.electronAPI?.saveMap(activeMap.folderPath, activeMap.fileName, updatedMap)
        }
        
        return newLayers
      })
    }

    const updateLayers = (newLayers: Layer[]) => {
      setLayers(newLayers)
      if (activeMap) {
        const updatedMap = { ...activeMap, layers: newLayers }
        setActiveMap(updatedMap)
        window.electronAPI?.saveMap(activeMap.folderPath, activeMap.fileName, updatedMap)
      }
    }

    const handleConfirmCreateLayer = () => {
      const cleanName = newLayerData.name.trim()
      if (!cleanName) {
        alert("Layer name cannot be empty")
        return
      }
      const newLayer: Layer = {
        id: crypto.randomUUID(),
        name: cleanName,
        type: newLayerData.type,
        visible: true,
        locked: false
      }
      const newLayers = [newLayer, ...layers]
      updateLayers(newLayers)
      setActiveLayerId(newLayer.id)
      setCreateLayerDialog(false)
      setNewLayerData({ name: '', type: 'tile' })
    }

    const toggleLayerVisibility = (id: string) => {
      updateLayers(layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l))
    }

    const toggleLayerLock = (id: string) => {
      updateLayers(layers.map(l => l.id === id ? { ...l, locked: !l.locked } : l))
    }

    const getLayerIcon = (type: LayerType) => {
      switch (type) {
        case 'tile': return <ImageIcon className="w-4 h-4 text-blue-400" />
        case 'collision': return <Hexagon className="w-4 h-4 text-red-400" />
        case 'terrain': return <CheckSquare className="w-4 h-4 text-green-400" />
        case 'objects': return <Box className="w-4 h-4 text-orange-400" />
      }
    }

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

    useEffect(() => {
      loadData()
    }, [])

    const handleDeleteFolder = async (folderPath: string) => {
      if (!window.electronAPI) return
      const res = await window.electronAPI.deleteFolder(folderPath)
      if (res.success) {
        if (selectedFolder === folderPath) setSelectedFolder(null)
        loadData()
      } else {
        alert(res.error)
      }
    }

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

    const toggleFolder = (folder: string) => {
      setExpandedFolders(prev => {
        const next = new Set(prev)
        if (next.has(folder)) next.delete(folder)
        else next.add(folder)
        return next
      })
    }

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
      if (!cleanName) {
        alert("Tileset name cannot be empty")
        return
      }
      if (!window.electronAPI || !importDialog.sourcePath) return
      const res = await window.electronAPI.importTileset(importDialog.sourcePath, cleanName, importDialog.targetFolder || null)
      if (res.success) {
        if (importDialog.targetFolder) {
          setExpandedFolders(prev => new Set(prev).add(importDialog.targetFolder!))
        }
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
      if (!cleanName) {
        alert("Folder name cannot be empty")
        return
      }
      
      const targetPath = createFolderDialog.parentPath ? `${createFolderDialog.parentPath}/${cleanName}` : cleanName
      if (folders.includes(targetPath)) {
        alert(`A folder named "${cleanName}" already exists in this location.`)
        return
      }

      if (!window.electronAPI) return
      const res = await window.electronAPI.createFolder(createFolderDialog.parentPath || null, cleanName)
      if (res.success) {
        if (createFolderDialog.parentPath) {
          setExpandedFolders(prev => new Set(prev).add(createFolderDialog.parentPath!))
        }
        setCreateFolderDialog({ open: false })
        loadData()
      } else {
        alert(res.error)
      }
    }

    const handleConfirmRename = async () => {
      const cleanName = renameInput.trim()
      if (!cleanName) {
        alert("Name cannot be empty")
        return
      }

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

      if (res?.success) {
        setRenameDialog({ open: false, type: 'folder' })
        loadData()
      } else {
        alert(res?.error)
      }
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

    const handleDeleteMapFolder = async (folderPath: string) => {
      if (!window.electronAPI) return
      const res = await window.electronAPI.deleteMapFolder(folderPath)
      if (res.success) {
        if (selectedMapFolder === folderPath) setSelectedMapFolder(null)
        loadData()
      } else {
        alert(res.error)
      }
    }

    const handleDeleteMap = async (folderPath: string | null, fileName: string) => {
      if (!window.electronAPI) return
      const res = await window.electronAPI.deleteMap(folderPath, fileName)
      if (res.success) {
        if (activeMap?.fileName === fileName && activeMap?.folderPath === folderPath) {
          setActiveMap(null)
          setLayers([])
          setActiveLayerId(null)
        }
        loadData()
      } else {
        alert(res.error)
      }
    }

    const handleConfirmCreateMapFolder = async () => {
      const cleanName = createMapFolderName.trim()
      if (!cleanName) {
        alert("Folder name cannot be empty")
        return
      }
      
      const targetPath = createMapFolderDialog.parentPath ? `${createMapFolderDialog.parentPath}/${cleanName}` : cleanName
      if (mapFolders.includes(targetPath)) {
        alert(`A folder named "${cleanName}" already exists in this location.`)
        return
      }

      if (!window.electronAPI) return
      const res = await window.electronAPI.createMapFolder(createMapFolderDialog.parentPath || null, cleanName)
      if (res.success) {
        if (createMapFolderDialog.parentPath) {
          setExpandedMapFolders(prev => new Set(prev).add(createMapFolderDialog.parentPath!))
        }
        setCreateMapFolderDialog({ open: false })
        loadData()
      } else {
        alert(res.error)
      }
    }

    const handleConfirmCreateMap = async () => {
      const cleanName = createMapData.name.trim()
      if (!cleanName || createMapData.width <= 0 || createMapData.height <= 0) {
        alert("Invalid map data")
        return
      }

      if (!window.electronAPI) return
      const res = await window.electronAPI.createMap(cleanName, createMapData.width, createMapData.height, createMapDialog.parentPath || null)
      if (res.success) {
        if (createMapDialog.parentPath) {
          setExpandedMapFolders(prev => new Set(prev).add(createMapDialog.parentPath!))
        }
        setCreateMapDialog({ open: false })
        loadData()
        setActiveMap(res.map)
        setLayers(res.map.layers || [])
        setActiveLayerId(res.map.layers?.[0]?.id || null)
      } else {
        alert(res.error)
      }
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

    const renderMapTree = (currentPath: string | null, level: number = 0) => {
      const childrenFolders = mapFolders.filter(f => {
        if (currentPath === null) return !f.includes('/')
        return f.startsWith(currentPath + '/') && f.substring(currentPath.length + 1).indexOf('/') === -1
      })
      
      const childrenMaps = maps.filter(m => m.folderPath === currentPath)

      return (
        <div className="space-y-1" style={{ paddingLeft: level === 0 ? 0 : 16 }}>
          {childrenFolders.map(folder => {
            const folderName = folder.split('/').pop() || folder
            const isExpanded = expandedMapFolders.has(folder)
            const hasSubfolders = mapFolders.some(sub => sub.startsWith(folder + '/'))
            const hasMaps = maps.some(m => m.folderPath === folder || (m.folderPath && m.folderPath.startsWith(folder + '/')))
            const isEmpty = !hasSubfolders && !hasMaps
            const isSelected = selectedMapFolder === folder

            return (
              <div key={folder}>
                <div 
                  className={`flex items-center group py-1 px-2 rounded-md cursor-pointer text-sm transition-colors ${isSelected ? 'bg-sidebar-accent font-medium text-sidebar-foreground ring-1 ring-sidebar-ring' : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleMapDrop(e, folder)}
                  onClick={() => { setSelectedMapFolder(folder); toggleMapFolder(folder); }}
                >
                  <div className="flex-1 flex items-center">
                    {isExpanded ? <ChevronDown className="w-4 h-4 mr-1 opacity-70" /> : <ChevronRight className="w-4 h-4 mr-1 opacity-70" />}
                    <FolderIcon className="w-4 h-4 mr-2 text-blue-500" />
                    <span>{folderName}</span>
                  </div>
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); setCreateMapData({ name: '', width: 50, height: 50 }); setCreateMapDialog({ open: true, parentPath: folder }); }} className="p-1 hover:bg-black/10 rounded" title="New Map"><Plus className="w-3 h-3" /></button>
                    <button onClick={(e) => { e.stopPropagation(); setCreateMapFolderName(`Folder ${mapFolders.length + 1}`); setCreateMapFolderDialog({ open: true, parentPath: folder }); }} className="p-1 hover:bg-black/10 rounded" title="New Subfolder"><FolderPlus className="w-3 h-3" /></button>
                    <button onClick={(e) => { e.stopPropagation(); setRenameInput(folderName); setRenameDialog({ open: true, type: 'map-folder', oldPath: folder }); }} className="p-1 hover:bg-black/10 rounded" title="Rename"><Edit2 className="w-3 h-3" /></button>
                    {isEmpty && (
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteMapFolder(folder); }} className="p-1 hover:bg-red-500/20 hover:text-red-400 rounded text-red-400" title="Delete Empty Folder">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                {isExpanded && renderMapTree(folder, level + 1)}
              </div>
            )
          })}
          
          {childrenMaps.map(m => (
            <div 
              key={m.fileName}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('mapFileName', m.fileName)
                e.dataTransfer.setData('mapSourceFolder', String(m.folderPath))
              }}
              onClick={() => { setActiveMap(m); setLayers(m.layers || []); setActiveLayerId(m.layers?.[0]?.id || null); }}
              className={`flex items-center group py-1.5 px-2.5 rounded-md cursor-pointer text-sm ml-5 transition-colors ${activeMap?.fileName === m.fileName ? 'bg-primary/30 text-primary-foreground font-medium border border-primary/40' : 'hover:bg-sidebar-accent text-sidebar-foreground'}`}
            >
              <FileImage className="w-4 h-4 mr-2 opacity-80" />
              <span className="flex-1 truncate">{m.name}</span>
              <div className="hidden group-hover:flex items-center gap-1">
                <button 
                  onClick={(e) => { e.stopPropagation(); setRenameInput(m.name); setRenameDialog({ open: true, type: 'map', oldName: m.name, oldPath: m.fileName, targetFolder: m.folderPath }) }} 
                  className="p-1 hover:bg-black/10 rounded"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDeleteMap(m.folderPath, m.fileName) }} 
                  className="p-1 hover:bg-red-500/20 hover:text-red-400 rounded text-red-400"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )
    }

    const renderTree = (currentPath: string | null, level: number = 0) => {
      const childrenFolders = folders.filter(f => {
        if (currentPath === null) return !f.includes('/')
        return f.startsWith(currentPath + '/') && f.substring(currentPath.length + 1).indexOf('/') === -1
      })
      
      const childrenTilesets = tilesets.filter(t => t.folderPath === currentPath)

      return (
        <div className="space-y-1" style={{ paddingLeft: level === 0 ? 0 : 16 }}>
          {childrenFolders.map(folder => {
            const folderName = folder.split('/').pop() || folder
            const isExpanded = expandedFolders.has(folder)
            const hasSubfolders = folders.some(sub => sub.startsWith(folder + '/'))
            const hasTilesets = tilesets.some(t => t.folderPath === folder || (t.folderPath && t.folderPath.startsWith(folder + '/')))
            const isEmpty = !hasSubfolders && !hasTilesets
            const isSelected = selectedFolder === folder

            return (
              <div key={folder}>
                <div 
                  className={`flex items-center group py-1 px-2 rounded-md cursor-pointer text-sm transition-colors ${isSelected ? 'bg-sidebar-accent font-medium text-sidebar-foreground ring-1 ring-sidebar-ring' : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, folder)}
                  onClick={() => { setSelectedFolder(folder); toggleFolder(folder); }}
                >
                  <div className="flex-1 flex items-center">
                    {isExpanded ? <ChevronDown className="w-4 h-4 mr-1 opacity-70" /> : <ChevronRight className="w-4 h-4 mr-1 opacity-70" />}
                    <FolderIcon className="w-4 h-4 mr-2 text-blue-500" />
                    <span>{folderName}</span>
                  </div>
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); handlePickFile(folder); }} className="p-1 hover:bg-black/10 rounded" title="Add Tileset"><Plus className="w-3 h-3" /></button>
                    <button onClick={(e) => { e.stopPropagation(); handleOpenCreateFolderDialog(folder); }} className="p-1 hover:bg-black/10 rounded" title="New Subfolder"><FolderPlus className="w-3 h-3" /></button>
                    <button onClick={(e) => { e.stopPropagation(); setRenameInput(folderName); setRenameDialog({ open: true, type: 'folder', oldPath: folder }); }} className="p-1 hover:bg-black/10 rounded" title="Rename"><Edit2 className="w-3 h-3" /></button>
                    {isEmpty && (
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder); }} className="p-1 hover:bg-red-500/20 hover:text-red-400 rounded text-red-400" title="Delete Empty Folder (Delete key)">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                {isExpanded && renderTree(folder, level + 1)}
              </div>
            )
          })}
          
          {childrenTilesets.map(t => (
            <div 
              key={t.fileName}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('fileName', t.fileName)
                e.dataTransfer.setData('sourceFolder', String(t.folderPath))
              }}
              onClick={() => setActiveTileset(t)}
              className={`flex items-center group py-1.5 px-2.5 rounded-md cursor-pointer text-sm ml-5 transition-colors ${activeTileset?.fileName === t.fileName ? 'bg-primary/30 text-primary-foreground font-medium border border-primary/40' : 'hover:bg-sidebar-accent text-sidebar-foreground'}`}
            >
              <FileImage className="w-4 h-4 mr-2 opacity-80" />
              <span className="flex-1 truncate">{t.name}</span>
              <button 
                onClick={(e) => { e.stopPropagation(); setRenameInput(t.name); setRenameDialog({ open: true, type: 'tileset', oldName: t.name, oldPath: t.fileName, targetFolder: t.folderPath }) }} 
                className="hidden group-hover:block p-1 hover:bg-black/10 rounded"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )
    }

    return (
      <div className="flex flex-1 overflow-hidden h-full w-full">
       <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize="20%" minSize="15%" maxSize="30%" className="flex flex-col z-10 shadow-xl bg-sidebar-background border-r border-border min-w-0 min-h-0">
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize="40%" minSize="20%" className="flex flex-col min-h-0 min-w-0">
              <div className="h-14 border-b border-sidebar-border flex items-center justify-between px-4 shrink-0 bg-sidebar-background">
                <h2 className="text-xs font-semibold font-mono text-sidebar-foreground/70 tracking-wider uppercase">MAPS</h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setCreateMapFolderName(`Folder ${mapFolders.length + 1}`); setCreateMapFolderDialog({ open: true, parentPath: null }); }} className="p-1.5 hover:bg-sidebar-accent rounded-md text-sidebar-foreground" title="New Folder">
                    <FolderPlus className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setCreateMapData({ name: '', width: 50, height: 50 }); setCreateMapDialog({ open: true, parentPath: null }); }} className="p-1.5 hover:bg-sidebar-accent rounded-md text-sidebar-foreground" title="New Map">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 font-mono text-xs">
                {renderMapTree(null)}
              </div>
            </ResizablePanel>
            
            <ResizableHandle withHandle className="bg-sidebar-border" />
            
            <ResizablePanel defaultSize="30%" minSize="20%" className="flex flex-col min-h-0 min-w-0">
              <div className="h-14 border-b border-sidebar-border flex items-center justify-between px-4 shrink-0 bg-sidebar-background">
                <h2 className="text-xs font-semibold font-mono text-sidebar-foreground/70 tracking-wider uppercase">LAYERS</h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => { if (!activeMap) { alert("Please select a map first"); return; } setCreateLayerDialog(true) }} className="p-1.5 hover:bg-sidebar-accent rounded-md text-sidebar-foreground" title="New Layer">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 font-mono text-xs">
                {layers.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground p-8 text-center">
                    <p className="text-xs">No layers yet.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {layers.map(layer => (
                      <div 
                        key={layer.id} 
                        onClick={() => setActiveLayerId(layer.id)}
                        className={`flex items-center group py-1.5 px-2 rounded-md cursor-pointer transition-colors ${activeLayerId === layer.id ? 'bg-primary/30 text-primary-foreground font-medium border border-primary/40' : 'hover:bg-sidebar-accent text-sidebar-foreground'}`}
                      >
                        <div className="mr-2 opacity-80">{getLayerIcon(layer.type)}</div>
                        <span className="flex-1 truncate">{layer.name}</span>
                        <div className="hidden group-hover:flex items-center gap-1 opacity-70">
                          <button onClick={(e) => { e.stopPropagation(); toggleLayerLock(layer.id) }} className="p-1 hover:bg-black/10 rounded">
                            {layer.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id) }} className="p-1 hover:bg-black/10 rounded">
                            {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle className="bg-sidebar-border" />
            <ResizablePanel defaultSize="30%" minSize="20%" className="flex flex-col bg-card/40 min-h-0 min-w-0">
              <div className="h-10 border-b border-sidebar-border flex items-center px-4 shrink-0 bg-sidebar-background">
                <span className="text-xs font-semibold font-mono text-sidebar-foreground/70 tracking-wider uppercase">PROPERTIES</span>
              </div>
              <div className="flex-1 overflow-auto p-4 flex items-center justify-center text-xs text-muted-foreground text-center">
                {activeLayerId ? "Select a property to edit" : "Select a layer to view properties"}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-border" />

        <ResizablePanel defaultSize="55%" minSize="30%" className="flex flex-col min-w-0 min-h-0">
         <div className="flex-1 bg-muted/10 relative overflow-hidden flex flex-col min-w-0 min-h-0">
           {/* Top Menu Bar */}
           <div className="h-14 border-b border-border bg-background flex items-center px-4 shrink-0 shadow-sm z-10 justify-center gap-4">
             <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-md border">
               <button 
                 onClick={() => setActiveTool('brush')}
                 className={`p-2 rounded-md flex items-center gap-2 text-xs font-semibold font-mono tracking-wider transition-colors ${activeTool === 'brush' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted text-muted-foreground'}`}
                 title="Brush Tool (B)"
               >
                 Brush
               </button>
               <button 
                 onClick={() => setActiveTool('eraser')}
                 className={`p-2 rounded-md flex items-center gap-2 text-xs font-semibold font-mono tracking-wider transition-colors ${activeTool === 'eraser' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted text-muted-foreground'}`}
                 title="Eraser Tool (E)"
               >
                 Eraser
               </button>
             </div>
           </div>

           {/* Canvas Area */}
           <div 
             className="flex-1 overflow-hidden flex items-center justify-center min-w-0 min-h-0 bg-[#1a1a1a]"
             onWheel={(e) => {
               if (e.ctrlKey || e.metaKey) {
                 e.preventDefault()
                 const zoomSensitivity = 0.005
                 setZoom(prev => Math.min(Math.max(0.1, prev - e.deltaY * zoomSensitivity), 5))
               } else {
                 setPan(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }))
               }
             }}
             onMouseDown={(e) => {
               if (e.button === 1 || e.button === 2) {
                 setIsPanning(true)
                 setLastPanPos({ x: e.clientX, y: e.clientY })
               }
             }}
             onMouseMove={(e) => {
               if (isPanning) {
                 setPan(prev => ({
                   x: prev.x + (e.clientX - lastPanPos.x),
                   y: prev.y + (e.clientY - lastPanPos.y)
                 }))
                 setLastPanPos({ x: e.clientX, y: e.clientY })
               }
             }}
             onMouseUp={(e) => {
               if (e.button === 1 || e.button === 2) setIsPanning(false)
             }}
             onMouseLeave={() => setIsPanning(false)}
             onContextMenu={(e) => e.preventDefault()}
           >
             {activeMap ? (
               <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center' }}>
                 <div 
                   className="bg-card shadow-sm relative overflow-hidden" 
                   style={{ 
                     width: activeMap.width * 32, 
                     height: activeMap.height * 32,
                     backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.2) 1px, transparent 1px)',
                     backgroundSize: '32px 32px'
                   }}
                   onMouseDown={(e) => {
                     if (e.button === 1 || e.button === 2) return;
                     setIsPainting(true)
                     const x = Math.floor(e.nativeEvent.offsetX / 32)
                     const y = Math.floor(e.nativeEvent.offsetY / 32)
                     handlePaint(x, y)
                   }}
                   onMouseUp={() => setIsPainting(false)}
                   onMouseLeave={() => setIsPainting(false)}
                   onMouseMove={(e) => {
                     if (!isPainting || isPanning) return
                     const x = Math.floor(e.nativeEvent.offsetX / 32)
                     const y = Math.floor(e.nativeEvent.offsetY / 32)
                     handlePaint(x, y)
                   }}
                 >
                   <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/10 font-mono text-2xl tracking-wider select-none pointer-events-none z-0">
                      {activeMap.name}
                   </div>
                   {layers.slice().reverse().filter(l => l.visible).map(layer => (
                     <div key={layer.id} className="absolute inset-0 pointer-events-none z-10">
                       {Object.entries(layer.data || {}).map(([indexStr, tile]) => {
                         const index = parseInt(indexStr)
                         const x = index % activeMap.width
                         const y = Math.floor(index / activeMap.width)
                         const tileset = tilesets.find(t => t.fileName === tile.tilesetId)
                         if (!tileset) return null
                         
                         return (
                           <div 
                             key={index}
                             className="absolute"
                             style={{
                               left: x * 32,
                               top: y * 32,
                               width: 32,
                               height: 32,
                               backgroundImage: `url(${tileset.dataUrl})`,
                               backgroundPosition: `-${tile.x * 32}px -${tile.y * 32}px`,
                               imageRendering: 'pixelated'
                             }}
                           />
                         )
                       })}
                     </div>
                   ))}
                 </div>
               </div>
             ) : (
               <div className="text-muted-foreground font-mono text-xs tracking-wider opacity-50">
                  Select or create a map to start editing
               </div>
             )}
             
             {/* Debug Panel */}
             <div className="absolute bottom-4 right-4 bg-black/80 text-green-400 p-4 rounded text-xs font-mono z-50 pointer-events-none flex flex-col gap-1 shadow-lg ring-1 ring-white/20 min-w-[250px]">
               <div className="font-bold text-white mb-1 uppercase tracking-wider border-b border-white/20 pb-1">Debug Status</div>
               <div>Tool: {activeTool}</div>
               <div>Selected Tile: {selectedTile ? `[${selectedTile.x}, ${selectedTile.y}] from ${selectedTile.tilesetId}` : 'NONE'}</div>
               <div>Active Layer ID: {activeLayerId || 'NONE'}</div>
               <div>Active Map: {activeMap ? `${activeMap.name} (${activeMap.width}x${activeMap.height})` : 'NONE'}</div>
               <div>isPainting: {isPainting ? 'TRUE' : 'FALSE'}</div>
               <div className="mt-2 text-yellow-400">Last Paint Result:</div>
               <div className="whitespace-pre-wrap">{debugInfo ? `${debugInfo.action.toUpperCase()} at [${debugInfo.x ?? '-'}, ${debugInfo.y ?? '-'}]\nReason: ${debugInfo.error}` : 'Waiting for input...'}</div>
             </div>
           </div>
         </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-border" />

        <ResizablePanel defaultSize="25%" minSize="15%" maxSize="40%" className="flex flex-col z-10 shadow-xl bg-sidebar-background border-l border-border min-w-0 min-h-0">
           <ResizablePanelGroup orientation="vertical">
             <ResizablePanel defaultSize="50%" minSize="20%" className="flex flex-col min-h-0 min-w-0">
               <div className="h-14 border-b border-sidebar-border flex items-center justify-between px-4 shrink-0 bg-sidebar-background">
                 <h2 className="text-xs font-semibold font-mono text-sidebar-foreground/70 tracking-wider uppercase">TILESETS</h2>
                 <div className="flex items-center gap-2">
                   <button onClick={() => handleOpenCreateFolderDialog(null)} className="p-1.5 hover:bg-sidebar-accent rounded-md text-sidebar-foreground" title="New Folder">
                     <FolderPlus className="w-4 h-4" />
                   </button>
                   <button onClick={() => handlePickFile(null)} className="flex items-center gap-1 text-xs font-medium font-mono bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity shadow-sm">
                     <Plus className="w-3.5 h-3.5" /> Add
                   </button>
                 </div>
               </div>
               
               <div 
                 className="flex-1 overflow-y-auto p-2 font-mono text-xs"
                 onDragOver={(e) => e.preventDefault()}
                 onDrop={(e) => handleDrop(e, null)}
               >
                 {folders.length === 0 && tilesets.length === 0 ? (
                   <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center space-y-2 font-mono">
                     <p className="text-sm">No tilesets yet.</p>
                     <p className="text-xs">Click Add to import your first spritesheet.</p>
                   </div>
                 ) : (
                   renderTree(null)
                 )}
               </div>
             </ResizablePanel>

             <ResizableHandle withHandle className="bg-sidebar-border" />
             
             <ResizablePanel defaultSize="50%" minSize="20%" className="flex flex-col bg-card/40 min-h-0 min-w-0">
              <div className="h-10 border-b border-sidebar-border flex items-center px-4 shrink-0 bg-sidebar-background">
                <span className="text-xs font-semibold font-mono text-sidebar-foreground/70 tracking-wider uppercase">PREVIEW</span>
              </div>
              <div className="flex-1 overflow-auto p-4 relative bg-muted/10">
                {activeTileset ? (
                  <div className="relative inline-block border shadow-sm cursor-crosshair">
                    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(45deg, #808080 25%, transparent 25%), linear-gradient(-45deg, #808080 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #808080 75%), linear-gradient(-45deg, transparent 75%, #808080 75%)', backgroundSize: '10px 10px', backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px' }}></div>
                    <img 
                      src={activeTileset.dataUrl} 
                      onLoad={(e) => setTilesetDimensions({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
                      alt={activeTileset.name} 
                      className="relative z-10 block max-w-none" 
                      style={{ imageRendering: 'pixelated' }} 
                    />
                    
                    {tilesetDimensions && (
                      <div className="absolute inset-0 z-20 pointer-events-none" style={{ backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.2) 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>
                    )}
                    
                    <div 
                      className="absolute inset-0 z-30" 
                      onMouseMove={(e) => {
                        if (!tilesetDimensions) return
                        const x = Math.floor(e.nativeEvent.offsetX / 32)
                        const y = Math.floor(e.nativeEvent.offsetY / 32)
                        setHoverTile({ x, y })
                      }}
                      onMouseLeave={() => setHoverTile(null)}
                      onClick={() => {
                        if (hoverTile) {
                          setSelectedTile({ tilesetId: activeTileset.fileName, x: hoverTile.x, y: hoverTile.y })
                        }
                      }}
                    >
                      {hoverTile && (
                        <div className="absolute border border-yellow-400 bg-yellow-400/20 pointer-events-none" style={{ left: hoverTile.x * 32, top: hoverTile.y * 32, width: 32, height: 32 }}></div>
                      )}
                      {selectedTile && selectedTile.tilesetId === activeTileset.fileName && (
                        <div className="absolute border-2 border-primary bg-primary/30 pointer-events-none" style={{ left: selectedTile.x * 32, top: selectedTile.y * 32, width: 32, height: 32 }}></div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground font-mono">Select a tileset to preview</div>
                )}
              </div>
             </ResizablePanel>
           </ResizablePanelGroup>
        </ResizablePanel>
       </ResizablePanelGroup>

         {/* Dialogs */}
         <Dialog open={importDialog.open} onOpenChange={(open) => !open && setImportDialog({ open: false })}>
           <DialogContent>
             <form onSubmit={(e) => { e.preventDefault(); handleConfirmImport(); }}>
               <DialogHeader>
                 <DialogTitle>Import Tileset</DialogTitle>
               </DialogHeader>
               <div className="py-4 space-y-4">
                 <div className="space-y-2">
                   <label className="text-sm font-medium">Tileset Name</label>
                   <Input value={nameInput} onChange={e => setNameInput(e.target.value)} autoFocus />
                 </div>
               </div>
               <DialogFooter>
                 <button type="button" onClick={() => setImportDialog({ open: false })} className="px-4 py-2 rounded-md hover:bg-muted text-sm font-medium">Cancel</button>
                 <button type="submit" className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">Import</button>
               </DialogFooter>
             </form>
           </DialogContent>
         </Dialog>

         <Dialog open={createFolderDialog.open} onOpenChange={(open) => !open && setCreateFolderDialog({ open: false })}>
           <DialogContent>
             <form onSubmit={(e) => { e.preventDefault(); handleConfirmCreateFolder(); }}>
               <DialogHeader>
                 <DialogTitle>New Folder</DialogTitle>
               </DialogHeader>
               <div className="py-4 space-y-4">
                 <div className="space-y-2">
                   <label className="text-sm font-medium">Folder Name</label>
                   <Input value={createFolderName} onChange={e => setCreateFolderName(e.target.value)} autoFocus />
                 </div>
               </div>
               <DialogFooter>
                 <button type="button" onClick={() => setCreateFolderDialog({ open: false })} className="px-4 py-2 rounded-md hover:bg-muted text-sm font-medium">Cancel</button>
                 <button type="submit" className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">Create</button>
               </DialogFooter>
             </form>
           </DialogContent>
         </Dialog>

          <Dialog open={renameDialog.open} onOpenChange={(open) => !open && setRenameDialog({ open: false, type: 'folder' })}>
            <DialogContent>
              <form onSubmit={(e) => { e.preventDefault(); handleConfirmRename(); }}>
                <DialogHeader>
                  <DialogTitle>Rename {renameDialog.type === 'folder' ? 'Folder' : 'Tileset'}</DialogTitle>
                </DialogHeader>
                <div className="py-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">New Name</label>
                    <Input value={renameInput} onChange={e => setRenameInput(e.target.value)} autoFocus />
                  </div>
                </div>
                <DialogFooter>
                  <button type="button" onClick={() => setRenameDialog({ open: false, type: 'folder' })} className="px-4 py-2 rounded-md hover:bg-muted text-sm font-medium">Cancel</button>
                  <button type="submit" className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">Save</button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={createLayerDialog} onOpenChange={setCreateLayerDialog}>
            <DialogContent>
              <form onSubmit={(e) => { e.preventDefault(); handleConfirmCreateLayer(); }}>
                <DialogHeader>
                  <DialogTitle>New Layer</DialogTitle>
                </DialogHeader>
                <div className="py-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Layer Name</label>
                    <Input value={newLayerData.name} onChange={e => setNewLayerData({ ...newLayerData, name: e.target.value })} autoFocus />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Layer Type</label>
                    <Select value={newLayerData.type} onValueChange={(v: LayerType) => setNewLayerData({ ...newLayerData, type: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tile">Tile Layer</SelectItem>
                        <SelectItem value="collision">Collision Layer</SelectItem>
                        <SelectItem value="terrain">Terrain Layer</SelectItem>
                        <SelectItem value="objects">Object Layer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <button type="button" onClick={() => setCreateLayerDialog(false)} className="px-4 py-2 rounded-md hover:bg-muted text-sm font-medium">Cancel</button>
                  <button type="submit" className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">Create</button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={createMapFolderDialog.open} onOpenChange={(open) => !open && setCreateMapFolderDialog({ open: false })}>
            <DialogContent>
              <form onSubmit={(e) => { e.preventDefault(); handleConfirmCreateMapFolder(); }}>
                <DialogHeader>
                  <DialogTitle>New Map Folder</DialogTitle>
                </DialogHeader>
                <div className="py-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Folder Name</label>
                    <Input value={createMapFolderName} onChange={e => setCreateMapFolderName(e.target.value)} autoFocus />
                  </div>
                </div>
                <DialogFooter>
                  <button type="button" onClick={() => setCreateMapFolderDialog({ open: false })} className="px-4 py-2 rounded-md hover:bg-muted text-sm font-medium">Cancel</button>
                  <button type="submit" className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">Create</button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={createMapDialog.open} onOpenChange={(open) => !open && setCreateMapDialog({ open: false })}>
            <DialogContent>
              <form onSubmit={(e) => { e.preventDefault(); handleConfirmCreateMap(); }}>
                <DialogHeader>
                  <DialogTitle>New Map</DialogTitle>
                </DialogHeader>
                <div className="py-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Map Name</label>
                    <Input value={createMapData.name} onChange={e => setCreateMapData({ ...createMapData, name: e.target.value })} autoFocus />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Width (Tiles)</label>
                      <Input type="number" min={1} max={500} value={createMapData.width} onChange={e => setCreateMapData({ ...createMapData, width: parseInt(e.target.value) || 1 })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Height (Tiles)</label>
                      <Input type="number" min={1} max={500} value={createMapData.height} onChange={e => setCreateMapData({ ...createMapData, height: parseInt(e.target.value) || 1 })} />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <button type="button" onClick={() => setCreateMapDialog({ open: false })} className="px-4 py-2 rounded-md hover:bg-muted text-sm font-medium">Cancel</button>
                  <button type="submit" className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">Create</button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
      </div>
    )
  }
})

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
