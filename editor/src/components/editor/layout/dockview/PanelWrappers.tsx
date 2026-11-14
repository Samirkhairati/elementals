import { describeBindings } from '@/lib/shortcuts';
import { useBindings } from '@/store/shortcutStore';
import React, { useMemo, useCallback } from 'react';
import { IDockviewPanelProps } from 'dockview-react';
import { useEditorSelector, type EditorContextValue } from '../EditorContext';
import type { MapData } from '@/types/editor';

import { MapsPanel } from '@/components/editor/panels/MapsPanel';
import { SceneTree } from '@/components/editor/panels/SceneTree';
import { CollisionPanel } from '@/components/editor/panels/CollisionPanel';
import { PropertiesPanel } from '@/components/editor/panels/PropertiesPanel';
import { ImagesPanel } from '@/components/editor/panels/ImagesPanel';
import { TilesetsPanel } from '@/components/editor/panels/TilesetsPanel';
import { TilesetPreview } from '@/components/editor/panels/TilesetPreview';
import { ActiveSelectionPanel } from '@/components/editor/panels/ActiveSelectionPanel';
import { DatabasePanel } from '@/components/editor/panels/DatabasePanel';
import { LookPanel } from '@/components/editor/look/LookPanel';
import { MapCanvas } from '@/components/editor/canvas/MapCanvas';

const NO_NODES: never[] = [];

// Stable no-op used as a placeholder for callbacks on inactive canvases.
// Defined at module scope so it's the same reference every render — avoids
// creating new arrow functions inside CanvasWrapper on every tick.
const noop = () => {};

// Each wrapper subscribes only to the context fields it passes down. Selectors live at module
// scope (stable identity); results are compared shallowly, so unrelated context changes
// (e.g. entities while painting) do not re-render the panel.

const selectMaps = (c: EditorContextValue) => ({
  setFocusedDomain: c.setFocusedDomain,
  maps: c.maps,
  mapFolders: c.mapFolders,
  activeMap: c.activeMap,
  expandedMapFolders: c.expandedMapFolders,
  toggleMapFolder: c.toggleMapFolder,
  setCreateMapData: c.setCreateMapData,
  setCreateMapDialog: c.setCreateMapDialog,
  setCreateMapFolderName: c.setCreateMapFolderName,
  setCreateMapFolderDialog: c.setCreateMapFolderDialog,
  setRenameInput: c.setRenameInput,
  setRenameDialog: c.setRenameDialog,
  handleDeleteMapFolder: c.handleDeleteMapFolder,
  handleDeleteMap: c.handleDeleteMap,
  handleExportMap: c.handleExportMap,
  handleExportMapToGame: c.handleExportMapToGame,
  handleResizeMap: c.handleResizeMap,
  handleMapSettings: c.handleMapSettings,
  handleMapDrop: c.handleMapDrop,
  onSelectMap: c.onSelectMap,
});

export function MapsWrapper(_props: IDockviewPanelProps) {
  const ctx = useEditorSelector(selectMaps);
  return (
    <div
      onClick={() => ctx.setFocusedDomain('maps')}
      className="flex-1 overflow-y-auto p-2 text-xs min-h-0 bg-sidebar-background h-full"
    >
      <MapsPanel
        maps={ctx.maps}
        mapFolders={ctx.mapFolders}
        activeMap={ctx.activeMap}
        expandedMapFolders={ctx.expandedMapFolders}
        toggleMapFolder={ctx.toggleMapFolder}
        setCreateMapData={ctx.setCreateMapData}
        setCreateMapDialog={ctx.setCreateMapDialog}
        setCreateMapFolderName={ctx.setCreateMapFolderName}
        setCreateMapFolderDialog={ctx.setCreateMapFolderDialog}
        setRenameInput={ctx.setRenameInput}
        setRenameDialog={ctx.setRenameDialog}
        handleDeleteMapFolder={ctx.handleDeleteMapFolder}
        handleDeleteMap={ctx.handleDeleteMap}
        handleExportMap={ctx.handleExportMap}
        handleExportMapToGame={ctx.handleExportMapToGame}
        handleResizeMap={ctx.handleResizeMap}
        handleMapSettings={ctx.handleMapSettings}
        handleMapDrop={ctx.handleMapDrop}
        onSelectMap={ctx.onSelectMap}
      />
    </div>
  );
}

/** The Scene panel (dock panel `layers`, so saved layouts keep working): the map's scene tree. */
export function LayersWrapper(_props: IDockviewPanelProps) {
  return (
    <div
      className="flex-1 overflow-y-auto p-2 text-xs min-h-0 bg-sidebar-background h-full"
      data-testid="scene-panel"
    >
      <SceneTree />
    </div>
  );
}

