import { useState, useEffect, useCallback, useRef } from 'react'

// Hooks
import { useHistory } from '@/hooks/useHistory'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { usePaintTools } from '@/hooks/usePaintTools'
import { useTilesetManager } from '@/hooks/editor/useTilesetManager'
import { useMapManager } from '@/hooks/editor/useMapManager'
import { useLayerManager } from '@/hooks/editor/useLayerManager'
import { useEntityManager } from '@/hooks/editor/useEntityManager'
import { useEditorDialogs } from '@/hooks/editor/useEditorDialogs'

// Layout
import { EditorContext } from '@/components/editor/layout/EditorContext'
import { EditorDockview } from '@/components/editor/layout/EditorDockview'
import { EditorDialogs } from '@/components/editor/layout/EditorDialogs'

export function EditorPage() {
  // ── History Hook ─────────────────────────────────────────────────────────
  const historyState = useHistory()

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

  const handleClearActiveMapRef = useRef<() => void>(() => {})

  // ── Map Manager ──────────────────────────────────────────────────────────
  const mapManager = useMapManager({
    tilesets: tilesetManager.tilesets,
    layers: [], // updated dynamically in exportMap
    onMapSelected: (initLayers, initEntities) => {
      layerManager.setLayers(initLayers)
      layerManager.setActiveLayerId(initLayers?.[0]?.id || null)
      entityManager.setEntities(initEntities || [])
      entityManager.setSelectedEntityId(null)
      historyState.setHistory([{ layers: JSON.parse(JSON.stringify(initLayers)) }])
      historyState.setHistoryIndex(0)
    },
    onClearActiveMap: () => handleClearActiveMapRef.current(),
    onOpenConfirmDialog: (config) => {
      dialogs.setConfirmDialog({ open: true, ...config })
    },
  })

  // ── Layer Manager ────────────────────────────────────────────────────────
  const layerManager = useLayerManager({
    activeMap: mapManager.activeMap,
    setActiveMap: mapManager.setActiveMap,
    onCommitHistory: (layers) => historyState.commitHistory(layers),
  })

  // ── Entity Manager ───────────────────────────────────────────────────────
  const entityManager = useEntityManager({
    activeMap: mapManager.activeMap,
    setActiveMap: mapManager.setActiveMap,
  })

  const handleClearActiveMap = useCallback(() => {
    mapManager.setActiveMap(null)
    layerManager.setLayers([])
    layerManager.setActiveLayerId(null)
    entityManager.setEntities([])
    entityManager.setSelectedEntityId(null)
    historyState.setHistory([])
    historyState.setHistoryIndex(-1)
  }, [mapManager.setActiveMap, layerManager.setLayers, layerManager.setActiveLayerId, entityManager.setEntities, entityManager.setSelectedEntityId, historyState])

  useEffect(() => {
    handleClearActiveMapRef.current = handleClearActiveMap
  }, [handleClearActiveMap])

  // ── Data Loading Coordinator ─────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const [, loadedMaps] = await Promise.all([tilesetManager.loadTilesets(), mapManager.loadMaps()])
    if (loadedMaps && loadedMaps.length > 0 && !mapManager.activeMap) {
      mapManager.onSelectMap(loadedMaps[0])
    }
  }, [tilesetManager.loadTilesets, mapManager.loadMaps, mapManager.activeMap, mapManager.onSelectMap])

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
      mapManager.onSelectMap(map)
    },
    onRenameLayer: layerManager.handleRenameLayer,
  })

  // ── Undo / Redo Bounding ─────────────────────────────────────────────────
  const boundHandleUndo = useCallback(() => {
    if (historyState.historyIndex > 0) {
      historyState.handleUndo(
        layerManager.setLayers,
        mapManager.activeMap,
        mapManager.setActiveMap
      )
    } else if (mapManager.deletedMapsHistory.length > 0) {
      mapManager.undoDeleteMap()
    }
  }, [historyState, layerManager.setLayers, mapManager])

  const boundHandleRedo = useCallback(() => {
    if (historyState.historyIndex < historyState.history.length - 1) {
      historyState.handleRedo(
        layerManager.setLayers,
        mapManager.activeMap,
        mapManager.setActiveMap
      )
    } else if (mapManager.restoredMapsHistory.length > 0) {
      mapManager.redoDeleteMap()
    }
  }, [historyState, layerManager.setLayers, mapManager])

  const handleCommit = useCallback(() => {
    if (layerManager.layers.length > 0) {
      historyState.commitHistory(layerManager.layers)
    }
  }, [layerManager.layers, historyState])

  // ── Focus Domain Tracking ───────────────────────────────────────────────
  const [focusedDomain, setFocusedDomain] = useState<'maps' | 'layers' | 'entities' | 'tilesets' | null>(null)

  const handleDeleteSelected = useCallback(() => {
    const isEntitiesDomain = focusedDomain === 'entities' || (!focusedDomain && entityManager.selectedEntityId)
    const isLayersDomain = focusedDomain === 'layers' || (!focusedDomain && layerManager.activeLayerId)
    const isMapsDomain = focusedDomain === 'maps' || (!focusedDomain && mapManager.activeMap)

    if (isEntitiesDomain && entityManager.selectedEntityId) {
      const entity = entityManager.entities.find(e => e.id === entityManager.selectedEntityId)
      if (entity) {
        dialogs.setConfirmDialog({
          open: true,
          title: 'Delete Entity',
          description: `Are you sure you want to delete entity "${entity.name}"?`,
          action: () => entityManager.deleteEntity(entity.id),
        })
      }
    } else if (isLayersDomain && layerManager.activeLayerId) {
      const layer = layerManager.layers.find(l => l.id === layerManager.activeLayerId)
      if (layer) {
        dialogs.setConfirmDialog({
          open: true,
          title: 'Delete Layer',
          description: `Are you sure you want to delete layer "${layer.name}"?`,
          action: () => layerManager.handleDeleteLayer(layer.id),
        })
      }
    } else if (isMapsDomain && mapManager.activeMap) {
      mapManager.handleDeleteMap(mapManager.activeMap.folderPath, mapManager.activeMap.fileName)
    }
  }, [
    focusedDomain,
    entityManager.selectedEntityId,
    entityManager.entities,
    entityManager.deleteEntity,
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
      entityManager.selectedEntityId,
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
    onClearActiveMap: handleClearActiveMap,
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

    // Entities domain
    entities: entityManager.entities,
    selectedEntityId: entityManager.selectedEntityId,
    setSelectedEntityId: entityManager.setSelectedEntityId,
    handleCreateEntity: entityManager.createEntity,
    handleDuplicateEntity: entityManager.duplicateEntity,
    handleDeleteEntity: entityManager.deleteEntity,
    handleRenameEntity: entityManager.renameEntity,
    handleMoveEntity: entityManager.moveEntity,
    handleReorderEntities: entityManager.reorderEntities,
    handleAddComponent: entityManager.addComponent,
    handleRemoveComponent: entityManager.removeComponent,
    handleUpdateComponentProp: entityManager.updateComponentProp,

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
    handleCommit,

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
