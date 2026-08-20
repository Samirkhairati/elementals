import React, { useMemo } from 'react';
import {
  DockviewReact,
  DockviewReadyEvent,
  IDockviewPanelProps,
  IDockviewHeaderActionsProps
} from 'dockview-react';
import 'dockview/dist/styles/dockview.css';
import './DockviewTheme.css';

import { useEditorContext } from './EditorContext';

import { MapsPanel } from '@/components/editor/panels/MapsPanel';
import { LayersPanel } from '@/components/editor/panels/LayersPanel';
import { PropertiesPanel } from '@/components/editor/panels/PropertiesPanel';
import { TilesetsPanel } from '@/components/editor/panels/TilesetsPanel';
import { TilesetPreview } from '@/components/editor/panels/TilesetPreview';
import { ActiveSelectionPanel } from '@/components/editor/panels/ActiveSelectionPanel';
import { CenterCanvas } from './CenterCanvas';

import { Plus, FolderPlus, Map as MapIcon, Layers as LayersIcon, Settings2, FolderTree, Palette, MousePointer2 } from "lucide-react";

// --- Panel Wrappers ---
function MapsWrapper(props: IDockviewPanelProps) {
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

function LayersWrapper(props: IDockviewPanelProps) {
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

function PropertiesWrapper(props: IDockviewPanelProps) {
  const ctx = useEditorContext();
  return (
    <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-start text-xs text-muted-foreground text-center min-h-0 bg-card/40 h-full">
      <PropertiesPanel layers={ctx.layers} activeLayerId={ctx.activeLayerId} updateLayers={ctx.updateLayers} />
    </div>
  );
}

function CanvasWrapper(props: IDockviewPanelProps) {
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

function TilesetsWrapper(props: IDockviewPanelProps) {
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

function PreviewWrapper(props: IDockviewPanelProps) {
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

function ActiveSelectionWrapper(props: IDockviewPanelProps) {
  const ctx = useEditorContext();
  return (
    <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-muted/10 min-h-0 h-full">
      <ActiveSelectionPanel tileSelection={ctx.tileSelection} tilesets={ctx.tilesets} />
    </div>
  );
}

// --- Action Wrappers (for the header buttons) ---
function MapsActions() {
  const ctx = useEditorContext();
  return (
    <div className="flex items-center space-x-1 px-2">
      <button onClick={() => {
        ctx.setCreateMapFolderName(`Folder ${ctx.mapFolders.length + 1}`)
        ctx.setCreateMapFolderDialog({ open: true, parentPath: null })
      }} className="p-1.5 hover:bg-sidebar-accent rounded-md text-sidebar-foreground" title="New Folder">
        <FolderPlus className="w-4 h-4" />
      </button>
      <button onClick={() => {
        ctx.setCreateMapData({ name: '', width: 50, height: 50 })
        ctx.setCreateMapDialog({ open: true, parentPath: null })
      }} className="p-1.5 hover:bg-sidebar-accent rounded-md text-sidebar-foreground" title="New Map">
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

function LayersActions() {
  const ctx = useEditorContext();
  return (
    <div className="flex items-center space-x-1 px-2">
      <button onClick={() => {
        if (!ctx.activeMap) { alert("Please select a map first"); return; }
        ctx.handleCreateLayer();
      }} className="p-1.5 hover:bg-sidebar-accent rounded-md text-sidebar-foreground" title="New Layer">
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

function TilesetsActions() {
  const ctx = useEditorContext();
  return (
    <div className="flex items-center space-x-1 px-2">
      <button onClick={() => ctx.handleOpenCreateFolderDialog(null)} className="p-1.5 hover:bg-sidebar-accent rounded-md text-sidebar-foreground" title="New Folder">
        <FolderPlus className="w-4 h-4" />
      </button>
      <button onClick={() => ctx.handlePickFile(null)} className="flex items-center gap-1 text-xs font-medium font-mono bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity shadow-sm">
        <Plus className="w-3.5 h-3.5" /> Add
      </button>
    </div>
  );
}

// Default Header Actions Component maps panel ID to an action component
const DefaultHeaderActions = (props: any) => {
  const panelId = props.group?.activePanel?.id || props.panel?.id;
  if (panelId === 'maps') return <MapsActions />;
  if (panelId === 'layers') return <LayersActions />;
  if (panelId === 'tilesets') return <TilesetsActions />;
  return null;
};

// Component Factory
const components = {
  maps: MapsWrapper,
  layers: LayersWrapper,
  properties: PropertiesWrapper,
  canvas: CanvasWrapper,
  tilesets: TilesetsWrapper,
  preview: PreviewWrapper,
  activeSelection: ActiveSelectionWrapper,
};

// Main Component
export function EditorDockview() {
  const onReady = (event: DockviewReadyEvent) => {
    const api = event.api;

    // Create a 3 column layout
    // Left: Maps, Layers, Properties
    // Center: Canvas
    // Right: Tilesets, Preview, ActiveSelection
    
    // Add Center Canvas
    const canvasPanel = api.addPanel({
      id: 'canvas',
      component: 'canvas',
      title: 'CANVAS',
    });
    // Canvas doesn't need a visible tab header
    canvasPanel.group.header.hidden = true;

    // Add Left Sidebar panels
    const mapsPanel = api.addPanel({
      id: 'maps',
      component: 'maps',
      title: 'MAPS',
      position: { referencePanel: canvasPanel, direction: 'left' },
    });
    
    const layersPanel = api.addPanel({
      id: 'layers',
      component: 'layers',
      title: 'LAYERS',
      position: { referencePanel: mapsPanel, direction: 'below' },
    });
    
    const propsPanel = api.addPanel({
      id: 'properties',
      component: 'properties',
      title: 'PROPERTIES',
      position: { referencePanel: layersPanel, direction: 'below' },
    });

    // Add Right Sidebar panels
    const tilesetsPanel = api.addPanel({
      id: 'tilesets',
      component: 'tilesets',
      title: 'TILESET BROWSER',
      position: { referencePanel: canvasPanel, direction: 'right' },
    });

    const previewPanel = api.addPanel({
      id: 'preview',
      component: 'preview',
      title: 'TILESET',
      position: { referencePanel: tilesetsPanel, direction: 'below' },
    });

    const selectionPanel = api.addPanel({
      id: 'activeSelection',
      component: 'activeSelection',
      title: 'ACTIVE SELECTION',
      position: { referencePanel: previewPanel, direction: 'below' },
    });

    // Layout resizing
    api.layout(api.width, api.height); // Force layout recalculation
    // Adjust group sizes relative to each other (optional sizing logic can go here)
  };

  return (
    <div className="flex-1 w-full h-full overflow-hidden">
      <DockviewReact
        components={components}
        onReady={onReady}
        className="dockview-theme-elementals"
        defaultTabComponent={undefined}
        rightHeaderActionsComponent={DefaultHeaderActions}
      />
    </div>
  );
}