/** A panel that no longer exists (the entity list is part of the Layers panel): old saved layouts still name it, and it is closed once restored. */
function RetiredPanel(_props: IDockviewPanelProps) {
  return null;
}

const selectProperties = (c: EditorContextValue) => ({
  nodes: c.activeMap?.nodes,
  activeLayerId: c.activeLayerId,
  editNode: c.editNode,
  entities: c.entities,
  selectedEntityId: c.selectedEntityId,
  handleRenameEntity: c.handleRenameEntity,
  handleMoveEntity: c.handleMoveEntity,
  handleAddComponent: c.handleAddComponent,
  handleRemoveComponent: c.handleRemoveComponent,
  handleUpdateComponentProp: c.handleUpdateComponentProp,
  handleUpdateComponentProps: c.handleUpdateComponentProps,
  handleDeleteEntity: c.handleDeleteEntity,
  setSelectedEntityId: c.setSelectedEntityId,
});

/**
 * Layer properties live in the left sidebar; the entity inspector is its own panel in the right sidebar
 * (it replaces the tileset panels while an entity is selected, see useDockviewLayout).
 */
function PropertiesBody({ entityMode }: { entityMode: boolean }) {
  const ctx = useEditorSelector(selectProperties);
  return (
    // A plain block that scrolls vertically: a flex column here let the inspector shrink instead of scroll.
    <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-2 text-xs text-muted-foreground bg-card/40" data-testid="properties-scroll">
      <PropertiesPanel
        nodes={ctx.nodes ?? NO_NODES}
        activeLayerId={ctx.activeLayerId}
        editNode={ctx.editNode}
        entities={ctx.entities}
        selectedEntityId={entityMode ? ctx.selectedEntityId : null}
        renameEntity={ctx.handleRenameEntity}
        moveEntity={ctx.handleMoveEntity}
        addComponent={ctx.handleAddComponent}
        removeComponent={ctx.handleRemoveComponent}
        updateComponentProp={ctx.handleUpdateComponentProp}
        updateComponentProps={ctx.handleUpdateComponentProps}
        deleteEntity={ctx.handleDeleteEntity}
        onBack={entityMode ? () => ctx.setSelectedEntityId(null) : undefined}
      />
    </div>
  );
}

export function PropertiesWrapper(_props: IDockviewPanelProps) {
  return <PropertiesBody entityMode={false} />;
}

export function InspectorWrapper(_props: IDockviewPanelProps) {
  return <PropertiesBody entityMode />;
}

/** The right sidebar while a collision layer is active (see useDockviewLayout). */
export function CollisionWrapper(_props: IDockviewPanelProps) {
  return (
    <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain bg-card/40 p-2 text-xs text-muted-foreground" data-testid="collision-scroll">
      <CollisionPanel />
    </div>
  );
}

/** The right sidebar while an image layer is active (see useDockviewLayout). */
export function ImagesWrapper(_props: IDockviewPanelProps) {
  return (
    <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain bg-card/40 p-2 text-xs text-muted-foreground" data-testid="images-scroll">
      <ImagesPanel />
    </div>
  );
}

/** The Look panel (colour grading of the map, a layer or a picture; opened on demand). */
export function LookWrapper(_props: IDockviewPanelProps) {
  return (
    <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain bg-card/40 p-2 text-xs" data-testid="look-scroll">
      <LookPanel />
    </div>
  );
}

