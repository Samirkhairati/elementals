import { createRouter, createRoute, createRootRoute, createHashHistory, Outlet } from '@tanstack/react-router'
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { useThemeStore } from '@/store/themeStore'
import { useEffect, useState, useRef } from 'react'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, FolderPlus, Folder as FolderIcon, ChevronRight, ChevronDown, Edit2, FileImage, Trash2, Layers, Eye, EyeOff, Lock, Unlock, Box, ImageIcon, CheckSquare, Hexagon, Settings2, Undo, Redo, Brush, Eraser, Square, PaintBucket, Grid, Shuffle, Stamp, Download } from "lucide-react"

export type LayerType = 'tile' | 'collision' | 'terrain' | 'objects'
export interface Layer {
  id: string
  name: string
  type: LayerType
  visible: boolean
  locked: boolean
  z?: number
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
    
    // Tools & Paint Modes
    const [activeTool, setActiveTool] = useState<'brush' | 'eraser' | 'rectangle' | 'bucket'>('brush')
    const [paintMode, setPaintMode] = useState<'discontinuous' | 'continuous' | 'random'>('discontinuous')
    
    // Rectangle Tool State
    const [rectStart, setRectStart] = useState<{x: number, y: number} | null>(null)
    const [rectCurrent, setRectCurrent] = useState<{x: number, y: number} | null>(null)
    
    // Continuous Mode Anchor
    const [paintStartPos, setPaintStartPos] = useState<{x: number, y: number} | null>(null)

    const [selectedTile, setSelectedTile] = useState<{ tilesetId: string, x: number, y: number } | null>(null)
    const [hoverTile, setHoverTile] = useState<{ x: number, y: number } | null>(null)
    const [tilesetDimensions, setTilesetDimensions] = useState<{width: number, height: number} | null>(null)
    const [isPainting, setIsPainting] = useState(false)
    
    // Undo/Redo History
    const [history, setHistory] = useState<{ layers: Layer[] }[]>([])
    const [historyIndex, setHistoryIndex] = useState(-1)
    
    const commitHistory = (stateToPush: Layer[]) => {
      setHistory(prev => {
        if (prev.length > 0 && JSON.stringify(prev[historyIndex]?.layers) === JSON.stringify(stateToPush)) return prev;
        const newHist = prev.slice(0, historyIndex + 1)
        newHist.push({ layers: JSON.parse(JSON.stringify(stateToPush)) })
        if (newHist.length > 50) newHist.shift()
        setHistoryIndex(newHist.length - 1)
        return newHist
      })
    }

    const handleCommit = () => {
      setLayers(prev => {
        commitHistory(prev)
        return prev
      })
    }

    const handleUndo = () => {
      if (historyIndex > 0) {
        const prev = history[historyIndex - 1]
        const restoredLayers = JSON.parse(JSON.stringify(prev.layers))
        setLayers(restoredLayers)
        setHistoryIndex(historyIndex - 1)
        if (activeMap) {
          const updatedMap = { ...activeMap, layers: restoredLayers }
          setActiveMap(updatedMap)
          window.electronAPI?.saveMap(activeMap.folderPath, activeMap.fileName, updatedMap)
        }
      }
    }

    const handleRedo = () => {
      if (historyIndex < history.length - 1) {
        const next = history[historyIndex + 1]
        const restoredLayers = JSON.parse(JSON.stringify(next.layers))
        setLayers(restoredLayers)
        setHistoryIndex(historyIndex + 1)
        if (activeMap) {
          const updatedMap = { ...activeMap, layers: restoredLayers }
          setActiveMap(updatedMap)
          window.electronAPI?.saveMap(activeMap.folderPath, activeMap.fileName, updatedMap)
        }
      }
    }

