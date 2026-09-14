import React, { useMemo, useCallback } from 'react';
import { IDockviewPanelProps } from 'dockview-react';
import { useEditorContext } from '../EditorContext';

import { MapsPanel } from '@/components/editor/panels/MapsPanel';
import { LayersPanel } from '@/components/editor/panels/LayersPanel';
import { EntitiesPanel } from '@/components/editor/panels/EntitiesPanel';
import { PropertiesPanel } from '@/components/editor/panels/PropertiesPanel';
import { TilesetsPanel } from '@/components/editor/panels/TilesetsPanel';
import { TilesetPreview } from '@/components/editor/panels/TilesetPreview';
import { ActiveSelectionPanel } from '@/components/editor/panels/ActiveSelectionPanel';
import { CenterCanvas } from '../CenterCanvas';

// Stable no-op used as a placeholder for callbacks on inactive canvases.
// Defined at module scope so it's the same reference every render — avoids
// creating new arrow functions inside CanvasWrapper on every tick.
const noop = () => {};

export function MapsWrapper(_props: IDockviewPanelProps) {
  const ctx = useEditorContext();
  return (
    <div
      onClick={() => ctx.setFocusedDomain?.('maps')}
      className="flex-1 overflow-y-auto p-2 font-mono text-xs min-h-0 bg-sidebar-background h-full"
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
        handleMapDrop={ctx.handleMapDrop}
        onSelectMap={ctx.onSelectMap}
      />
    </div>
  );
}

export function LayersWrapper(_props: IDockviewPanelProps) {
  const ctx = useEditorContext();
  return (
    <div
      onClick={() => ctx.setFocusedDomain?.('layers')}
      className="flex-1 overflow-y-auto p-2 font-mono text-xs min-h-0 bg-sidebar-background h-full"
    >
      <LayersPanel
        activeMap={ctx.activeMap}
        layers={ctx.layers}
        activeLayerId={ctx.activeLayerId}
        setActiveLayerId={ctx.setActiveLayerId}
        toggleLayerVisibility={ctx.toggleLayerVisibility}
        toggleLayerLock={ctx.toggleLayerLock}
        deleteLayer={ctx.handleDeleteLayer}
        reorderLayers={ctx.handleReorderLayers}
        createLayerOfType={ctx.handleCreateLayerOfType}
        renameLayer={ctx.handleRenameLayer}
        duplicateLayer={ctx.handleDuplicateLayer}
        setConfirmDialog={ctx.setConfirmDialog}
      />
    </div>
  );
}

export function EntitiesWrapper(_props: IDockviewPanelProps) {
  const ctx = useEditorContext();
  return (
    <div
      onClick={() => ctx.setFocusedDomain?.('entities')}
      className="flex-1 overflow-y-auto p-2 font-mono text-xs min-h-0 bg-sidebar-background h-full"
    >
      <EntitiesPanel
        activeMap={ctx.activeMap}
        entities={ctx.entities}
        selectedEntityId={ctx.selectedEntityId}
        setSelectedEntityId={ctx.setSelectedEntityId}
        createEntity={ctx.handleCreateEntity}
        deleteEntity={ctx.handleDeleteEntity}
        duplicateEntity={ctx.handleDuplicateEntity}
        renameEntity={ctx.handleRenameEntity}
        reorderEntities={ctx.handleReorderEntities}
        setConfirmDialog={ctx.setConfirmDialog}
      />
    </div>
  );
}

export function PropertiesWrapper(_props: IDockviewPanelProps) {
  const ctx = useEditorContext();
  return (
    <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-start text-xs text-muted-foreground text-center min-h-0 bg-card/40 h-full">
      <PropertiesPanel
        layers={ctx.layers}
        activeLayerId={ctx.activeLayerId}
        updateLayers={ctx.updateLayers}
        entities={ctx.entities}
        selectedEntityId={ctx.selectedEntityId}
        renameEntity={ctx.handleRenameEntity}
        moveEntity={ctx.handleMoveEntity}
        addComponent={ctx.handleAddComponent}
        removeComponent={ctx.handleRemoveComponent}
        updateComponentProp={ctx.handleUpdateComponentProp}
        deleteEntity={ctx.handleDeleteEntity}
      />
    </div>
  );
}

