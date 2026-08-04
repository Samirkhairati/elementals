import React from 'react'
import { Plus, FolderPlus, LayoutGrid as LayoutGridIcon, MousePointer2 } from "lucide-react"
import { ResizablePanel as OriginalResizablePanel } from "@/components/ui/resizable"
const ResizablePanel = OriginalResizablePanel as any

import { TileSelection, TilesetData, LayerType } from '@/types/editor'
import { TilesetsPanel } from '@/components/editor/panels/TilesetsPanel'
import { ActiveSelectionPanel } from '@/components/editor/panels/ActiveSelectionPanel'
import { TilesetPreview } from '@/components/editor/panels/TilesetPreview'
import { CollapsiblePanelHeader } from './CollapsiblePanelHeader'

const HEADER_H = 40

interface RightSidebarProps {
  tilesetsCollapsed: boolean
  setTilesetsCollapsed: (v: boolean) => void
  activeSelectionCollapsed: boolean
  setActiveSelectionCollapsed: (v: boolean) => void
  previewCollapsed: boolean
  setPreviewCollapsed: (v: boolean) => void
  tilesetsH: number
  setTilesetsH: React.Dispatch<React.SetStateAction<number>>
  activeSelectionH: number
  setActiveSelectionH: React.Dispatch<React.SetStateAction<number>>
  makeDragHandle: (setHeight: React.Dispatch<React.SetStateAction<number>>, isTopCollapsed: boolean, isBottomCollapsed: boolean) => (e: React.PointerEvent<HTMLDivElement>) => void
  // Tilesets props
  tilesets: TilesetData[]
  folders: string[]
  activeTileset: TilesetData | null
  setActiveTileset: (t: TilesetData | null) => void
  expandedFolders: Set<string>
  selectedFolder: string | null
  setSelectedFolder: (f: string | null) => void
  toggleFolder: (f: string) => void
  handlePickFile: (targetFolder?: string | null) => void
  handleOpenCreateFolderDialog: (parentPath?: string | null) => void
  setRenameInput: (v: string) => void
  setRenameDialog: React.Dispatch<React.SetStateAction<{ open: boolean; type: 'folder' | 'tileset' | 'map-folder' | 'map'; oldPath?: string; oldName?: string; targetFolder?: string | null }>>
  handleDeleteFolder: (folderPath: string) => void
  handleDrop: (e: React.DragEvent, targetFolder: string | null) => void
  activeLayerType: LayerType | null
  // Selection / Preview props
  tileSelection: TileSelection | null
  setTileSelection: React.Dispatch<React.SetStateAction<TileSelection | null>>
  tilesetDimensions: { width: number; height: number } | null
  setTilesetDimensions: (dim: { width: number; height: number } | null) => void
  tilesetSelectionStart: { x: number; y: number } | null
  setTilesetSelectionStart: (pos: { x: number; y: number } | null) => void
  tilesetSelectionCurrent: { x: number; y: number } | null
  setTilesetSelectionCurrent: (pos: { x: number; y: number } | null) => void
  hoverTile: { x: number; y: number } | null
  setHoverTile: (pos: { x: number; y: number } | null) => void
}

