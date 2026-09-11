import { useState, useEffect, useCallback } from 'react'

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
  // ── History Hook ─────────────────────────────────────────────────────────
  const [layersState, setLayersState] = useState<any[]>([])
  const historyState = useHistory(setLayersState)

  // ── Layer Manager ────────────────────────────────────────────────────────
  const layerManager = useLayerManager({
    activeMap: null, // connected dynamically in handlers
    setActiveMap: () => {},
    onCommitHistory: (layers) => historyState.commitHistory(layers),
  })

  // Keep historyState in sync with layerManager.setLayers
  useEffect(() => {
    if (layersState.length > 0) {
      layerManager.setLayers(layersState)
    }
  }, [layersState])

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
  const boundHandleUndo = useCallback(() => {
    if (historyState.historyIndex > 0) {
      historyState.handleUndo(
        layerManager.layers,
        layerManager.setLayers,
        mapManager.activeMap,
        mapManager.setActiveMap
      )
    } else if (mapManager.deletedMapsHistory.length > 0) {
      mapManager.undoDeleteMap()
    }
  }, [historyState, layerManager.layers, layerManager.setLayers, mapManager])

  const boundHandleRedo = useCallback(() => {
    if (historyState.historyIndex < historyState.history.length - 1) {
      historyState.handleRedo(
        layerManager.layers,
        layerManager.setLayers,
        mapManager.activeMap,
        mapManager.setActiveMap
      )
    } else if (mapManager.restoredMapsHistory.length > 0) {
      mapManager.redoDeleteMap()
    }
  }, [historyState, layerManager.layers, layerManager.setLayers, mapManager])

  // ── Focus Domain Tracking ───────────────────────────────────────────────
  const [focusedDomain, setFocusedDomain] = useState<'maps' | 'layers' | 'tilesets' | null>(null)

  const handleDeleteSelected = useCallback(() => {
    if (focusedDomain === 'layers' && layerManager.activeLayerId) {
      const layer = layerManager.layers.find(l => l.id === layerManager.activeLayerId)
      if (layer) {
        dialogs.setConfirmDialog({
          open: true,
          title: 'Delete Layer',
          description: `Are you sure you want to delete layer "${layer.name}"?`,
          action: () => layerManager.handleDeleteLayer(layer.id),
        })
      }
    } else if (focusedDomain === 'maps' && mapManager.activeMap) {
      mapManager.handleDeleteMap(mapManager.activeMap.folderPath, mapManager.activeMap.fileName)
    } else if (layerManager.activeLayerId) {
      const layer = layerManager.layers.find(l => l.id === layerManager.activeLayerId)
      if (layer) {
        dialogs.setConfirmDialog({
          open: true,
          title: 'Delete Layer',
          description: `Are you sure you want to delete layer "${layer.name}"?`,
          action: () => layerManager.handleDeleteLayer(layer.id),
        })
      }
    } else if (mapManager.activeMap) {
      mapManager.handleDeleteMap(mapManager.activeMap.folderPath, mapManager.activeMap.fileName)
    }
  }, [
    focusedDomain,
    layerManager.activeLayerId,
    layerManager.layers,
    layerManager.handleDeleteLayer,
    mapManager.activeMap,
    mapManager.handleDeleteMap,
    dialogs.setConfirmDialog,
  ])

  // ── Keyboard Shortcuts ───────────────────────────────────────────────────
  useKeyboardShortcuts({
    handleUndo: boundHandleUndo,
    handleRedo: boundHandleRedo,
    setActiveTool: layerManager.setActiveTool,
    handleDelete: handleDeleteSelected,
    deps: [
      historyState.history,
      historyState.historyIndex,
      mapManager.activeMap,
      layerManager.activeLayerId,
      focusedDomain,
      handleDeleteSelected,
    ],
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
    focusedDomain,
    setFocusedDomain,
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
    setConfirmDialog: dialogs.setConfirmDialog,

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