export function CanvasWrapper(props: IDockviewPanelProps) {
  const ctx = useEditorContext();
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
        (m: any) =>
          m.fileName === fileName && (m.folderPath || null) === (folderPath || null)
      ) || null
    );
  }, [isActive, ctx.activeMap, ctx.maps, fileName, folderPath]);

  const currentLayers = isActive ? ctx.layers : targetMap?.layers || [];
  const currentEntities = isActive ? ctx.entities : targetMap?.entities || [];

  const handleActivate = useCallback(() => {
    if (!isActive && targetMap) {
      ctx.onSelectMap?.(targetMap);
      props.api.setActive();
    }
  }, [isActive, targetMap, ctx, props.api]);

  return (
    <div
      className="h-full w-full flex flex-col"
      onPointerDownCapture={handleActivate}
    >
      <CenterCanvas
        activeTool={ctx.activeTool}
        paintMode={ctx.paintMode}
        activeMap={targetMap}
        layers={currentLayers}
        tilesets={ctx.tilesets}
        tileSelection={isActive ? ctx.tileSelection : null}
        setTileSelection={ctx.setTileSelection}
        activeLayerId={isActive ? ctx.activeLayerId : null}
        isPainting={isActive ? ctx.isPainting : false}
        setIsPainting={isActive ? ctx.setIsPainting : noop}
        paintStartPos={isActive ? ctx.paintStartPos : null}
        setPaintStartPos={isActive ? ctx.setPaintStartPos : noop}
        debugInfo={isActive ? ctx.debugInfo : null}
        handlePaint={isActive ? ctx.handlePaint : noop}
        handlePaintBucket={isActive ? ctx.handlePaintBucket : noop}
        handleRectangleFill={isActive ? ctx.handleRectangleFill : noop}
        handleCommit={isActive ? ctx.handleCommit : noop}
        entities={currentEntities}
        selectedEntityId={isActive ? ctx.selectedEntityId : null}
        setSelectedEntityId={isActive ? ctx.setSelectedEntityId : noop}
        moveEntity={isActive ? ctx.moveEntity : noop}
      />
    </div>
  );
}

export function EmptyCanvasWrapper(_props: IDockviewPanelProps) {
  return (
    <div className="flex-1 h-full w-full flex flex-col items-center justify-center bg-[#1a1a1a] text-muted-foreground font-mono text-xs select-none p-8 text-center">
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

export function TilesetsWrapper(_props: IDockviewPanelProps) {
  const ctx = useEditorContext();
  return (
    <div
      className="flex-1 overflow-y-auto p-2 font-mono text-xs min-h-0 bg-sidebar-background h-full"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => ctx.handleDrop(e, null)}
    >
      <TilesetsPanel
        tilesets={ctx.tilesets}
        folders={ctx.folders}
        activeTileset={ctx.activeTileset}
        setActiveTileset={ctx.setActiveTileset}
        expandedFolders={ctx.expandedFolders}
        selectedFolder={ctx.selectedFolder}
        setSelectedFolder={ctx.setSelectedFolder}
        toggleFolder={ctx.toggleFolder}
        handlePickFile={ctx.handlePickFile}
        handleOpenCreateFolderDialog={ctx.handleOpenCreateFolderDialog}
        setRenameInput={ctx.setRenameInput}
        setRenameDialog={ctx.setRenameDialog}
        handleDeleteFolder={ctx.handleDeleteFolder}
        handleDrop={ctx.handleDrop}
        activeLayerType={ctx.activeLayerType}
      />
    </div>
  );
}

export function PreviewWrapper(_props: IDockviewPanelProps) {
  const ctx = useEditorContext();
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

export function ActiveSelectionWrapper(_props: IDockviewPanelProps) {
  const ctx = useEditorContext();
  return (
    <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-muted/10 min-h-0 h-full">
      <ActiveSelectionPanel tileSelection={ctx.tileSelection} tilesets={ctx.tilesets} />
    </div>
  );
}

export const dockviewComponents = {
  maps: MapsWrapper,
  layers: LayersWrapper,
  entities: EntitiesWrapper,
  properties: PropertiesWrapper,
  canvas: CanvasWrapper,
  emptyCanvas: EmptyCanvasWrapper,
  tilesets: TilesetsWrapper,
  preview: PreviewWrapper,
  activeSelection: ActiveSelectionWrapper,
};
