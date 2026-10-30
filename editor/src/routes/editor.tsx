import { useState, useEffect, useCallback, useMemo } from 'react'
import { EntityData, Layer, LayerType, MapData } from '@/types/editor'
import type { HistorySnapshot } from '@/lib/history'
import { mapSaveQueue } from '@/lib/saveQueue'

// Hooks
import { useHistory } from '@/hooks/useHistory'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { usePaintTools } from '@/hooks/usePaintTools'
import { useMapAutosave } from '@/hooks/useMapAutosave'
import { useStableCallback } from '@/hooks/useStableCallback'
import { useTilesetManager } from '@/hooks/editor/useTilesetManager'
import { useMapManager } from '@/hooks/editor/useMapManager'
import { useLayerManager } from '@/hooks/editor/useLayerManager'
import { useEntityManager } from '@/hooks/editor/useEntityManager'
import { useEditorDialogs } from '@/hooks/editor/useEditorDialogs'
import { useGridSettings } from '@/hooks/editor/useGridSettings'
import { useEntityPlacement } from '@/hooks/editor/useEntityPlacement'
import { exportMap } from '@/hooks/useExportMap'

// Layout
import {
  EditorProvider,
  type EditorBaseContextValue,
  type FocusedDomain,
} from '@/components/editor/layout/EditorContext'
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

  // Callbacks handed to the managers are referentially stable (they always run the latest
  // closure), so the managers' own callbacks - and therefore the context value - stay stable too.
  // They may reference managers declared further down: they only run in event handlers.
  const handleMapSelected = useStableCallback((initLayers: Layer[], initEntities?: EntityData[]) => {
    layerManager.setLayers(initLayers)
    layerManager.setActiveLayerId(initLayers?.[0]?.id || null)
    entityManager.setEntities(initEntities || [])
    entityManager.setSelectedEntityId(null)
    historyState.resetHistory({ layers: initLayers, entities: initEntities || [] })
  })

  /** Reset every piece of per-map editor state (used once the active map is gone). */
  const clearEditorState = useStableCallback(() => {
    mapManager.setActiveMap(null)
    layerManager.setLayers([])
    layerManager.setActiveLayerId(null)
    entityManager.setEntities([])
    entityManager.setSelectedEntityId(null)
    historyState.resetHistory(null)
  })

  // ── Map Manager ──────────────────────────────────────────────────────────
  const mapManager = useMapManager({
    onMapSelected: handleMapSelected,
    // Map deleted on disk: any pending autosave for it is cancelled by useMapAutosave.
    onClearActiveMap: clearEditorState,
    onOpenConfirmDialog: (config) => {
      dialogs.setConfirmDialog({ open: true, ...config })
    },
  })

  // The dock closed the last map tab: the map still exists, so persist pending edits first.
  const handleDockClearActiveMap = useStableCallback(() => {
    void mapSaveQueue.flushAll()
    clearEditorState()
  })

  // ── Single autosave pipeline ─────────────────────────────────────────────
  useMapAutosave(mapManager.activeMap)

  // One combined (layers + entities) history step, read from the managers' live refs.
  const commitSnapshot = useStableCallback(() => {
    historyState.commitHistory({
      layers: layerManager.getLayers(),
      entities: entityManager.getEntities(),
    })
  })

  // ── Layer Manager ────────────────────────────────────────────────────────
  const layerManager = useLayerManager({
    setActiveMap: mapManager.setActiveMap,
    onCommitHistory: commitSnapshot,
  })

  // ── Entity Manager ───────────────────────────────────────────────────────
  const entityManager = useEntityManager({
    activeMap: mapManager.activeMap,
    setActiveMap: mapManager.setActiveMap,
    onCommitHistory: commitSnapshot,
  })

  // ── Grid & Snapping Settings ──────────────────────────────────────────────
  const gridSettings = useGridSettings()

  // ── Entity Placement Mode ─────────────────────────────────────────────────
  const entityPlacement = useEntityPlacement()

  const handleCommitPlacement = useStableCallback((x: number, y: number) => {
    if (entityPlacement.pendingPlacement) {
      entityManager.createEntity(
        entityPlacement.pendingPlacement.name,
        x,
        y,
        entityPlacement.pendingPlacement.components
      )
      entityPlacement.cancelPlacement()
    }
  })

  // ── Data Loading Coordinator ─────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const [, loadedMaps] = await Promise.all([tilesetManager.loadTilesets(), mapManager.loadMaps()])
    if (loadedMaps && loadedMaps.length > 0 && !mapManager.getActiveMap()) {
      mapManager.onSelectMap(loadedMaps[0])
    }
  }, [tilesetManager.loadTilesets, mapManager.loadMaps, mapManager.getActiveMap, mapManager.onSelectMap])

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

  // ── Undo / Redo ──────────────────────────────────────────────────────────
  /** Restore a history snapshot: layers + entities (and the mirrored active map) in one go. */
  const applySnapshot = useStableCallback((snapshot: HistorySnapshot) => {
    // Entity folders are not part of history; drop references to folders that no longer exist.
    const folderIds = new Set(entityManager.getFolders().map(f => f.id))
    const entities = snapshot.entities.map(e => (e.folder && !folderIds.has(e.folder) ? { ...e, folder: null } : e))

    layerManager.setLayers(snapshot.layers)
    entityManager.setEntities(entities)
    mapManager.setActiveMap(m => (m ? { ...m, layers: snapshot.layers, entities } : m))
    layerManager.setActiveLayerId(current =>
      current && snapshot.layers.some(l => l.id === current) ? current : snapshot.layers[0]?.id ?? null
    )
    entityManager.setSelectedEntityId(current => (current && entities.some(e => e.id === current) ? current : null))
  })

  const boundHandleUndo = useStableCallback(() => {
    if (!historyState.handleUndo(applySnapshot) && mapManager.deletedMapsHistory.length > 0) {
      mapManager.undoDeleteMap()
    }
  })

  const boundHandleRedo = useStableCallback(() => {
    if (!historyState.handleRedo(applySnapshot) && mapManager.restoredMapsHistory.length > 0) {
      mapManager.redoDeleteMap()
    }
  })

  /** Called when a paint stroke ends. */
  const handleCommit = commitSnapshot

  // ── Focus Domain Tracking ───────────────────────────────────────────────
  const [focusedDomain, setFocusedDomain] = useState<FocusedDomain>(null)

  const handleDeleteSelected = useStableCallback(() => {
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
  })

  // ── Keyboard Shortcuts ───────────────────────────────────────────────────
  useKeyboardShortcuts({
    handleUndo: boundHandleUndo,
    handleRedo: boundHandleRedo,
    setActiveTool: layerManager.setActiveTool,
    handleDelete: handleDeleteSelected,
    deps: [boundHandleUndo, boundHandleRedo, handleDeleteSelected, layerManager.setActiveTool],
  })

  // ── Paint Tools Hook ─────────────────────────────────────────────────────
  const paintTools = usePaintTools({
    activeMap: mapManager.activeMap,
    activeLayerId: layerManager.activeLayerId,
    tileSelection: layerManager.tileSelection,
    activeTool: layerManager.activeTool,
    paintMode: layerManager.paintMode,
    paintStartPos: layerManager.paintStartPos,
    getLayers: layerManager.getLayers,
    setLayers: layerManager.setLayers,
    commitHistory: commitSnapshot,
    setDebugInfo: layerManager.setDebugInfo,
    setActiveMap: mapManager.setActiveMap,
  })

  // ── Unified Layer & Entity Selection Handlers ─────────────────────────────
  const handleSelectLayer = useCallback(
    (layerId: string | null) => {
      layerManager.setActiveLayerId(layerId)
      entityManager.setSelectedEntityId(null)
      setFocusedDomain('layers')
    },
    [layerManager.setActiveLayerId, entityManager.setSelectedEntityId, setFocusedDomain]
  )

  const handleSelectEntity = useCallback(
    (entityId: string | null) => {
      entityManager.setSelectedEntityId(entityId)
      if (entityId) {
        setFocusedDomain('entities')
      }
    },
    [entityManager.setSelectedEntityId, setFocusedDomain]
  )

  const handleCreateLayerOfType = useCallback(
    (type: LayerType) => {
      entityManager.setSelectedEntityId(null)
      setFocusedDomain('layers')
      layerManager.handleCreateLayerOfType(type)
    },
    [entityManager.setSelectedEntityId, setFocusedDomain, layerManager.handleCreateLayerOfType]
  )

  const handleDuplicateLayer = useCallback(
    (id: string) => {
      entityManager.setSelectedEntityId(null)
      setFocusedDomain('layers')
      layerManager.handleDuplicateLayer(id)
    },
    [entityManager.setSelectedEntityId, setFocusedDomain, layerManager.handleDuplicateLayer]
  )

  const handleExportMap = useStableCallback((m: MapData) => {
    exportMap(m, tilesetManager.tilesets, mapManager.getActiveMap(), layerManager.getLayers())
  })

  // ── Context Value for all panels ─────────────────────────────────────────
  // Memoized so context only re-propagates to all Dockview panels when
  // something meaningful actually changes — not on every incidental re-render.
  const contextValue = useMemo<EditorBaseContextValue>(() => ({
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
    handleExportMap,
    handleMapDrop: mapManager.handleMapDrop,
    onSelectMap: mapManager.onSelectMap,
    onClearActiveMap: handleDockClearActiveMap,
    setConfirmDialog: dialogs.setConfirmDialog,

    // Layers domain
    layers: layerManager.layers,
    activeLayerId: layerManager.activeLayerId,
    setActiveLayerId: handleSelectLayer,
    toggleLayerVisibility: layerManager.toggleLayerVisibility,
    toggleLayerLock: layerManager.toggleLayerLock,
    handleDeleteLayer: layerManager.handleDeleteLayer,
    handleReorderLayers: layerManager.handleReorderLayers,
    handleCreateLayer: layerManager.handleCreateLayer,
    handleCreateLayerOfType,
    handleRenameLayer: layerManager.handleRenameLayer,
    handleDuplicateLayer,
    updateLayers: layerManager.updateLayers,
    activeLayerType: layerManager.activeLayerType,

    // Entities domain
    entities: entityManager.entities,
    selectedEntityId: entityManager.selectedEntityId,
    setSelectedEntityId: handleSelectEntity,
    showEntities: entityManager.showEntities,
    setShowEntities: entityManager.setShowEntities,
    toggleShowEntities: entityManager.toggleShowEntities,
    entityFolders: entityManager.entityFolders,
    createEntityFolder: entityManager.createEntityFolder,
    renameEntityFolder: entityManager.renameEntityFolder,
    deleteEntityFolder: entityManager.deleteEntityFolder,
    toggleEntityFolderVisibility: entityManager.toggleEntityFolderVisibility,
    toggleEntityFolderExpanded: entityManager.toggleEntityFolderExpanded,
    toggleEntityVisibility: entityManager.toggleEntityVisibility,
    moveEntityToFolder: entityManager.moveEntityToFolder,
    handleCreateEntity: entityManager.createEntity,
    handleDuplicateEntity: entityManager.duplicateEntity,
    handleDeleteEntity: entityManager.deleteEntity,
    handleRenameEntity: entityManager.renameEntity,
    handleMoveEntity: entityManager.moveEntity,
    handleReorderEntities: entityManager.reorderEntities,
    handleAddComponent: entityManager.addComponent,
    handleRemoveComponent: entityManager.removeComponent,
    handleUpdateComponentProp: entityManager.updateComponentProp,
    handleUpdateComponentProps: entityManager.updateComponentProps,

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

    // Grid & Snapping
    showGrid: gridSettings.showGrid,
    setShowGrid: gridSettings.setShowGrid,
    toggleShowGrid: gridSettings.toggleShowGrid,
    snapToGrid: gridSettings.snapToGrid,
    setSnapToGrid: gridSettings.setSnapToGrid,
    toggleSnapToGrid: gridSettings.toggleSnapToGrid,
    snapEntityPos: gridSettings.snapEntityPos,
    snapCoord: gridSettings.snapCoord,
    snapDimension: gridSettings.snapDimension,

    // Placement Mode
    pendingPlacement: entityPlacement.pendingPlacement,
    startPlacement: entityPlacement.startPlacement,
    cancelPlacement: entityPlacement.cancelPlacement,
    commitPlacement: handleCommitPlacement,

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
  }), [
    focusedDomain, setFocusedDomain,
    gridSettings.showGrid, gridSettings.setShowGrid, gridSettings.toggleShowGrid,
    gridSettings.snapToGrid, gridSettings.setSnapToGrid, gridSettings.toggleSnapToGrid,
    gridSettings.snapEntityPos, gridSettings.snapCoord, gridSettings.snapDimension,
    entityPlacement.pendingPlacement, entityPlacement.startPlacement, entityPlacement.cancelPlacement,
    handleCommitPlacement,
    // Maps
    mapManager.maps, mapManager.mapFolders, mapManager.activeMap,
    mapManager.expandedMapFolders, mapManager.toggleMapFolder,
    mapManager.handleDeleteMapFolder, mapManager.handleDeleteMap,
    handleExportMap, mapManager.handleMapDrop, mapManager.onSelectMap,
    handleDockClearActiveMap,
    dialogs.setCreateMapData, dialogs.setCreateMapDialog,
    dialogs.setCreateMapFolderName, dialogs.setCreateMapFolderDialog,
    dialogs.setRenameInput, dialogs.setRenameDialog, dialogs.setConfirmDialog,
    // Layers
    layerManager.layers, layerManager.activeLayerId, layerManager.activeLayerType,
    handleSelectLayer, layerManager.toggleLayerVisibility,
    layerManager.toggleLayerLock, layerManager.handleDeleteLayer,
    layerManager.handleReorderLayers, layerManager.handleCreateLayer,
    handleCreateLayerOfType, layerManager.handleRenameLayer,
    handleDuplicateLayer, layerManager.updateLayers,
    layerManager.activeTool, layerManager.paintMode, layerManager.setActiveTool,
    layerManager.setPaintMode, layerManager.tileSelection, layerManager.setTileSelection,
    layerManager.isPainting, layerManager.setIsPainting,
    layerManager.paintStartPos, layerManager.setPaintStartPos, layerManager.debugInfo,
    // Entities
    entityManager.entities, entityManager.selectedEntityId, handleSelectEntity,
    entityManager.showEntities, entityManager.setShowEntities, entityManager.toggleShowEntities,
    entityManager.entityFolders, entityManager.createEntityFolder, entityManager.renameEntityFolder,
    entityManager.deleteEntityFolder, entityManager.toggleEntityFolderVisibility,
    entityManager.toggleEntityFolderExpanded, entityManager.toggleEntityVisibility,
    entityManager.moveEntityToFolder,
    entityManager.createEntity, entityManager.duplicateEntity, entityManager.deleteEntity,
    entityManager.renameEntity, entityManager.moveEntity, entityManager.reorderEntities,
    entityManager.addComponent, entityManager.removeComponent, entityManager.updateComponentProp,
    entityManager.updateComponentProps,
    // History
    historyState.historyIndex, historyState.history.length,
    boundHandleUndo, boundHandleRedo,
    // Paint tools
    paintTools.handlePaint, paintTools.handlePaintBucket, paintTools.handleRectangleFill,
    handleCommit,
    // Tilesets
    tilesetManager.tilesets, tilesetManager.folders, tilesetManager.activeTileset,
    tilesetManager.setActiveTileset, tilesetManager.expandedFolders,
    tilesetManager.selectedFolder, tilesetManager.setSelectedFolder,
    tilesetManager.toggleFolder, tilesetManager.handlePickFile,
    tilesetManager.handleOpenCreateFolderDialog, tilesetManager.handleDeleteFolder,
    tilesetManager.handleDrop, tilesetManager.tilesetDimensions,
    tilesetManager.setTilesetDimensions, tilesetManager.tilesetSelectionStart,
    tilesetManager.setTilesetSelectionStart, tilesetManager.tilesetSelectionCurrent,
    tilesetManager.setTilesetSelectionCurrent, tilesetManager.hoverTile,
    tilesetManager.setHoverTile,
  ])

  return (
    <EditorProvider value={contextValue}>
      <div className="flex flex-1 overflow-hidden h-full w-full">
        <EditorDockview />
        <EditorDialogs {...dialogs} />
      </div>
    </EditorProvider>
  )
}
