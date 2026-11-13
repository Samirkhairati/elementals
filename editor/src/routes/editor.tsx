import { useState, useEffect, useMemo } from 'react'
import { graphicAssets } from '@/lib/graphicAssets'
import { EntityData, Layer, LayerType, MapData } from '@/types/editor'
import { mapSize, type HistorySnapshot } from '@/lib/history'
import { mapSaveQueue } from '@/lib/saveQueue'

// Hooks
import { useHistory } from '@/hooks/useHistory'
import { snapshot, useEditorClipboard } from '@/store/editorClipboard'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { usePaintTools } from '@/hooks/usePaintTools'
import { useMapAutosave } from '@/hooks/useMapAutosave'
import { useStableCallback } from '@/hooks/useStableCallback'
import { useShallowStable } from '@/hooks/useShallowStable'
import { useTilesetManager } from '@/hooks/editor/useTilesetManager'
import { useMapManager } from '@/hooks/editor/useMapManager'
import { useLayerManager } from '@/hooks/editor/useLayerManager'
import { useEntityManager } from '@/hooks/editor/useEntityManager'
import { useEditorDialogs } from '@/hooks/editor/useEditorDialogs'
import { useGridSettings } from '@/hooks/editor/useGridSettings'
import { useSpriteAssets } from '@/hooks/useSpriteAssets'
import { useDatabase } from '@/hooks/useDatabase'
import { useCommonEvents } from '@/hooks/useCommonEvents'
import { useEntityPlacement } from '@/hooks/editor/useEntityPlacement'
import { exportMap, exportMapToGame } from '@/hooks/useExportMap'
import { applyResize, mapPixelSize, type ResizeEdges } from '@/lib/mapResize'
import { ResizeMapDialog } from '@/components/editor/dialogs/ResizeMapDialog'
import { MapSettingsDialog } from '@/components/editor/dialogs/MapSettingsDialog'
import type { MapSettings } from '@/types/editor'

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
  const tilesetManager = useTilesetManager()

  // Callbacks handed to the managers are referentially stable (they always run the latest
  // closure), so the managers' own callbacks - and therefore the context value - stay stable too.
  // They may reference managers declared further down: they only run in event handlers.
  const handleMapSelected = useStableCallback((initLayers: Layer[], initEntities?: EntityData[], size?: { width: number; height: number }) => {
    layerManager.setLayers(initLayers)
    layerManager.setActiveLayerId(initLayers?.[0]?.id || null)
    entityManager.setEntities(initEntities || [])
    entityManager.setSelectedEntityId(null)
    historyState.resetHistory({ layers: initLayers, entities: initEntities || [], size })
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
      size: mapSize(mapManager.getActiveMap()),
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

  // ── Project assets & game database ───────────────────────────────────────
  const sprites = useSpriteAssets()
  const db = useDatabase()
  const common = useCommonEvents()

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
  const loadData = useStableCallback(async () => {
    const [, loadedMaps] = await Promise.all([tilesetManager.loadTilesets(), mapManager.loadMaps()])
    if (loadedMaps && loadedMaps.length > 0 && !mapManager.getActiveMap()) {
      mapManager.onSelectMap(loadedMaps[0])
    }
  })

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Dialogs Hook ─────────────────────────────────────────────────────────
  const dialogs = useEditorDialogs({
    mapFolders: mapManager.mapFolders,
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
    mapManager.setActiveMap(m => (m ? { ...m, layers: snapshot.layers, entities, ...snapshot.size } : m))
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

    // A picked image on an image layer goes first (undoable, so no confirmation).
    const imageLayerId = layerManager.activeLayerId
    if (layerManager.pickedImageIds.length > 0 && imageLayerId && !entityManager.selectedEntityId) {
      layerManager.deleteImages(imageLayerId, layerManager.pickedImageIds)
      return
    }

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
      const ids = [layerManager.activeLayerId, ...layerManager.selectedLayerIds.filter(id => id !== layerManager.activeLayerId)]
      if (layer && ids.length > 1) {
        dialogs.setConfirmDialog({
          open: true,
          title: 'Delete Layers',
          description: `Are you sure you want to delete these ${ids.length} layers?`,
          action: () => layerManager.handleDeleteLayers(ids),
        })
      } else if (layer) {
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

  // What Ctrl/Cmd+C, +V and +D act on: picked pictures of the active image layer, else the picked entity, else the layers.
  const selectionTarget = (): 'images' | 'entities' | 'layers' | null => {
    if (layerManager.pickedImageIds.length > 0 && layerManager.activeLayerId && !entityManager.selectedEntityId) return 'images'
    if (entityManager.selectedEntityId && (focusedDomain === 'entities' || !focusedDomain)) return 'entities'
    if (layerManager.activeLayerId) return 'layers'
    return null
  }
  const layerWorkingSet = () => (layerManager.activeLayerId ? [layerManager.activeLayerId, ...layerManager.selectedLayerIds.filter(id => id !== layerManager.activeLayerId)] : [])

  const handleCopySelected = useStableCallback(() => {
    const target = selectionTarget()
    if (target === 'images' && layerManager.activeLayerId) layerManager.copyImages(layerManager.activeLayerId, layerManager.pickedImageIds)
    else if (target === 'entities') {
      const entity = entityManager.entities.find(e => e.id === entityManager.selectedEntityId)
      if (entity) useEditorClipboard.getState().set({ kind: 'entities', entities: snapshot([entity]) })
    } else if (target === 'layers') layerManager.copyLayers(layerWorkingSet())
  })

  const handlePasteSelected = useStableCallback(() => {
    const content = useEditorClipboard.getState().content
    if (!content) return
    if (content.kind === 'images') {
      const layer = layerManager.layers.find(l => l.id === layerManager.activeLayerId)
      if (layer?.type === 'image') layerManager.pasteImages(layer.id, null)
    } else if (content.kind === 'entities') entityManager.pasteEntities(content.entities)
    else layerManager.pasteLayers(layerManager.activeLayerId)
  })

  const handlePlaceMultiple = useStableCallback(() => {
    const layer = layerManager.layers.find(l => l.id === layerManager.activeLayerId)
    if (layer?.type === 'image' && !layer.locked && layerManager.selectedImageId) layerManager.placeMultiple(layer.id, layerManager.selectedImageId)
  })

  const handleDuplicateSelected = useStableCallback(() => {
    const target = selectionTarget()
    if (target === 'images' && layerManager.activeLayerId) layerManager.duplicateImages(layerManager.activeLayerId, layerManager.pickedImageIds)
    else if (target === 'entities' && entityManager.selectedEntityId) entityManager.duplicateEntity(entityManager.selectedEntityId)
    else if (target === 'layers') layerManager.duplicateLayers(layerWorkingSet())
  })

  // ── Keyboard Shortcuts ───────────────────────────────────────────────────
  useKeyboardShortcuts({
    handleUndo: boundHandleUndo,
    handleRedo: boundHandleRedo,
    setActiveTool: layerManager.setActiveTool,
    handleDelete: handleDeleteSelected,
    handleCopy: handleCopySelected,
    handlePaste: handlePasteSelected,
    handleDuplicate: handleDuplicateSelected,
    handlePlaceMultiple,
    handleNewLayer: () => mapManager.activeMap && handleCreateLayerOfType('tile'),
    handleNewFolder: () => mapManager.activeMap && handleCreateLayerOfType('folder'),
  })

  // ── Paint Tools Hook ─────────────────────────────────────────────────────
  const paintTools = usePaintTools({
    activeMap: mapManager.activeMap,
    activeLayerId: layerManager.activeLayerId,
    tileSelection: layerManager.tileSelection,
    pinSelection: layerManager.pinSelection,
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
  const handleSelectLayer = useStableCallback((layerId: string | null) => {
    layerManager.setActiveLayerId(layerId)
    entityManager.setSelectedEntityId(null)
    setFocusedDomain('layers')
  })

  const handleSelectLayerExtended = useStableCallback((layerId: string, additive: boolean | 'range' = false) => {
    layerManager.selectLayer(layerId, additive)
    entityManager.setSelectedEntityId(null)
    setFocusedDomain('layers')
  })

  const handleSelectEntity = useStableCallback((entityId: string | null) => {
    entityManager.setSelectedEntityId(entityId)
    if (entityId) {
      setFocusedDomain('entities')
    }
  })

  const handleCreateLayerOfType = useStableCallback((type: LayerType, folderId?: string) => {
    entityManager.setSelectedEntityId(null)
    setFocusedDomain('layers')
    layerManager.handleCreateLayerOfType(type, folderId)
  })

  const handleDuplicateLayer = useStableCallback((id: string) => {
    entityManager.setSelectedEntityId(null)
    setFocusedDomain('layers')
    layerManager.handleDuplicateLayer(id)
  })

  const handleExportMap = useStableCallback((m: MapData) => {
    exportMap(m, tilesetManager.tilesets, mapManager.getActiveMap(), layerManager.getLayers())
  })

  // ── Notices (small, self-dismissing messages) ────────────────────────────
  const [notice, setNotice] = useState<{ kind: 'info' | 'error'; text: string } | null>(null)
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), notice.kind === 'error' ? 9000 : 4000)
    return () => clearTimeout(timer)
  }, [notice])

  /** Right-click > "Export to game": writes game/public/data/maps/<id>.json straight away. */
  const handleExportMapToGame = useStableCallback(async (m: MapData) => {
    const res = await exportMapToGame(m, tilesetManager.tilesets, mapManager.getActiveMap(), layerManager.getLayers())
    setNotice(
      res.ok
        ? {
            kind: 'info',
            text:
              (res.changed ? `Exported "${m.name}" to the game as ${res.id}.json.` : `"${m.name}" was already up to date in the game.`) +
              (res.assetsWritten ? ` Copied ${res.assetsWritten} asset file${res.assetsWritten === 1 ? '' : 's'} to the game.` : '') +
              (res.assetsNote ? ` Assets were not synced (${res.assetsNote}): run npm run assets:sync.` : ''),
          }
        : { kind: 'error', text: `Export to game failed. ${res.error}` }
    )
  })

  // ── Resize map ───────────────────────────────────────────────────────────
  const [resizeTarget, setResizeTarget] = useState<MapData | null>(null)

  const sameMap = (a: MapData | null, b: MapData | null) =>
    !!a && !!b && a.fileName === b.fileName && (a.folderPath || null) === (b.folderPath || null)

  /** Right-click > "Resize...": the map is opened first, so the resize joins the normal undo history. */
  const handleResizeMap = useStableCallback((m: MapData) => {
    const active = mapManager.getActiveMap()
    if (sameMap(active, m)) {
      setResizeTarget({ ...active!, layers: layerManager.getLayers(), entities: entityManager.getEntities() })
      return
    }
    mapManager.onSelectMap(m)
    setResizeTarget(m)
  })

  /** Right-click > "Settings...": the map is opened first, like Resize, and the settings save with it. */
  const [settingsTarget, setSettingsTarget] = useState<MapData | null>(null)
  const handleMapSettings = useStableCallback((m: MapData) => {
    const active = mapManager.getActiveMap()
    if (sameMap(active, m)) {
      setSettingsTarget(active)
      return
    }
    mapManager.onSelectMap(m)
    setSettingsTarget(m)
  })
  const handleSaveMapSettings = useStableCallback((settings: MapSettings) => {
    const active = mapManager.getActiveMap()
    const target = settingsTarget
    setSettingsTarget(null)
    if (!active || !sameMap(active, target)) return
    const { settings: _old, ...rest } = active
    mapManager.setActiveMap(Object.keys(settings).length > 0 ? { ...rest, settings } : rest)
    setNotice({ kind: 'info', text: `Saved the settings of "${active.name}".` })
  })

  const handleConfirmResize = useStableCallback((edges: ResizeEdges) => {
    const active = mapManager.getActiveMap()
    setResizeTarget(null)
    if (!active || !sameMap(active, resizeTarget)) return
    const resized = applyResize(
      { ...active, layers: layerManager.getLayers(), entities: entityManager.getEntities() },
      edges
    )
    layerManager.setLayers(resized.layers)
    entityManager.setEntities(resized.entities ?? [])
    entityManager.setSelectedEntityId(current => (current && resized.entities?.some(e => e.id === current) ? current : null))
    layerManager.setSelectedImageId(null)
    mapManager.setActiveMap(resized)
    commitSnapshot()
    const px = mapPixelSize(resized)
    setNotice({ kind: 'info', text: `Resized "${active.name}" to ${px.width} × ${px.height} px (${resized.width} × ${resized.height} tiles).` })
  })

  // ── Context Value for all panels ─────────────────────────────────────────
  // Kept the same object while every field is unchanged (useShallowStable), so the context only re-propagates to the
  // Dockview panels when something actually changed. There is no dependency list: a new field is just added below.
  // Sprites plus plain pictures ("graphic:<id>"), so image-layer items of either kind draw the same way.
  const canvasAssets = useMemo(() => ({ ...sprites.assets, ...graphicAssets(sprites.graphics, sprites.images) }), [sprites.assets, sprites.graphics, sprites.images])

  const contextValue = useShallowStable<EditorBaseContextValue>({
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
    handleExportMapToGame,
    handleResizeMap,
    handleMapSettings,
    handleMapDrop: mapManager.handleMapDrop,
    onSelectMap: mapManager.onSelectMap,
    onClearActiveMap: handleDockClearActiveMap,
    setConfirmDialog: dialogs.setConfirmDialog,

    // Layers domain
    layers: layerManager.layers,
    activeLayerId: layerManager.activeLayerId,
    setActiveLayerId: handleSelectLayer,
    selectLayer: handleSelectLayerExtended,
    selectedLayerIds: layerManager.selectedLayerIds,
    justCreatedLayer: layerManager.justCreatedLayer,
    pinSelection: layerManager.pinSelection,
    setPinSelection: layerManager.setPinSelection,
    pendingImage: layerManager.pendingImage,
    startImagePlacement: layerManager.startImagePlacement,
    cancelImagePlacement: layerManager.cancelImagePlacement,
    selectedImageId: layerManager.selectedImageId,
    resizingImageId: layerManager.resizingImageId,
    setResizingImageId: layerManager.setResizingImageId,
    setSelectedImageId: layerManager.setSelectedImageId,
    pickedImageIds: layerManager.pickedImageIds,
    selectImage: layerManager.selectImage,
    openImageGroupId: layerManager.openImageGroupId,
    selectImageGroup: layerManager.selectImageGroup,
    groupPickedImages: layerManager.groupPickedImages,
    createImageGroup: layerManager.createImageGroup,
    setImagesGroup: layerManager.setImagesGroup,
    deleteImageGroup: layerManager.deleteImageGroup,
    ungroupImageGroup: layerManager.ungroupImageGroup,
    renameImageGroup: layerManager.renameImageGroup,
    setImageGroupLocked: layerManager.setImageGroupLocked,
    setImageGroupYSort: layerManager.setImageGroupYSort,
    setImagesYSort: layerManager.setImagesYSort,
    moveImageGroupTo: layerManager.moveImageGroupTo,
    moveImages: layerManager.moveImages,
    deleteImages: layerManager.deleteImages,
    duplicateImages: layerManager.duplicateImages,
    placeMultiple: layerManager.placeMultiple,
    copyImages: layerManager.copyImages,
    pasteImages: layerManager.pasteImages,
    addImage: layerManager.addImage,
    updateImage: layerManager.updateImage,
    deleteImage: layerManager.deleteImage,
    duplicateImage: layerManager.duplicateImage,
    reorderImage: layerManager.reorderImage,
    moveImageTo: layerManager.moveImageTo,
    toggleLayerVisibility: layerManager.toggleLayerVisibility,
    toggleLayerLock: layerManager.toggleLayerLock,
    setLayerYSort: layerManager.setLayerYSort,
    handleDeleteLayer: layerManager.handleDeleteLayer,
    handleReorderLayers: layerManager.handleReorderLayers,
    toggleFolderCollapsed: layerManager.toggleFolderCollapsed,
    handleCreateLayer: layerManager.handleCreateLayer,
    handleCreateLayerOfType,
    handleRenameLayer: layerManager.handleRenameLayer,
    handleDuplicateLayer,
    copyLayers: layerManager.copyLayers,
    pasteLayers: layerManager.pasteLayers,
    updateLayers: layerManager.updateLayers,
    setEntitiesIndex: layerManager.setEntitiesIndex,
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
    toggleFolder: tilesetManager.toggleFolder,
    tilesetDimensions: tilesetManager.tilesetDimensions,
    setTilesetDimensions: tilesetManager.setTilesetDimensions,
    tilesetSelectionStart: tilesetManager.tilesetSelectionStart,
    setTilesetSelectionStart: tilesetManager.setTilesetSelectionStart,
    tilesetSelectionCurrent: tilesetManager.tilesetSelectionCurrent,
    setTilesetSelectionCurrent: tilesetManager.setTilesetSelectionCurrent,
    hoverTile: tilesetManager.hoverTile,
    setHoverTile: tilesetManager.setHoverTile,

    // Sprite assets
    spriteAssets: canvasAssets,
    graphicImages: sprites.images,
    spriteList: sprites.list,
    spriteFolders: sprites.folders,
    spriteWarnings: sprites.warnings,
    getSpriteAsset: sprites.getAsset,
    reloadSprites: sprites.reload,
    characters: sprites.characters,
    graphics: sprites.graphics,
    getCharacter: sprites.getCharacter,
    pickSpriteFile: sprites.pickFile,
    importGraphic: sprites.importGraphic,
    saveCharacter: sprites.saveCharacter,
    renameSprite: sprites.rename,
    removeSprite: sprites.remove,
    createSpriteFolder: sprites.createFolder,
    renameSpriteFolder: sprites.renameFolder,
    moveSpriteFolder: sprites.moveFolder,
    deleteSpriteFolder: sprites.deleteFolder,

    // Game database
    database: db.database,
    switches: db.switches,
    variables: db.variables,
    getSwitch: db.getSwitch,
    getVariable: db.getVariable,
    addSwitch: db.addSwitch,
    renameSwitch: db.renameSwitch,
    removeSwitch: db.removeSwitch,
    addVariable: db.addVariable,
    renameVariable: db.renameVariable,
    setVariableInitial: db.setVariableInitial,
    removeVariable: db.removeVariable,
    stages: db.stages,
    getStage: db.getStage,
    addStage: db.addStage,
    renameStage: db.renameStage,
    removeStage: db.removeStage,
    addStageValue: db.addStageValue,
    renameStageValue: db.renameStageValue,
    removeStageValue: db.removeStageValue,
    moveStageValue: db.moveStageValue,
    setStageInitial: db.setStageInitial,
    setDatabaseFolder: db.setFolder,
    reloadDatabase: db.reload,
    commonEvents: common.events,
    addCommonEvent: common.addEvent,
    renameCommonEvent: common.renameEvent,
    setCommonEventGraph: common.setEventGraph,
    removeCommonEvent: common.removeEvent,
  })

  return (
    <EditorProvider value={contextValue}>
      <div className="flex flex-1 overflow-hidden h-full w-full">
        <EditorDockview />
        <EditorDialogs {...dialogs} />
        <ResizeMapDialog
          map={resizeTarget}
          tilesets={tilesetManager.tilesets}
          spriteAssets={canvasAssets}
          onClose={() => setResizeTarget(null)}
          onConfirm={handleConfirmResize}
        />
        <MapSettingsDialog
          map={settingsTarget}
          onClose={() => setSettingsTarget(null)}
          onSave={handleSaveMapSettings}
          onResize={() => {
            const target = settingsTarget
            setSettingsTarget(null)
            if (target) setTimeout(() => handleResizeMap(target), 0)
          }}
        />
        {notice && (
          <div
            role="status"
            className={
              'fixed bottom-4 right-4 z-[60] max-w-sm rounded-md border px-3 py-2 text-xs shadow-lg ' +
              (notice.kind === 'error'
                ? 'border-red-500/50 bg-red-950 text-red-200'
                : 'border-border bg-popover text-popover-foreground')
            }
            onClick={() => setNotice(null)}
          >
            {notice.text}
          </div>
        )}
      </div>
    </EditorProvider>
  )
}