    // Keyboard Shortcuts for Undo/Redo
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        // Prevent shortcuts if typing in an input
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          if (e.shiftKey) {
            handleRedo()
          } else {
            handleUndo()
          }
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
          handleRedo()
        } else if (!e.ctrlKey && !e.metaKey) {
          switch (e.key.toLowerCase()) {
            case 'b':
              setActiveTool('brush')
              break
            case 'e':
              setActiveTool('eraser')
              break
            case 'm':
              setActiveTool('rectangle')
              break
            case 'g':
              setActiveTool('bucket')
              break
          }
        }
      }
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }, [history, historyIndex, activeMap])
    
    interface CopiedTile {
      tilesetId: string
      x: number
      y: number
    }
    
    const [tileSelection, setTileSelection] = useState<{width: number, height: number, tiles: (CopiedTile | null)[]} | null>(null)
    const [tilesetSelectionStart, setTilesetSelectionStart] = useState<{x: number, y: number} | null>(null)
    const [tilesetSelectionCurrent, setTilesetSelectionCurrent] = useState<{x: number, y: number} | null>(null)
    const [canvasCopyStart, setCanvasCopyStart] = useState<{x: number, y: number} | null>(null)
    const [canvasCopyCurrent, setCanvasCopyCurrent] = useState<{x: number, y: number} | null>(null)
    const [canvasHover, setCanvasHover] = useState<{x: number, y: number} | null>(null)
    const [debugExpanded, setDebugExpanded] = useState(false)
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

    const getTilesetSelectionBox = () => {
      if (!tilesetSelectionStart || !tilesetSelectionCurrent) return null;
      const minX = Math.min(tilesetSelectionStart.x, tilesetSelectionCurrent.x);
      const minY = Math.min(tilesetSelectionStart.y, tilesetSelectionCurrent.y);
      const maxX = Math.max(tilesetSelectionStart.x, tilesetSelectionCurrent.x);
      const maxY = Math.max(tilesetSelectionStart.y, tilesetSelectionCurrent.y);
      return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
    }
    
    const getCanvasCopyBox = () => {
      if (!canvasCopyStart || !canvasCopyCurrent) return null;
      const minX = Math.min(canvasCopyStart.x, canvasCopyCurrent.x);
      const minY = Math.min(canvasCopyStart.y, canvasCopyCurrent.y);
      const maxX = Math.max(canvasCopyStart.x, canvasCopyCurrent.x);
      const maxY = Math.max(canvasCopyStart.y, canvasCopyCurrent.y);
      return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
    }

    const handlePaint = (gridX: number, gridY: number) => {
      const time = Date.now()
      if (!activeMap) { setDebugInfo({ action: 'paint', error: 'No active map', time }); return }
      if (!activeLayerId) { setDebugInfo({ action: 'paint', error: 'No active layer', time }); return }
      if (activeTool === 'brush' && !tileSelection) { setDebugInfo({ action: 'paint', error: 'No tile selected', time }); return }
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
        if (activeTool === 'brush' && tileSelection) {
          for (let dy = 0; dy < tileSelection.height; dy++) {
            for (let dx = 0; dx < tileSelection.width; dx++) {
              const targetX = gridX + dx;
              const targetY = gridY + dy;
              if (targetX < 0 || targetX >= activeMap.width || targetY < 0 || targetY >= activeMap.height) continue;
              
              const tIndex = targetY * activeMap.width + targetX;
              let sourceTile = null;

              if (paintMode === 'continuous' && paintStartPos) {
                const offsetX = (targetX - paintStartPos.x) % tileSelection.width;
                const offsetY = (targetY - paintStartPos.y) % tileSelection.height;
                const srcX = offsetX >= 0 ? offsetX : tileSelection.width + offsetX;
                const srcY = offsetY >= 0 ? offsetY : tileSelection.height + offsetY;
                sourceTile = tileSelection.tiles[srcY * tileSelection.width + srcX];
              } else if (paintMode === 'random') {
                sourceTile = tileSelection.tiles[Math.floor(Math.random() * tileSelection.tiles.length)];
              } else {
                // discontinuous
                sourceTile = tileSelection.tiles[dy * tileSelection.width + dx];
              }
              
              if (sourceTile === null) {
                // Empty copied tile acts as eraser
                delete newData[tIndex];
              } else {
                newData[tIndex] = {
                  tilesetId: sourceTile.tilesetId,
                  x: sourceTile.x,
                  y: sourceTile.y
                };
              }
            }
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

    const handlePaintBucket = (gridX: number, gridY: number) => {
      const time = Date.now()
      if (!activeMap || !activeLayerId || !tileSelection) return
      
      setLayers(prevLayers => {
        const layerIndex = prevLayers.findIndex(l => l.id === activeLayerId)
        if (layerIndex === -1) return prevLayers
        const layer = prevLayers[layerIndex]
        if (layer.locked || !layer.visible) return prevLayers

        const currentData = layer.data || {}
        let newData = { ...currentData }

        const startIndex = gridY * activeMap.width + gridX
        const targetTile = currentData[startIndex] // Could be undefined

        // BFS flood fill
        const queue: {x: number, y: number}[] = [{x: gridX, y: gridY}]
        const visited = new Set<number>()
        
        // Ensure we don't start looping forever if painting same tile
        const getTileStr = (t: any) => t ? `${t.tilesetId}_${t.x}_${t.y}` : 'empty'
        const targetStr = getTileStr(targetTile)
        
        while (queue.length > 0) {
          const {x, y} = queue.shift()!
          const idx = y * activeMap.width + x
          
          if (visited.has(idx)) continue
          visited.add(idx)

          // Paint the tile using current paint mode rules
          let sourceTile = null;
          if (paintMode === 'continuous' && paintStartPos) {
            const offsetX = (x - paintStartPos.x) % tileSelection.width;
            const offsetY = (y - paintStartPos.y) % tileSelection.height;
            const srcX = offsetX >= 0 ? offsetX : tileSelection.width + offsetX;
            const srcY = offsetY >= 0 ? offsetY : tileSelection.height + offsetY;
            sourceTile = tileSelection.tiles[srcY * tileSelection.width + srcX];
          } else if (paintMode === 'random') {
            sourceTile = tileSelection.tiles[Math.floor(Math.random() * tileSelection.tiles.length)];
          } else {
            // Discontinuous doesn't make much sense for bucket, but we can tile it relative to (0,0) or (paintStartPos.x, paintStartPos.y)
            const rootX = paintStartPos ? paintStartPos.x : gridX;
            const rootY = paintStartPos ? paintStartPos.y : gridY;
            const offsetX = (x - rootX) % tileSelection.width;
            const offsetY = (y - rootY) % tileSelection.height;
            const srcX = offsetX >= 0 ? offsetX : tileSelection.width + offsetX;
            const srcY = offsetY >= 0 ? offsetY : tileSelection.height + offsetY;
            sourceTile = tileSelection.tiles[srcY * tileSelection.width + srcX];
          }

          if (sourceTile === null) {
            delete newData[idx];
          } else {
            newData[idx] = { tilesetId: sourceTile.tilesetId, x: sourceTile.x, y: sourceTile.y };
          }

          // Check neighbors
          const neighbors = [
            {nx: x, ny: y - 1}, {nx: x, ny: y + 1},
            {nx: x - 1, ny: y}, {nx: x + 1, ny: y}
          ]
          for (const {nx, ny} of neighbors) {
            if (nx >= 0 && nx < activeMap.width && ny >= 0 && ny < activeMap.height) {
              const nIdx = ny * activeMap.width + nx
              if (!visited.has(nIdx) && getTileStr(currentData[nIdx]) === targetStr) {
                queue.push({x: nx, y: ny})
              }
            }
          }
        }

        const newLayers = [...prevLayers]
        newLayers[layerIndex] = { ...layer, data: newData }
        commitHistory(newLayers)
        return newLayers
      })
    }

    const handleRectangleFill = (startPos: {x: number, y: number}, endPos: {x: number, y: number}) => {
      if (!activeMap || !activeLayerId || !tileSelection) return
      
      setLayers(prevLayers => {
        const layerIndex = prevLayers.findIndex(l => l.id === activeLayerId)
        if (layerIndex === -1) return prevLayers
        const layer = prevLayers[layerIndex]
        if (layer.locked || !layer.visible) return prevLayers

        const currentData = layer.data || {}
        let newData = { ...currentData }

        const minX = Math.max(0, Math.min(startPos.x, endPos.x))
        const minY = Math.max(0, Math.min(startPos.y, endPos.y))
        const maxX = Math.min(activeMap.width - 1, Math.max(startPos.x, endPos.x))
        const maxY = Math.min(activeMap.height - 1, Math.max(startPos.y, endPos.y))

        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const idx = y * activeMap.width + x
            let sourceTile = null;
            
            if (paintMode === 'continuous' || paintMode === 'discontinuous') {
              // For rectangle fill, continuous and discontinuous act identically anchoring to startPos
              const offsetX = (x - startPos.x) % tileSelection.width;
              const offsetY = (y - startPos.y) % tileSelection.height;
              const srcX = offsetX >= 0 ? offsetX : tileSelection.width + offsetX;
              const srcY = offsetY >= 0 ? offsetY : tileSelection.height + offsetY;
              sourceTile = tileSelection.tiles[srcY * tileSelection.width + srcX];
            } else if (paintMode === 'random') {
              sourceTile = tileSelection.tiles[Math.floor(Math.random() * tileSelection.tiles.length)];
            }

            if (sourceTile === null) {
              delete newData[idx];
            } else {
              newData[idx] = { tilesetId: sourceTile.tilesetId, x: sourceTile.x, y: sourceTile.y };
            }
          }
        }

        const newLayers = [...prevLayers]
        newLayers[layerIndex] = { ...layer, data: newData }
        commitHistory(newLayers)
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

    const handleExportMap = async (mapToExportRaw: any) => {
      if (!window.electronAPI) return
      
      const mapToExport = (activeMap && mapToExportRaw.fileName === activeMap.fileName)
        ? { ...mapToExportRaw, layers }
        : mapToExportRaw;

      const usedTilesets = new Set<string>()
      for (const layer of mapToExport.layers || []) {
        for (const tile of Object.values(layer.data || {}) as any[]) {
          usedTilesets.add(tile.tilesetId)
        }
      }

      const exportTilesets: any[] = []
      let currentGid = 1
      for (const tsId of usedTilesets) {
        const ts = tilesets.find(t => t.fileName === tsId)
        if (!ts) continue
        
        const dim = await new Promise<{w: number, h: number}>(resolve => {
          const img = new Image()
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
          img.onerror = () => resolve({ w: 0, h: 0 })
          img.src = ts.dataUrl
        })
        
        if (dim.w === 0 || dim.h === 0) continue

        const columns = Math.floor(dim.w / 32)
        const tilecount = columns * Math.floor(dim.h / 32)
        
        exportTilesets.push({
          columns,
          firstgid: currentGid,
          image: ts.fileName,
          imageheight: dim.h,
          imagewidth: dim.w,
          margin: 0,
          name: ts.name,
          spacing: 0,
          tilecount,
          tileheight: 32,
          tilewidth: 32
        })
        
        currentGid += tilecount
      }

      const exportLayers = (mapToExport.layers || []).map((layer: any, index: number) => {
        const data = new Array(mapToExport.width * mapToExport.height).fill(0)
        
        for (const [indexStr, tile] of Object.entries(layer.data || {}) as any[]) {
          const idx = parseInt(indexStr)
          const tsExport = exportTilesets.find(t => t.name === tilesets.find(ts => ts.fileName === tile.tilesetId)?.name)
          if (tsExport) {
            const gid = tsExport.firstgid + (tile.y * tsExport.columns + tile.x)
            data[idx] = gid
          }
        }

        const exportLayer: any = {
          data,
          height: mapToExport.height,
          id: index + 1,
          name: layer.name,
          opacity: 1,
          type: layer.type === 'tile' ? 'tilelayer' : (layer.type === 'objects' ? 'objectgroup' : 'tilelayer'),
          visible: layer.visible,
          width: mapToExport.width,
          x: 0,
          y: 0,
        }
        
        const props = []
        if (layer.z !== undefined) {
          props.push({ name: 'z', type: 'int', value: Number(layer.z) })
        }
        if (props.length > 0) {
          exportLayer.properties = props
        }
        
        return exportLayer
      })

      const tiledMap = {
        compressionlevel: -1,
        height: mapToExport.height,
        infinite: false,
        layers: exportLayers,
        nextlayerid: exportLayers.length + 1,
        nextobjectid: 1,
        orientation: "orthogonal",
        renderorder: "right-down",
        tiledversion: "1.10.2",
        tileheight: 32,
        tilesets: exportTilesets,
        tilewidth: 32,
        type: "map",
        version: "1.10",
        width: mapToExport.width
      }

      const res = await window.electronAPI.exportMap(JSON.stringify(tiledMap, null, 2), mapToExport.name + ".json")
      if (res && res.success) {
        // silently succeed
      } else if (res && res.error && res.error !== 'Canceled') {
        alert("Export failed: " + res.error)
      }
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
        const initLayers = res.map.layers || []
        setLayers(initLayers)
        setActiveLayerId(initLayers?.[0]?.id || null)
        setHistory([{ layers: JSON.parse(JSON.stringify(initLayers)) }])
        setHistoryIndex(0)
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
              onClick={() => { 
                setActiveMap(m)
                const initLayers = m.layers || []
                setLayers(initLayers)
                setActiveLayerId(initLayers?.[0]?.id || null)
                setHistory([{ layers: JSON.parse(JSON.stringify(initLayers)) }])
                setHistoryIndex(0)
              }}
              className={`flex items-center group py-1.5 px-2.5 rounded-md cursor-pointer text-sm ml-5 transition-colors ${activeMap?.fileName === m.fileName ? 'bg-primary/30 text-primary-foreground font-medium border border-primary/40' : 'hover:bg-sidebar-accent text-sidebar-foreground'}`}
            >
              <FileImage className="w-4 h-4 mr-2 opacity-80" />
              <span className="flex-1 truncate">{m.name}</span>
              <div className="hidden group-hover:flex items-center gap-1">
                <button 
                  onClick={(e) => { e.stopPropagation(); handleExportMap(m) }} 
                  className="p-1 hover:bg-black/10 rounded" title="Export Map"
                >
                  <Download className="w-3 h-3" />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setRenameInput(m.name); setRenameDialog({ open: true, type: 'map', oldName: m.name, oldPath: m.fileName, targetFolder: m.folderPath }) }} 
                  className="p-1 hover:bg-black/10 rounded" title="Rename Map"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDeleteMap(m.folderPath, m.fileName) }} 
                  className="p-1 hover:bg-red-500/20 hover:text-red-400 rounded text-red-400" title="Delete Map"
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
            
            <ResizablePanel defaultSize="40%" minSize="20%" className="flex flex-col min-h-0 min-w-0">
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
                <span className="text-xs font-semibold font-mono text-sidebar-foreground/70 tracking-wider uppercase">ACTIVE SELECTION</span>
              </div>
              <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-muted/10">
                {tileSelection ? (
                  <div 
                    className="relative border shadow-sm"
                    style={{
                      width: tileSelection.width * 32,
                      height: tileSelection.height * 32,
                      backgroundImage: 'linear-gradient(45deg, #808080 25%, transparent 25%), linear-gradient(-45deg, #808080 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #808080 75%), linear-gradient(-45deg, transparent 75%, #808080 75%)', 
                      backgroundSize: '10px 10px', 
                      backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px'
                    }}
                  >
                    {tileSelection.tiles.map((t, i) => {
                      if (!t) return null
                      const dx = i % tileSelection.width
                      const dy = Math.floor(i / tileSelection.width)
                      const tileset = tilesets.find(ts => ts.fileName === t.tilesetId)
                      if (!tileset) return null
                      return (
                        <div 
                          key={i}
                          className="absolute"
                          style={{
                            left: dx * 32,
                            top: dy * 32,
                            width: 32,
                            height: 32,
                            backgroundImage: `url(${tileset.dataUrl})`,
                            backgroundPosition: `-${t.x * 32}px -${t.y * 32}px`,
                            imageRendering: 'pixelated'
                          }}
                        />
                      )
                    })}
                    <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.2) 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground text-center font-mono">No tiles selected</div>
                )}
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle className="bg-sidebar-border" />
            
            <ResizablePanel defaultSize="30%" minSize="20%" className="flex flex-col bg-card/40 min-h-0 min-w-0">
              <div className="h-10 border-b border-sidebar-border flex items-center px-4 shrink-0 bg-sidebar-background">
                <span className="text-xs font-semibold font-mono text-sidebar-foreground/70 tracking-wider uppercase">PROPERTIES</span>
              </div>
              <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-start text-xs text-muted-foreground text-center">
                {!activeLayerId ? (
                  <div className="my-auto">Select a layer to view properties</div>
                ) : (
                  (() => {
                    const layer = layers.find(l => l.id === activeLayerId)
                    if (!layer) return <div className="my-auto">Layer not found</div>
                    return (
                      <div className="w-full space-y-4 text-left font-mono">
                        <div className="space-y-1">
                          <label className="font-medium text-foreground">Name</label>
                          <Input 
                            value={layer.name} 
                            onChange={e => updateLayers(layers.map(l => l.id === activeLayerId ? { ...l, name: e.target.value } : l))} 
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-medium text-foreground">Z-Index (z)</label>
                          <Input 
                            type="number" 
                            value={layer.z === undefined ? '' : layer.z} 
                            onChange={e => {
                              const val = e.target.value === '' ? undefined : parseInt(e.target.value);
                              updateLayers(layers.map(l => l.id === activeLayerId ? { ...l, z: val } : l))
                            }}
                            placeholder="e.g. 0"
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                      </div>
                    )
                  })()
                )}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-border" />

        <ResizablePanel defaultSize="55%" minSize="30%" className="flex flex-col min-w-0 min-h-0">
         <div className="flex-1 bg-muted/10 relative overflow-hidden flex flex-col min-w-0 min-h-0">
           {/* Top Menu Bar */}
           <div className="h-14 border-b border-border bg-background flex items-center px-4 shrink-0 shadow-sm z-10 justify-center gap-4">
             {/* History Group */}
             <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-md border">
               <button onClick={handleUndo} disabled={historyIndex <= 0} className={`p-2 rounded-md flex items-center justify-center transition-colors ${historyIndex <= 0 ? 'opacity-50 cursor-not-allowed text-muted-foreground' : 'hover:bg-muted text-foreground'}`} title="Undo (Ctrl+Z)">
                 <Undo className="w-4 h-4" />
               </button>
               <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className={`p-2 rounded-md flex items-center justify-center transition-colors ${historyIndex >= history.length - 1 ? 'opacity-50 cursor-not-allowed text-muted-foreground' : 'hover:bg-muted text-foreground'}`} title="Redo (Ctrl+Y)">
                 <Redo className="w-4 h-4" />
               </button>
             </div>

             {/* Divider */}
             <div className="w-px h-6 bg-border mx-2"></div>

             {/* Tools Group */}
             <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-md border">
               <button onClick={() => setActiveTool('brush')} className={`p-2 rounded-md flex items-center justify-center transition-colors ${activeTool === 'brush' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted text-muted-foreground'}`} title="Brush Tool (B)">
                 <Brush className="w-4 h-4" />
               </button>
               <button onClick={() => setActiveTool('eraser')} className={`p-2 rounded-md flex items-center justify-center transition-colors ${activeTool === 'eraser' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted text-muted-foreground'}`} title="Eraser Tool (E)">
                 <Eraser className="w-4 h-4" />
               </button>
               <button onClick={() => setActiveTool('rectangle')} className={`p-2 rounded-md flex items-center justify-center transition-colors ${activeTool === 'rectangle' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted text-muted-foreground'}`} title="Rectangle Draw Tool (M)">
                 <Square className="w-4 h-4" />
               </button>
               <button onClick={() => setActiveTool('bucket')} className={`p-2 rounded-md flex items-center justify-center transition-colors ${activeTool === 'bucket' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted text-muted-foreground'}`} title="Paint Bucket Tool (G)">
                 <PaintBucket className="w-4 h-4" />
               </button>
             </div>

             {/* Divider */}
             <div className="w-px h-6 bg-border mx-2"></div>

             {/* Mode Group */}
             <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-md border">
               <button onClick={() => setPaintMode('discontinuous')} className={`p-2 rounded-md flex items-center justify-center transition-colors ${paintMode === 'discontinuous' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted text-muted-foreground'}`} title="Discontinuous Mode">
                 <Stamp className="w-4 h-4" />
               </button>
               <button onClick={() => setPaintMode('continuous')} className={`p-2 rounded-md flex items-center justify-center transition-colors ${paintMode === 'continuous' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted text-muted-foreground'}`} title="Continuous Mode">
                 <Grid className="w-4 h-4" />
               </button>
               <button onClick={() => setPaintMode('random')} className={`p-2 rounded-md flex items-center justify-center transition-colors ${paintMode === 'random' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted text-muted-foreground'}`} title="Random Mode">
                 <Shuffle className="w-4 h-4" />
               </button>
             </div>
           </div>

           {/* Canvas Area */}
           <div 
             className="flex-1 overflow-hidden flex items-center justify-center min-w-0 min-h-0 bg-[#1a1a1a]"
             onWheel={(e) => {
               // Always zoom on scroll, adjust sensitivity based on whether they use modifiers
               const zoomSensitivity = (e.ctrlKey || e.metaKey) ? 0.005 : 0.001
               setZoom(prev => Math.min(Math.max(0.1, prev - e.deltaY * zoomSensitivity), 5))
             }}
             onMouseDown={(e) => {
               // Only pan on middle-click (button 1)
               if (e.button === 1) {
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
               if (e.button === 1) setIsPanning(false)
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
                      height: activeMap.height * 32
                    }}
                    onMouseDown={(e) => {
                      if (e.button === 1) return;
                      const x = Math.floor(e.nativeEvent.offsetX / 32)
                      const y = Math.floor(e.nativeEvent.offsetY / 32)
                      if (e.button === 2) {
                        setCanvasCopyStart({ x, y })
                        setCanvasCopyCurrent({ x, y })
                        return
                      }
                      
                      if (activeTool === 'bucket') {
                        handlePaintBucket(x, y)
                        return
                      }
                      
                      if (activeTool === 'rectangle') {
                        setRectStart({ x, y })
                        setRectCurrent({ x, y })
                        if (paintMode === 'continuous' || paintMode === 'discontinuous') setPaintStartPos({ x, y })
                        return
                      }

                      setIsPainting(true)
                      if (paintMode === 'continuous' || paintMode === 'discontinuous') setPaintStartPos({ x, y })
                      handlePaint(x, y)
                    }}
                    onMouseUp={(e) => {
                      if (e.button === 2 && canvasCopyStart) {
                        const box = getCanvasCopyBox()
                        if (box && activeLayerId) {
                           const layer = layers.find(l => l.id === activeLayerId)
                           const currentData = layer?.data || {}
                           const tiles: (CopiedTile | null)[] = []
                           for (let dy = 0; dy < box.height; dy++) {
                             for (let dx = 0; dx < box.width; dx++) {
                               const targetX = box.minX + dx;
                               const targetY = box.minY + dy;
                               const tileIndex = targetY * activeMap.width + targetX;
                               const existing = currentData[tileIndex];
                               if (existing) {
                                 tiles.push({ tilesetId: existing.tilesetId, x: existing.x, y: existing.y })
                               } else {
                                 tiles.push(null)
                               }
                             }
                           }
                           setTileSelection({ width: box.width, height: box.height, tiles })
                           setActiveTool('brush')
                        }
                        setCanvasCopyStart(null)
                        setCanvasCopyCurrent(null)
                      }
                      
                      if (activeTool === 'rectangle' && rectStart && rectCurrent) {
                        handleRectangleFill(rectStart, rectCurrent)
                        setRectStart(null)
                        setRectCurrent(null)
                      }
                      
                      if (isPainting) {
                        handleCommit()
                      }
                      setIsPainting(false)
                    }}
                    onMouseLeave={() => {
                      setCanvasHover(null)
                      if (canvasCopyStart) {
                        const box = getCanvasCopyBox()
                        if (box && activeLayerId) {
                           const layer = layers.find(l => l.id === activeLayerId)
                           const currentData = layer?.data || {}
                           const tiles: (CopiedTile | null)[] = []
                           for (let dy = 0; dy < box.height; dy++) {
                             for (let dx = 0; dx < box.width; dx++) {
                               const targetX = box.minX + dx;
                               const targetY = box.minY + dy;
                               const tileIndex = targetY * activeMap.width + targetX;
                               const existing = currentData[tileIndex];
                               if (existing) {
                                 tiles.push({ tilesetId: existing.tilesetId, x: existing.x, y: existing.y })
                               } else {
                                 tiles.push(null)
                               }
                             }
                           }
                           setTileSelection({ width: box.width, height: box.height, tiles })
                           setActiveTool('brush')
                        }
                        setCanvasCopyStart(null)
                        setCanvasCopyCurrent(null)
                      }
                      
                      if (activeTool === 'rectangle' && rectStart && rectCurrent) {
                        handleRectangleFill(rectStart, rectCurrent)
                        setRectStart(null)
                        setRectCurrent(null)
                      }
                      
                      if (isPainting) {
                        handleCommit()
                      }
                      setIsPainting(false)
                    }}
                    onMouseMove={(e) => {
                      const x = Math.floor(e.nativeEvent.offsetX / 32)
                      const y = Math.floor(e.nativeEvent.offsetY / 32)
                      setCanvasHover({ x, y })
                      
                      if (canvasCopyStart) {
                        setCanvasCopyCurrent({ x, y })
                        return
                      }
                      
                      if (activeTool === 'rectangle' && rectStart) {
                        setRectCurrent({ x, y })
                        return
                      }
                      
                      if (!isPainting || isPanning) return
                      handlePaint(x, y)
                    }}
                  >
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

                    {/* Grid Overlay */}
                    <div 
                      className="absolute inset-0 pointer-events-none z-20"
                      style={{
                        backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.2) 1px, transparent 1px)',
                        backgroundSize: '32px 32px'
                      }}
                    />

                   {canvasHover && !canvasCopyStart && activeTool === 'brush' && tileSelection && (
                     <div 
                       className="absolute border border-yellow-400 bg-yellow-400/20 pointer-events-none z-40" 
                       style={{ left: canvasHover.x * 32, top: canvasHover.y * 32, width: tileSelection.width * 32, height: tileSelection.height * 32 }}
                     ></div>
                   )}
                   {canvasHover && !canvasCopyStart && activeTool === 'eraser' && (
                     <div 
                       className="absolute border border-red-500 bg-red-500/20 pointer-events-none z-40" 
                       style={{ left: canvasHover.x * 32, top: canvasHover.y * 32, width: 32, height: 32 }}
                     ></div>
                   )}
                   {(() => {
                     const box = getCanvasCopyBox()
                     if (box) {
                       return (
                          <div className="absolute border-2 border-primary bg-primary/30 pointer-events-none z-40" style={{ left: box.minX * 32, top: box.minY * 32, width: box.width * 32, height: box.height * 32 }}></div>
                       )
                     }
                     if (activeTool === 'rectangle' && rectStart && rectCurrent) {
                       const minX = Math.min(rectStart.x, rectCurrent.x);
                       const minY = Math.min(rectStart.y, rectCurrent.y);
                       const maxX = Math.max(rectStart.x, rectCurrent.x);
                       const maxY = Math.max(rectStart.y, rectCurrent.y);
                       const width = maxX - minX + 1;
                       const height = maxY - minY + 1;
                       return (
                          <div className="absolute border-2 border-green-500 bg-green-500/30 pointer-events-none z-40" style={{ left: minX * 32, top: minY * 32, width: width * 32, height: height * 32 }}></div>
                       )
                     }
                     return null
                   })()}
                  </div>
                </div>
             ) : (
               <div className="text-muted-foreground font-mono text-xs tracking-wider opacity-50">
                  Select or create a map to start editing
               </div>
             )}
             
             {/* Debug Panel */}
             <div className={`absolute bottom-4 right-4 bg-black/80 text-green-400 rounded font-mono z-50 shadow-lg ring-1 ring-white/20 min-w-[250px] transition-all overflow-hidden ${debugExpanded ? 'p-4' : 'p-2'}`}>
              <div 
                className="font-bold text-white uppercase tracking-wider flex items-center justify-between cursor-pointer"
                onClick={() => setDebugExpanded(!debugExpanded)}
              >
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-green-400" />
                  <span className="text-xs">Debug Status</span>
                </div>
                <button className="hover:bg-white/10 p-1 rounded">
                  {debugExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
              </div>
              
              {debugExpanded && (
                <div className="flex flex-col gap-1 mt-2 border-t border-white/20 pt-2 text-xs pointer-events-none">
                  <div>Tool: {activeTool}</div>
                  <div>Selection: {tileSelection ? `${tileSelection.width}x${tileSelection.height} tiles` : 'NONE'}</div>
                  <div>Active Layer ID: {activeLayerId || 'NONE'}</div>
                  <div>Active Map: {activeMap ? `${activeMap.name} (${activeMap.width}x${activeMap.height})` : 'NONE'}</div>
                  <div>isPainting: {isPainting ? 'TRUE' : 'FALSE'}</div>
                  <div className="mt-2 text-yellow-400">Last Paint Result:</div>
                  <div className="whitespace-pre-wrap">{debugInfo ? `${debugInfo.action.toUpperCase()} at [${debugInfo.x ?? '-'}, ${debugInfo.y ?? '-'}]\nReason: ${debugInfo.error}` : 'Waiting for input...'}</div>
                </div>
              )}
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
                      className="absolute inset-0 z-30 select-none" 
                      onMouseDown={(e) => {
                        if (e.button !== 0) return
                        const x = Math.floor(e.nativeEvent.offsetX / 32)
                        const y = Math.floor(e.nativeEvent.offsetY / 32)
                        setTilesetSelectionStart({ x, y })
                        setTilesetSelectionCurrent({ x, y })
                      }}
                      onMouseMove={(e) => {
                        if (!tilesetDimensions) return
                        const x = Math.floor(e.nativeEvent.offsetX / 32)
                        const y = Math.floor(e.nativeEvent.offsetY / 32)
                        setHoverTile({ x, y })
                        if (tilesetSelectionStart) {
                          setTilesetSelectionCurrent({ x, y })
                        }
                      }}
                      onMouseUp={() => {
                        const box = getTilesetSelectionBox()
                        if (box) {
                          const tiles: (CopiedTile | null)[] = []
                          for (let dy = 0; dy < box.height; dy++) {
                            for (let dx = 0; dx < box.width; dx++) {
                              tiles.push({
                                tilesetId: activeTileset.fileName,
                                x: box.minX + dx,
                                y: box.minY + dy
                              })
                            }
                          }
                          setTileSelection({ width: box.width, height: box.height, tiles })
                          setTilesetSelectionStart(null)
                          setTilesetSelectionCurrent(null)
                        }
                      }}
                      onMouseLeave={() => {
                        setHoverTile(null)
                        const box = getTilesetSelectionBox()
                        if (box) {
                          const tiles: (CopiedTile | null)[] = []
                          for (let dy = 0; dy < box.height; dy++) {
                            for (let dx = 0; dx < box.width; dx++) {
                              tiles.push({
                                tilesetId: activeTileset.fileName,
                                x: box.minX + dx,
                                y: box.minY + dy
                              })
                            }
                          }
                          setTileSelection({ width: box.width, height: box.height, tiles })
                          setTilesetSelectionStart(null)
                          setTilesetSelectionCurrent(null)
                        }
                      }}
                    >
                      {hoverTile && !tilesetSelectionStart && (
                        <div className="absolute border border-yellow-400 bg-yellow-400/20 pointer-events-none" style={{ left: hoverTile.x * 32, top: hoverTile.y * 32, width: 32, height: 32 }}></div>
                      )}
                      {(() => {
                        const box = getTilesetSelectionBox()
                        if (box) {
                          return (
                            <div className="absolute border-2 border-primary bg-primary/30 pointer-events-none" style={{ left: box.minX * 32, top: box.minY * 32, width: box.width * 32, height: box.height * 32 }}></div>
                          )
                        }
                        if (tileSelection) {
                           return tileSelection.tiles.map((t, i) => {
                             if (!t || t.tilesetId !== activeTileset.fileName) return null
                             return (
                               <div key={i} className="absolute border border-primary bg-primary/30 pointer-events-none" style={{ left: t.x * 32, top: t.y * 32, width: 32, height: 32 }}></div>
                             )
                           })
                        }
                        return null
                      })()}
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