export function RightSidebar({
  tilesetsCollapsed,
  setTilesetsCollapsed,
  activeSelectionCollapsed,
  setActiveSelectionCollapsed,
  previewCollapsed,
  setPreviewCollapsed,
  tilesetsH,
  setTilesetsH,
  activeSelectionH,
  setActiveSelectionH,
  makeDragHandle,
  tilesets,
  folders,
  activeTileset,
  setActiveTileset,
  expandedFolders,
  selectedFolder,
  setSelectedFolder,
  toggleFolder,
  handlePickFile,
  handleOpenCreateFolderDialog,
  setRenameInput,
  setRenameDialog,
  handleDeleteFolder,
  handleDrop,
  activeLayerType,
  tileSelection,
  setTileSelection,
  tilesetDimensions,
  setTilesetDimensions,
  tilesetSelectionStart,
  setTilesetSelectionStart,
  tilesetSelectionCurrent,
  setTilesetSelectionCurrent,
  hoverTile,
  setHoverTile
}: RightSidebarProps) {
  return (
    <ResizablePanel defaultSize="25%" minSize="15%" maxSize="40%" className="flex flex-col z-10 shadow-xl bg-sidebar-background border-l border-border min-w-0 min-h-0">
      <div className="flex flex-col h-full w-full overflow-hidden">
        {/* Tilesets Panel */}
        <div
          data-panel-section
          className="flex flex-col overflow-hidden shrink-0"
          style={{ height: tilesetsCollapsed ? HEADER_H : tilesetsH }}
        >
          <CollapsiblePanelHeader
            collapsed={tilesetsCollapsed}
            onToggle={() => setTilesetsCollapsed(!tilesetsCollapsed)}
            icon={<LayoutGridIcon className="w-4 h-4 ml-0.5" />}
            title="TILESETS"
            actions={
              <>
                <button onClick={() => handleOpenCreateFolderDialog(null)} className="p-1.5 hover:bg-sidebar-accent rounded-md text-sidebar-foreground" title="New Folder">
                  <FolderPlus className="w-4 h-4" />
                </button>
                <button onClick={() => handlePickFile(null)} className="flex items-center gap-1 text-xs font-medium font-mono bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity shadow-sm">
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </>
            }
          />
          {!tilesetsCollapsed && (
            <div
              className="flex-1 overflow-y-auto p-2 font-mono text-xs min-h-0"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, null)}
            >
              <TilesetsPanel
                tilesets={tilesets}
                folders={folders}
                activeTileset={activeTileset}
                setActiveTileset={setActiveTileset}
                expandedFolders={expandedFolders}
                selectedFolder={selectedFolder}
                setSelectedFolder={setSelectedFolder}
                toggleFolder={toggleFolder}
                handlePickFile={handlePickFile}
                handleOpenCreateFolderDialog={handleOpenCreateFolderDialog}
                setRenameInput={setRenameInput}
                setRenameDialog={setRenameDialog}
                handleDeleteFolder={handleDeleteFolder}
                handleDrop={handleDrop}
                activeLayerType={activeLayerType}
              />
            </div>
          )}
        </div>

        {/* Drag handle between Tilesets and Active Selection */}
        <div
          onPointerDown={makeDragHandle(setTilesetsH, tilesetsCollapsed, activeSelectionCollapsed)}
          className="h-[3px] shrink-0 bg-sidebar-border hover:bg-primary/50 cursor-row-resize transition-colors"
        />

        {/* Active Selection Panel */}
        <div
          data-panel-section
          className="flex flex-col bg-card/40 overflow-hidden border-t border-sidebar-border shrink-0"
          style={{ height: activeSelectionCollapsed ? HEADER_H : activeSelectionH }}
        >
          <CollapsiblePanelHeader
            collapsed={activeSelectionCollapsed}
            onToggle={() => setActiveSelectionCollapsed(!activeSelectionCollapsed)}
            icon={<MousePointer2 className="w-4 h-4 ml-0.5" />}
            title="ACTIVE SELECTION"
          />
          {!activeSelectionCollapsed && (
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-muted/10 min-h-0">
              <ActiveSelectionPanel tileSelection={tileSelection} tilesets={tilesets} />
            </div>
          )}
        </div>

        {/* Drag handle between Active Selection and Preview */}
        <div
          onPointerDown={makeDragHandle(setActiveSelectionH, activeSelectionCollapsed, previewCollapsed)}
          className="h-[3px] shrink-0 bg-sidebar-border hover:bg-primary/50 cursor-row-resize transition-colors"
        />

        {/* Tileset Preview Panel — fills remaining space */}
        <div className="flex flex-col bg-card/40 overflow-hidden border-t border-sidebar-border flex-1 min-h-[40px]">
          <CollapsiblePanelHeader
            collapsed={previewCollapsed}
            onToggle={() => setPreviewCollapsed(!previewCollapsed)}
            icon={null}
            title="PREVIEW"
          />
          {!previewCollapsed && (
            <div className="flex-1 overflow-auto p-4 relative bg-muted/10 min-h-0">
              <TilesetPreview
                activeTileset={activeTileset}
                tilesetDimensions={tilesetDimensions}
                setTilesetDimensions={setTilesetDimensions}
                tileSelection={tileSelection}
                setTileSelection={setTileSelection}
                tilesetSelectionStart={tilesetSelectionStart}
                setTilesetSelectionStart={setTilesetSelectionStart}
                tilesetSelectionCurrent={tilesetSelectionCurrent}
                setTilesetSelectionCurrent={setTilesetSelectionCurrent}
                hoverTile={hoverTile}
                setHoverTile={setHoverTile}
                activeLayerType={activeLayerType}
              />
            </div>
          )}
        </div>
      </div>
    </ResizablePanel>
  )
}
