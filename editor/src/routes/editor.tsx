import { useEffect, useCallback } from 'react'

// Hooks
import { useHistory } from '@/hooks/useHistory'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { usePaintTools } from '@/hooks/usePaintTools'
import { useTilesetManager } from '@/hooks/editor/useTilesetManager'
import { useMapManager } from '@/hooks/editor/useMapManager'
import { useLayerManager } from '@/hooks/editor/useLayerManager'
import { useEditorDialogs } from '@/hooks/editor/useEditorDialogs'

// Layout
import { EditorContext } from '@/components/editor/layout/EditorContext'
import { EditorDockview } from '@/components/editor/layout/EditorDockview'
import { EditorDialogs } from '@/components/editor/layout/EditorDialogs'

export function EditorPage() {
  // ── Layer Manager ────────────────────────────────────────────────────────
  // We initialize layer manager first with activeMap synced from mapManager
  const layerManager = useLayerManager({
    activeMap: null, // connected dynamically in handlers
    setActiveMap: () => {},
  })

  // ── History Hook ─────────────────────────────────────────────────────────
  const historyState = useHistory(layerManager.setLayers)

  // ── Tileset Manager ──────────────────────────────────────────────────────
  const tilesetManager = useTilesetManager({
    onOpenImportDialog: (data) => {
      dialogs.setNameInput(data.defaultName)
      dialogs.setImportDialog({ open: true, ...data })
    },
    onOpenCreateFolderDialog: (parentPath, defaultName) => {
      dialogs.setCreateFolderName(defaultName)
      dialogs.setCreateFolderDialog({ open: true, parentPath })
    },
    onOpenConfirmDialog: (config) => {
      dialogs.setConfirmDialog({ open: true, ...config })
    },
  })

  // ── Map Manager ──────────────────────────────────────────────────────────
  const mapManager = useMapManager({
    tilesets: tilesetManager.tilesets,
    layers: layerManager.layers,
    onMapSelected: (initLayers) => {
      layerManager.setLayers(initLayers)
      layerManager.setActiveLayerId(initLayers?.[0]?.id || null)
      historyState.setHistory([{ layers: JSON.parse(JSON.stringify(initLayers)) }])
      historyState.setHistoryIndex(0)
    },
    onClearActiveMap: () => {
      layerManager.setLayers([])
      layerManager.setActiveLayerId(null)
    },
    onOpenConfirmDialog: (config) => {
      dialogs.setConfirmDialog({ open: true, ...config })
    },
  })

  // ── Data Loading Coordinator ─────────────────────────────────────────────
  const loadData = useCallback(async () => {
    await Promise.all([tilesetManager.loadTilesets(), mapManager.loadMaps()])
  }, [tilesetManager.loadTilesets, mapManager.loadMaps])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Dialogs Hook ─────────────────────────────────────────────────────────
  const dialogs = useEditorDialogs({
    folders: tilesetManager.folders,
    mapFolders: mapManager.mapFolders,
    setExpandedFolders: tilesetManager.setExpandedFolders,
    setExpandedMapFolders: mapManager.setExpandedMapFolders,
    loadData,
    onMapCreated: (map) => {
      mapManager.setActiveMap(map)
      const initLayers = map.layers || []
      layerManager.setLayers(initLayers)
      layerManager.setActiveLayerId(initLayers?.[0]?.id || null)
      historyState.setHistory([{ layers: JSON.parse(JSON.stringify(initLayers)) }])
      historyState.setHistoryIndex(0)
    },
    onRenameLayer: layerManager.handleRenameLayer,
  })

  // ── Undo / Redo Bounding ─────────────────────────────────────────────────
  const boundHandleUndo = useCallback(
    () =>
      historyState.handleUndo(
        layerManager.layers,
        layerManager.setLayers,
        mapManager.activeMap,
        mapManager.setActiveMap
      ),
    [historyState, layerManager.layers, layerManager.setLayers, mapManager.activeMap, mapManager.setActiveMap]
  )

  const boundHandleRedo = useCallback(
    () =>
      historyState.handleRedo(
        layerManager.layers,
        layerManager.setLayers,
        mapManager.activeMap,
        mapManager.setActiveMap
      ),
    [historyState, layerManager.layers, layerManager.setLayers, mapManager.activeMap, mapManager.setActiveMap]
  )

  // ── Keyboard Shortcuts ───────────────────────────────────────────────────
  useKeyboardShortcuts({
    handleUndo: boundHandleUndo,
    handleRedo: boundHandleRedo,
    setActiveTool: layerManager.setActiveTool,
    deps: [historyState.history, historyState.historyIndex, mapManager.activeMap],
  })

  // ── Paint Tools Hook ─────────────────────────────────────────────────────
  const paintTools = usePaintTools({
    activeMap: mapManager.activeMap,
    activeLayerId: layerManager.activeLayerId,
    tileSelection: layerManager.tileSelection,
    activeTool: layerManager.activeTool,
    paintMode: layerManager.paintMode,
    paintStartPos: layerManager.paintStartPos,
    setLayers: layerManager.setLayers,
    commitHistory: historyState.commitHistory,
    setDebugInfo: layerManager.setDebugInfo,
    setActiveMap: mapManager.setActiveMap,
  })

  // ── Context Value for all panels ─────────────────────────────────────────
  const contextValue = {
    // Maps domain
    maps: mapManager.maps,
    mapFolders: mapManager.mapFolders,
    activeMap: mapManager.activeMap,
    expandedMapFolders: mapManager.expandedMapFolders,
    selectedMapFolder: mapManager.selectedMapFolder,
    setSelectedMapFolder: mapManager.setSelectedMapFolder,
    toggleMapFolder: mapManager.toggleMapFolder,
    setCreateMapData: dialogs.setCreateMapData,
    setCreateMapDialog: dialogs.setCreateMapDialog,
    setCreateMapFolderName: dialogs.setCreateMapFolderName,
    setCreateMapFolderDialog: dialogs.setCreateMapFolderDialog,
    setRenameInput: dialogs.setRenameInput,
    setRenameDialog: dialogs.setRenameDialog,
    handleDeleteMapFolder: mapManager.handleDeleteMapFolder,
    handleDeleteMap: mapManager.handleDeleteMap,
    handleExportMap: mapManager.handleExportMap,
    handleMapDrop: mapManager.handleMapDrop,
    onSelectMap: mapManager.onSelectMap,

    // Layers domain
    layers: layerManager.layers,
    activeLayerId: layerManager.activeLayerId,
    setActiveLayerId: layerManager.setActiveLayerId,
    toggleLayerVisibility: layerManager.toggleLayerVisibility,
    toggleLayerLock: layerManager.toggleLayerLock,
    handleDeleteLayer: layerManager.handleDeleteLayer,
    handleReorderLayers: layerManager.handleReorderLayers,
    handleCreateLayer: layerManager.handleCreateLayer,
    handleCreateLayerOfType: layerManager.handleCreateLayerOfType,
    handleRenameLayer: layerManager.handleRenameLayer,
    handleDuplicateLayer: layerManager.handleDuplicateLayer,
    updateLayers: layerManager.updateLayers,
    activeLayerType: layerManager.activeLayerType,

    // History & Painting tools
    historyIndex: historyState.historyIndex,
    historyLength: historyState.history.length,
    activeTool: layerManager.activeTool,
    paintMode: layerManager.paintMode,
    handleUndo: boundHandleUndo,
    handleRedo: boundHandleRedo,
    setActiveTool: layerManager.setActiveTool,
    setPaintMode: layerManager.setPaintMode,
    tilesets: tilesetManager.tilesets,
    tileSelection: layerManager.tileSelection,
    setTileSelection: layerManager.setTileSelection,
    isPainting: layerManager.isPainting,
    setIsPainting: layerManager.setIsPainting,
    paintStartPos: layerManager.paintStartPos,
    setPaintStartPos: layerManager.setPaintStartPos,
    debugInfo: layerManager.debugInfo,
    handlePaint: paintTools.handlePaint,
    handlePaintBucket: paintTools.handlePaintBucket,
    handleRectangleFill: paintTools.handleRectangleFill,
    handleCommit: historyState.handleCommit,

    // Tilesets domain
    folders: tilesetManager.folders,
    activeTileset: tilesetManager.activeTileset,
    setActiveTileset: tilesetManager.setActiveTileset,
    expandedFolders: tilesetManager.expandedFolders,
    selectedFolder: tilesetManager.selectedFolder,
    setSelectedFolder: tilesetManager.setSelectedFolder,
    toggleFolder: tilesetManager.toggleFolder,
    handlePickFile: tilesetManager.handlePickFile,
    handleOpenCreateFolderDialog: tilesetManager.handleOpenCreateFolderDialog,
    handleDeleteFolder: tilesetManager.handleDeleteFolder,
    handleDrop: tilesetManager.handleDrop,
    tilesetDimensions: tilesetManager.tilesetDimensions,
    setTilesetDimensions: tilesetManager.setTilesetDimensions,
    tilesetSelectionStart: tilesetManager.tilesetSelectionStart,
    setTilesetSelectionStart: tilesetManager.setTilesetSelectionStart,
    tilesetSelectionCurrent: tilesetManager.tilesetSelectionCurrent,
    setTilesetSelectionCurrent: tilesetManager.setTilesetSelectionCurrent,
    hoverTile: tilesetManager.hoverTile,
    setHoverTile: tilesetManager.setHoverTile,
  }

  return (
    <EditorContext.Provider value={contextValue}>
      <div className="flex flex-1 overflow-hidden h-full w-full">
        <EditorDockview />
        <EditorDialogs {...dialogs} />
      </div>
    </EditorContext.Provider>
  )
}
