import { useState, useEffect, useMemo } from 'react'
import { graphicAssets } from '@/lib/graphicAssets'
import type { MapData } from '@/types/editor'
import { mapSize, type HistorySnapshot } from '@/lib/history'
import { mapSaveQueue } from '@/lib/saveQueue'

// Hooks
import { useHistory } from '@/hooks/useHistory'
import { useEditorClipboard } from '@/store/editorClipboard'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { usePaintTools } from '@/hooks/usePaintTools'
import { useMapAutosave } from '@/hooks/useMapAutosave'
import { useStableCallback } from '@/hooks/useStableCallback'
import { useShallowStable } from '@/hooks/useShallowStable'
import { useTilesetManager } from '@/hooks/editor/useTilesetManager'
import { useMapManager } from '@/hooks/editor/useMapManager'
import { useSceneTree } from '@/hooks/editor/useSceneTree'
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
import type { LookSet } from '../../../shared/look/types'
import type { LookSubjectRef } from '@/lib/look/lookView'
import { setMapLook, setNodeLook } from '@/lib/look/lookSubjects'
import { carryView, countWithin, topLevelIds, type NewNodeType } from '@/lib/sceneOps'
import { sceneIndex, pictureLocked } from '@/lib/sceneIndex'
import { NO_SELECTION, selectNode as selectNodeOf, type SelectMode } from '@/lib/sceneSelection'

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
  const handleMapSelected = useStableCallback((map: MapData) => {
    // Opening a map picks its topmost layer, like it always did.
    const idx = sceneIndex(map.nodes)
    const first = idx.layersTopFirst[0]
    tree.setSelection(first ? selectNodeOf(NO_SELECTION, idx, first.id) : NO_SELECTION)
    historyState.resetHistory({ nodes: map.nodes, size: { width: map.width, height: map.height }, look: map.look ?? null })
  })

  /** Reset every piece of per-map editor state (used once the active map is gone). */
  const clearEditorState = useStableCallback(() => {
    mapManager.setActiveMap(null)
    tree.setSelection(NO_SELECTION)
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

  // One history step of the map's scene tree (+ its size and look), read from the open map.
  const commitSnapshot = useStableCallback(() => {
    const map = mapManager.getActiveMap()
    historyState.commitHistory({
      nodes: map?.nodes ?? [],
      size: mapSize(map),
      look: map?.look ?? null,
    })
  })

  // ── Scene tree, layers and entities ──────────────────────────────────────
  // The tree is the open map's `nodes`; the managers are thin wrappers around it.
  const tree = useSceneTree({
    activeMap: mapManager.activeMap,
    getActiveMap: mapManager.getActiveMap,
    setActiveMap: mapManager.setActiveMap,
    onCommitHistory: commitSnapshot,
  })
  const layerManager = useLayerManager(tree)
  const entityManager = useEntityManager(tree)

  /**
   * Replaces the look of the map, a layer or a picture. While a slider is dragged `commit` is false (the canvas
   * follows, no undo step); the release commits one step.
   */
  const setLook = useStableCallback((ref: LookSubjectRef, set: LookSet | undefined, commit: boolean = true) => {
    if (ref.kind === 'map') {
      mapManager.setActiveMap(m => (m ? setMapLook(m, set) : m))
    } else {
      tree.commitView(prev => setNodeLook(prev, ref, set))
    }
    if (commit) commitSnapshot()
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
    onRenameLayer: layerManager.renameNode,
  })

  // ── Undo / Redo ──────────────────────────────────────────────────────────
  /** Restore a history snapshot: the scene tree, the map's size and look (selected ids that are gone are dropped). */
  const applySnapshot = useStableCallback((snapshot: HistorySnapshot) => {
    mapManager.setActiveMap(m => {
      if (!m) return m
      const next = { ...m, nodes: carryView(m.nodes, snapshot.nodes), ...snapshot.size }
      if (snapshot.look === undefined) return next
      const { look: _old, ...rest } = next
      return snapshot.look ? { ...rest, look: snapshot.look } : rest
    })
    tree.pruneToTree(true)
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

  /** Deletes nodes: pictures and collision items at once (undo brings them back), anything else after asking. */
  const requestDeleteNodes = useStableCallback((ids: readonly string[]) => {
    const nodes = tree.getNodes()
    const index = sceneIndex(nodes)
    const tops = topLevelIds(nodes, ids)
    if (tops.length === 0) return
    const kinds = tops.map(id => index.byId.get(id)?.node.type)
    if (kinds.every(k => k === 'picture' || k === 'collisionTiles' || k === 'collisionShape')) {
      layerManager.deleteNodes(tops)
      return
    }
    const total = countWithin(nodes, tops)
    const only = tops.length === 1 ? index.byId.get(tops[0])?.node : undefined
    const noun = only?.type === 'entity' ? 'entity' : only?.type === 'group' ? 'group' : 'layer'
    const inside = total > tops.length ? ` and ${only ? `the ${total - 1} node${total === 2 ? '' : 's'} inside it` : `what is inside ${tops.length === 1 ? 'it' : 'them'} (${total} in all)`}` : ''
    setTimeout(() => {
      dialogs.setConfirmDialog({
        open: true,
        title: only ? `Delete ${noun === 'entity' ? 'Entity' : noun === 'group' ? 'Group' : 'Layer'}` : 'Delete Nodes',
        description: only ? `Are you sure you want to delete ${noun} "${only.name}"${inside}?` : `Are you sure you want to delete these ${tops.length} nodes${inside}?`,
        action: () => layerManager.deleteNodes(tops),
      })
    }, 0)
  })

  const handleDeleteSelected = useStableCallback(() => {
    const ids = tree.view.ids
    if (focusedDomain === 'maps' || (ids.length === 0 && !focusedDomain && mapManager.activeMap)) {
      if (mapManager.activeMap) mapManager.handleDeleteMap(mapManager.activeMap.folderPath, mapManager.activeMap.fileName)
      return
    }
    if (ids.length > 0) requestDeleteNodes(ids)
  })

  // What Ctrl/Cmd+C, +V and +D act on: the selected nodes of the scene tree (pictures, entities, layers, groups...).
  const handleCopySelected = useStableCallback(() => {
    if (tree.view.ids.length > 0) layerManager.copyNodes(tree.view.ids)
  })

  const handlePasteSelected = useStableCallback(() => {
    if (useEditorClipboard.getState().content) layerManager.pasteNodes(tree.view.primaryId)
  })

  const handlePlaceMultiple = useStableCallback(() => {
    const { selectedImageId } = tree.view
    if (selectedImageId && !pictureLocked(tree.getIndex(), selectedImageId)) layerManager.placeMultiple('', selectedImageId)
  })

  const handleDuplicateSelected = useStableCallback(() => {
    if (tree.view.ids.length > 0) layerManager.duplicateNodes(tree.view.ids)
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
    handleNewLayer: () => mapManager.activeMap && handleCreateNode('tile'),
    handleNewFolder: () => mapManager.activeMap && handleCreateNode('group'),
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
    getIndex: tree.getIndex,
    commit: tree.commit,
    commitView: tree.commitView,
    setDebugInfo: layerManager.setDebugInfo,
  })

  // ── Selection handlers (they also move the focus to the Scene panel) ──────
  const handleSelectLayer = useStableCallback((layerId: string | null) => {
    layerManager.setActiveLayerId(layerId)
    setFocusedDomain('layers')
  })

  const handleSelectNode = useStableCallback((id: string, mode: SelectMode = 'replace') => {
    tree.select(id, mode)
    setFocusedDomain('layers')
  })

  const handleSelectEntity = useStableCallback((entityId: string | null) => {
    entityManager.setSelectedEntityId(entityId)
    if (entityId) {
      setFocusedDomain('entities')
    }
  })

  const handleCreateNode = useStableCallback((type: NewNodeType, anchorId?: string | null) => {
    setFocusedDomain('layers')
    layerManager.createNode(type, anchorId)
  })

  const handleExportMap = useStableCallback((m: MapData) => {
    exportMap(m, tilesetManager.tilesets, mapManager.getActiveMap())
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
    const res = await exportMapToGame(m, tilesetManager.tilesets, mapManager.getActiveMap())
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
      setResizeTarget(active)
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
    const resized = applyResize(active, edges)
    mapManager.setActiveMap(resized)
    // Nothing placed is ever removed, so the selection stays; positions moved under it.
    tree.pruneToTree()
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
    setLook,
    handleMapDrop: mapManager.handleMapDrop,
    onSelectMap: mapManager.onSelectMap,
    onClearActiveMap: handleDockClearActiveMap,
    setConfirmDialog: dialogs.setConfirmDialog,

    // Scene tree: selection and node operations
    selectionView: tree.view,
    activeLayerId: layerManager.activeLayerId,
    setActiveLayerId: handleSelectLayer,
    selectNode: handleSelectNode,
    clearSelection: tree.clearSelection,
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
    pickedImageIds: layerManager.pickedImageIds,
    openImageGroupId: layerManager.openImageGroupId,
    selectImage: layerManager.selectImage,
    moveImages: layerManager.moveImages,
    placeMultiple: layerManager.placeMultiple,
    addImage: layerManager.addImage,
    updateImage: layerManager.updateImage,
    reorderImage: layerManager.reorderImage,
    setNodesYSort: layerManager.setNodesYSort,
    createNode: handleCreateNode,
    renameNode: layerManager.renameNode,
    editNode: layerManager.editNode,
    addCollisionTiles: layerManager.addCollisionTiles,
    setCollisionShapes: layerManager.setCollisionShapes,
    toggleNodeVisibility: layerManager.toggleNodeVisibility,
    toggleNodeLock: layerManager.toggleNodeLock,
    setNodeYSort: layerManager.setNodeYSort,
    setPickAsOne: layerManager.setPickAsOne,
    toggleCollapsed: layerManager.toggleCollapsed,
    deleteNodes: layerManager.deleteNodes,
    requestDeleteNodes,
    copyNodes: layerManager.copyNodes,
    pasteNodes: layerManager.pasteNodes,
    duplicateNodes: layerManager.duplicateNodes,
    groupNodes: layerManager.groupNodes,
    ungroupNode: layerManager.ungroupNode,
    moveNodes: layerManager.moveNodes,
    activeLayerType: layerManager.activeLayerType,

    // Entities domain
    entities: entityManager.entities,
    selectedEntityId: entityManager.selectedEntityId,
    setSelectedEntityId: handleSelectEntity,
    toggleEntityVisibility: entityManager.toggleEntityVisibility,
    handleCreateEntity: entityManager.createEntity,
    handleDuplicateEntity: entityManager.duplicateEntity,
    handleDeleteEntity: entityManager.deleteEntity,
    handleRenameEntity: entityManager.renameEntity,
    handleMoveEntity: entityManager.moveEntity,
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
