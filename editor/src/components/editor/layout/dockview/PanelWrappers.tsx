import React from 'react';
import { IDockviewPanelProps } from 'dockview-react';
import { useEditorContext } from '../EditorContext';

import { MapsPanel } from '@/components/editor/panels/MapsPanel';
import { LayersPanel } from '@/components/editor/panels/LayersPanel';
import { PropertiesPanel } from '@/components/editor/panels/PropertiesPanel';
import { TilesetsPanel } from '@/components/editor/panels/TilesetsPanel';
import { TilesetPreview } from '@/components/editor/panels/TilesetPreview';
import { ActiveSelectionPanel } from '@/components/editor/panels/ActiveSelectionPanel';
import { CenterCanvas } from '../CenterCanvas';

export function MapsWrapper(_props: IDockviewPanelProps) {
  const ctx = useEditorContext();
  return (
    <div className="flex-1 overflow-y-auto p-2 font-mono text-xs min-h-0 bg-sidebar-background h-full">
      <MapsPanel
        maps={ctx.maps}
        mapFolders={ctx.mapFolders}
        activeMap={ctx.activeMap}
        expandedMapFolders={ctx.expandedMapFolders}
        selectedMapFolder={ctx.selectedMapFolder}
        setSelectedMapFolder={ctx.setSelectedMapFolder}
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
    <div className="flex-1 overflow-y-auto p-2 font-mono text-xs min-h-0 bg-sidebar-background h-full">
      <LayersPanel
        layers={ctx.layers}
        activeLayerId={ctx.activeLayerId}
        setActiveLayerId={ctx.setActiveLayerId}
        toggleLayerVisibility={ctx.toggleLayerVisibility}
        toggleLayerLock={ctx.toggleLayerLock}
        deleteLayer={ctx.handleDeleteLayer}
        reorderLayers={ctx.handleReorderLayers}
      />
    </div>
  );
}

export function PropertiesWrapper(_props: IDockviewPanelProps) {
  const ctx = useEditorContext();
  return (
    <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-start text-xs text-muted-foreground text-center min-h-0 bg-card/40 h-full">
      <PropertiesPanel layers={ctx.layers} activeLayerId={ctx.activeLayerId} updateLayers={ctx.updateLayers} />
    </div>
  );
}

export function CanvasWrapper(_props: IDockviewPanelProps) {
  const ctx = useEditorContext();
  return (
    <div className="h-full w-full flex flex-col">
      <CenterCanvas
        historyIndex={ctx.historyIndex}
        historyLength={ctx.historyLength}
        activeTool={ctx.activeTool}
        paintMode={ctx.paintMode}
        handleUndo={ctx.handleUndo}
        handleRedo={ctx.handleRedo}
        setActiveTool={ctx.setActiveTool}
        setPaintMode={ctx.setPaintMode}
        activeMap={ctx.activeMap}
        layers={ctx.layers}
        tilesets={ctx.tilesets}
        tileSelection={ctx.tileSelection}
        setTileSelection={ctx.setTileSelection}
        activeLayerId={ctx.activeLayerId}
        isPainting={ctx.isPainting}
        setIsPainting={ctx.setIsPainting}
        paintStartPos={ctx.paintStartPos}
        setPaintStartPos={ctx.setPaintStartPos}
        debugInfo={ctx.debugInfo}
        handlePaint={ctx.handlePaint}
        handlePaintBucket={ctx.handlePaintBucket}
        handleRectangleFill={ctx.handleRectangleFill}
        handleCommit={ctx.handleCommit}
      />
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
  properties: PropertiesWrapper,
  canvas: CanvasWrapper,
  tilesets: TilesetsWrapper,
  preview: PreviewWrapper,
  activeSelection: ActiveSelectionWrapper,
};