const selectCanvas = (c: EditorContextValue) => ({
  activeMap: c.activeMap,
  maps: c.maps,
  onSelectMap: c.onSelectMap,
  activeTool: c.activeTool,
  paintMode: c.paintMode,
  tilesets: c.tilesets,
  tileSelection: c.tileSelection,
  setTileSelection: c.setTileSelection,
  activeLayerId: c.activeLayerId,
  isPainting: c.isPainting,
  setIsPainting: c.setIsPainting,
  paintStartPos: c.paintStartPos,
  setPaintStartPos: c.setPaintStartPos,
  handlePaint: c.handlePaint,
  handlePaintBucket: c.handlePaintBucket,
  handleRectangleFill: c.handleRectangleFill,
  handleCommit: c.handleCommit,
  selectedEntityId: c.selectedEntityId,
  setSelectedEntityId: c.setSelectedEntityId,
  handleMoveEntity: c.handleMoveEntity,
  showGrid: c.showGrid,
  snapToGrid: c.snapToGrid,
  snapEntityPos: c.snapEntityPos,
  pendingPlacement: c.pendingPlacement,
  commitPlacement: c.commitPlacement,
  cancelPlacement: c.cancelPlacement,
  handleCreateEntity: c.handleCreateEntity,
  handleDuplicateEntity: c.handleDuplicateEntity,
  handleDeleteEntity: c.handleDeleteEntity,
  handleUpdateComponentProp: c.handleUpdateComponentProp,
  handleUpdateComponentProps: c.handleUpdateComponentProps,
  pinSelection: c.pinSelection,
  selectedLayerIds: c.selectedLayerIds,
  pendingImage: c.pendingImage,
  cancelImagePlacement: c.cancelImagePlacement,
  selectedImageId: c.selectedImageId,
  clearSelection: c.clearSelection,
  pickedImageIds: c.pickedImageIds,
  selectImage: c.selectImage,
  moveImages: c.moveImages,
  resizingImageId: c.resizingImageId,
  placeMultiple: c.placeMultiple,
  setActiveLayerId: c.setActiveLayerId,
  addImage: c.addImage,
  updateImage: c.updateImage,
  setCollisionShapes: c.setCollisionShapes,
  deleteNodes: c.deleteNodes,
});

export function CanvasWrapper(props: IDockviewPanelProps) {
  const ctx = useEditorSelector(selectCanvas);
  const folderPath = props.params?.folderPath ?? null;
  const fileName = props.params?.fileName ?? '';

  const isActive =
    ctx.activeMap !== null &&
    ctx.activeMap.fileName === fileName &&
    (ctx.activeMap.folderPath || null) === (folderPath || null);

  const targetMap = useMemo(() => {
    if (isActive) return ctx.activeMap;
    return (
      ctx.maps.find(
        (m: MapData) =>
          m.fileName === fileName && (m.folderPath || null) === (folderPath || null)
      ) || null
    );
  }, [isActive, ctx.activeMap, ctx.maps, fileName, folderPath]);

  const { addImage, updateImage, activeLayerId, pendingImage } = ctx;
  const placeKeys = describeBindings('image.placeMultiple', useBindings());
  // Placement keeps going (Esc or a right-click ends it) so a row of trees is a row of clicks.
  const commitImagePlacement = useCallback(
    (x: number, y: number) => {
      if (activeLayerId && pendingImage) addImage(activeLayerId, { ...pendingImage, x, y })
    },
    [addImage, activeLayerId, pendingImage]
  );
  const moveImage = useCallback(
    (layerId: string, imageId: string, x: number, y: number) => updateImage(layerId, imageId, { x, y }),
    [updateImage]
  );
  const resizeImage = useCallback(
    (layerId: string, imageId: string, change: { scale: number; x: number; y: number }) => updateImage(layerId, imageId, change),
    [updateImage]
  );

  const onSelectMap = ctx.onSelectMap;
  const handleActivate = useCallback(() => {
    if (!isActive && targetMap) {
      onSelectMap(targetMap);
      props.api.setActive();
    }
  }, [isActive, targetMap, onSelectMap, props.api]);

  return (
    <div
      className="h-full w-full flex flex-col"
      onPointerDownCapture={handleActivate}
    >
      <MapCanvas
        activeTool={ctx.activeTool}
        paintMode={ctx.paintMode}
        activeMap={targetMap}
        tilesets={ctx.tilesets}
        tileSelection={isActive ? ctx.tileSelection : null}
        setTileSelection={ctx.setTileSelection}
        activeLayerId={isActive ? ctx.activeLayerId : null}
        isPainting={isActive ? ctx.isPainting : false}
        setIsPainting={isActive ? ctx.setIsPainting : noop}
        paintStartPos={isActive ? ctx.paintStartPos : null}
        setPaintStartPos={isActive ? ctx.setPaintStartPos : noop}
        handlePaint={isActive ? ctx.handlePaint : noop}
        handlePaintBucket={isActive ? ctx.handlePaintBucket : noop}
        handleRectangleFill={isActive ? ctx.handleRectangleFill : noop}
        handleCommit={isActive ? ctx.handleCommit : noop}
        selectedEntityId={isActive ? ctx.selectedEntityId : null}
        setSelectedEntityId={isActive ? ctx.setSelectedEntityId : noop}
        moveEntity={isActive ? ctx.handleMoveEntity : noop}
        showGrid={ctx.showGrid}
        snapToGrid={ctx.snapToGrid}
        snapEntityPos={ctx.snapEntityPos}
        pendingPlacement={ctx.pendingPlacement}
        commitPlacement={ctx.commitPlacement}
        cancelPlacement={ctx.cancelPlacement}
        createEntity={ctx.handleCreateEntity}
        duplicateEntity={ctx.handleDuplicateEntity}
        deleteEntity={ctx.handleDeleteEntity}
        updateComponentProp={ctx.handleUpdateComponentProp}
        updateComponentProps={ctx.handleUpdateComponentProps}
        pinSelection={isActive ? ctx.pinSelection : false}
        selectedLayerIds={isActive ? ctx.selectedLayerIds : []}
        pendingImage={isActive ? ctx.pendingImage : null}
        commitImagePlacement={isActive ? commitImagePlacement : noop}
        cancelImagePlacement={isActive ? ctx.cancelImagePlacement : noop}
        selectedImageId={isActive ? ctx.selectedImageId : null}
        clearImageSelection={isActive ? () => ctx.setActiveLayerId(ctx.activeLayerId) : undefined}
        pickedImageIds={isActive ? ctx.pickedImageIds : undefined}
        selectImage={isActive ? ctx.selectImage : noop}
        moveImages={isActive ? ctx.moveImages : noop}
        onPlaceMultiple={isActive ? (imageId: string) => ctx.activeLayerId && ctx.placeMultiple(ctx.activeLayerId, imageId) : undefined}
        placeMultipleKeys={placeKeys}
        activateLayer={isActive ? ctx.setActiveLayerId : noop}
        moveImage={isActive ? moveImage : noop}
        resizingImageId={isActive ? ctx.resizingImageId : null}
        resizeImage={isActive ? resizeImage : noop}
        setCollisionShapes={isActive ? ctx.setCollisionShapes : undefined}
        deleteCollisionItem={isActive ? (id: string) => ctx.deleteNodes([id]) : undefined}
      />
    </div>
  );
}

export function EmptyCanvasWrapper(_props: IDockviewPanelProps) {
  return (
    <div className="flex-1 h-full w-full flex flex-col items-center justify-center bg-[#1a1a1a] text-muted-foreground text-xs select-none p-8 text-center">
      <div className="p-5 rounded-xl bg-card/40 border border-border/40 shadow-sm max-w-sm flex flex-col items-center gap-2">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-1">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
            <line x1="8" y1="2" x2="8" y2="18" />
            <line x1="16" y1="6" x2="16" y2="22" />
          </svg>
        </div>
        <p className="font-semibold text-foreground text-sm">No Map Selected</p>
        <p className="text-muted-foreground/80 text-[11px] leading-relaxed">
          Select an existing map from the Maps panel on the left, or right-click to create a new map.
        </p>
      </div>
    </div>
  );
}

const selectTilesets = (c: EditorContextValue) => ({
  tilesets: c.tilesets,
  folders: c.folders,
  activeTileset: c.activeTileset,
  setActiveTileset: c.setActiveTileset,
  expandedFolders: c.expandedFolders,
  toggleFolder: c.toggleFolder,
  activeLayerType: c.activeLayerType,
});

export function TilesetsWrapper(_props: IDockviewPanelProps) {
  const ctx = useEditorSelector(selectTilesets);
  return (
    <div className="flex-1 overflow-y-auto p-2 text-xs min-h-0 bg-sidebar-background h-full">
      <TilesetsPanel
        tilesets={ctx.tilesets}
        folders={ctx.folders}
        activeTileset={ctx.activeTileset}
        setActiveTileset={ctx.setActiveTileset}
        expandedFolders={ctx.expandedFolders}
        toggleFolder={ctx.toggleFolder}
        activeLayerType={ctx.activeLayerType}
      />
    </div>
  );
}

const selectPreview = (c: EditorContextValue) => ({
  activeTileset: c.activeTileset,
  tilesetDimensions: c.tilesetDimensions,
  setTilesetDimensions: c.setTilesetDimensions,
  tileSelection: c.tileSelection,
  setTileSelection: c.setTileSelection,
  tilesetSelectionStart: c.tilesetSelectionStart,
  setTilesetSelectionStart: c.setTilesetSelectionStart,
  tilesetSelectionCurrent: c.tilesetSelectionCurrent,
  setTilesetSelectionCurrent: c.setTilesetSelectionCurrent,
  hoverTile: c.hoverTile,
  setHoverTile: c.setHoverTile,
  activeLayerType: c.activeLayerType,
});

export function PreviewWrapper(_props: IDockviewPanelProps) {
  const ctx = useEditorSelector(selectPreview);
  return (
    <div className="flex-1 overflow-auto p-4 relative bg-muted/10 min-h-0 h-full">
      <TilesetPreview
        activeTileset={ctx.activeTileset}
        tilesetDimensions={ctx.tilesetDimensions}
        setTilesetDimensions={ctx.setTilesetDimensions}
        tileSelection={ctx.tileSelection}
        setTileSelection={ctx.setTileSelection}
        tilesetSelectionStart={ctx.tilesetSelectionStart}
        setTilesetSelectionStart={ctx.setTilesetSelectionStart}
        tilesetSelectionCurrent={ctx.tilesetSelectionCurrent}
        setTilesetSelectionCurrent={ctx.setTilesetSelectionCurrent}
        hoverTile={ctx.hoverTile}
        setHoverTile={ctx.setHoverTile}
        activeLayerType={ctx.activeLayerType}
      />
    </div>
  );
}

const selectActiveSelection = (c: EditorContextValue) => ({
  tileSelection: c.tileSelection,
  tilesets: c.tilesets,
  pinSelection: c.pinSelection,
  setPinSelection: c.setPinSelection,
});

export function ActiveSelectionWrapper(_props: IDockviewPanelProps) {
  const ctx = useEditorSelector(selectActiveSelection);
  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-muted/10 min-h-0 h-full">
      <ActiveSelectionPanel
        tileSelection={ctx.tileSelection}
        tilesets={ctx.tilesets}
        pinned={ctx.pinSelection}
        onTogglePin={() => ctx.setPinSelection(!ctx.pinSelection)}
      />
    </div>
  );
}

const selectDatabase = (c: EditorContextValue) => ({
  switches: c.switches,
  variables: c.variables,
  maps: c.maps,
  addSwitch: c.addSwitch,
  renameSwitch: c.renameSwitch,
  removeSwitch: c.removeSwitch,
  addVariable: c.addVariable,
  renameVariable: c.renameVariable,
  setVariableInitial: c.setVariableInitial,
  removeVariable: c.removeVariable,
  stages: c.stages,
  addStage: c.addStage,
  renameStage: c.renameStage,
  removeStage: c.removeStage,
  addStageValue: c.addStageValue,
  renameStageValue: c.renameStageValue,
  removeStageValue: c.removeStageValue,
  moveStageValue: c.moveStageValue,
  setStageInitial: c.setStageInitial,
  setFolder: c.setDatabaseFolder,
  commonEvents: c.commonEvents,
  addCommonEvent: c.addCommonEvent,
  renameCommonEvent: c.renameCommonEvent,
  removeCommonEvent: c.removeCommonEvent,
  setCommonEventGraph: c.setCommonEventGraph,
});

export function DatabaseWrapper(_props: IDockviewPanelProps) {
  const ctx = useEditorSelector(selectDatabase);
  return (
    <div className="flex-1 overflow-y-auto p-2 text-xs min-h-0 bg-sidebar-background h-full">
      <DatabasePanel
        switches={ctx.switches}
        variables={ctx.variables}
        maps={ctx.maps}
        addSwitch={ctx.addSwitch}
        renameSwitch={ctx.renameSwitch}
        removeSwitch={ctx.removeSwitch}
        addVariable={ctx.addVariable}
        renameVariable={ctx.renameVariable}
        setVariableInitial={ctx.setVariableInitial}
        removeVariable={ctx.removeVariable}
        stages={ctx.stages}
        addStage={ctx.addStage}
        renameStage={ctx.renameStage}
        removeStage={ctx.removeStage}
        addStageValue={ctx.addStageValue}
        renameStageValue={ctx.renameStageValue}
        removeStageValue={ctx.removeStageValue}
        moveStageValue={ctx.moveStageValue}
        setStageInitial={ctx.setStageInitial}
        setFolder={ctx.setFolder}
        commonEvents={ctx.commonEvents}
        addCommonEvent={ctx.addCommonEvent}
        renameCommonEvent={ctx.renameCommonEvent}
        removeCommonEvent={ctx.removeCommonEvent}
        setCommonEventGraph={ctx.setCommonEventGraph}
      />
    </div>
  );
}

export const dockviewComponents = {
  maps: MapsWrapper,
  layers: LayersWrapper,
  entities: RetiredPanel,
  properties: PropertiesWrapper,
  inspector: InspectorWrapper,
  images: ImagesWrapper,
  collision: CollisionWrapper,
  canvas: CanvasWrapper,
  emptyCanvas: EmptyCanvasWrapper,
  tilesets: TilesetsWrapper,
  preview: PreviewWrapper,
  activeSelection: ActiveSelectionWrapper,
  database: DatabaseWrapper,
  look: LookWrapper,
};
