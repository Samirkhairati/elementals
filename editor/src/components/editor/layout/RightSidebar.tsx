import React from 'react'
import { Plus, FolderPlus, FolderTree, Palette, MousePointer2 } from "lucide-react"
import { ResizablePanel as OriginalResizablePanel } from "@/components/ui/resizable"
const ResizablePanel = OriginalResizablePanel as any

import { TileSelection, TilesetData, LayerType } from '@/types/editor'
import { TilesetsPanel } from '@/components/editor/panels/TilesetsPanel'
import { ActiveSelectionPanel } from '@/components/editor/panels/ActiveSelectionPanel'
import { TilesetPreview } from '@/components/editor/panels/TilesetPreview'
import { CollapsiblePanelHeader } from './CollapsiblePanelHeader'
import { useDragResize } from '@/hooks/useDragResize'

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
  const { isDragging, makeDragTopHandle, makeDragBottomHandle } = useDragResize()

  const expandedSections: string[] = []
  if (!tilesetsCollapsed) expandedSections.push('tilesetBrowser')
  if (!previewCollapsed) expandedSections.push('tileset')
  if (!activeSelectionCollapsed) expandedSections.push('activeSelection')
  const lastExpanded = expandedSections.length > 0 ? expandedSections[expandedSections.length - 1] : null

  const tilesetExpanded = !previewCollapsed
  const showDragHandle1 = !tilesetsCollapsed && !previewCollapsed
  const showDragHandle2 = !previewCollapsed && !activeSelectionCollapsed

  const transitionClass = isDragging ? 'transition-none' : 'transition-[height,flex] duration-200 ease-in-out'

  return (
    <ResizablePanel defaultSize="25%" minSize="15%" maxSize="40%" className="flex flex-col z-10 shadow-xl bg-sidebar-background border-l border-border min-w-0 min-h-0">
      <div className="flex flex-col h-full w-full overflow-hidden">
        {/* 1. Tileset Browser Panel */}
        <div
          data-panel-section
          className={`flex flex-col overflow-hidden ${transitionClass}`}
          style={{
            height: tilesetsCollapsed ? HEADER_H : (lastExpanded === 'tilesetBrowser' ? undefined : tilesetsH),
            flex: tilesetsCollapsed ? 'none' : (lastExpanded === 'tilesetBrowser' ? '1 1 0%' : 'none'),
            minHeight: HEADER_H,
          }}
        >
          <CollapsiblePanelHeader
            collapsed={tilesetsCollapsed}
            onToggle={() => setTilesetsCollapsed(!tilesetsCollapsed)}
            icon={<FolderTree className="w-4 h-4 ml-0.5" />}
            title="TILESET BROWSER"
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

        {/* Drag handle between Tileset Browser and Tileset */}
        {showDragHandle1 ? (
          <div
            onPointerDown={makeDragTopHandle(setTilesetsH, tilesetsCollapsed, previewCollapsed)}
            className="relative h-px w-full shrink-0 bg-sidebar-border group"
          >
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-4 cursor-ns-resize z-50" />
          </div>
        ) : (
          <div className="h-px shrink-0 bg-sidebar-border" />
        )}

        {/* 2. Tileset Panel */}
        <div
          data-panel-section
          className={`flex flex-col bg-card/40 overflow-hidden border-t border-sidebar-border ${transitionClass}`}
          style={{
            height: previewCollapsed ? HEADER_H : (tilesetExpanded ? undefined : HEADER_H),
            flex: previewCollapsed ? 'none' : (tilesetExpanded ? '1 1 0%' : 'none'),
            minHeight: HEADER_H,
          }}
        >
          <CollapsiblePanelHeader
            collapsed={previewCollapsed}
            onToggle={() => setPreviewCollapsed(!previewCollapsed)}
            icon={<Palette className="w-4 h-4 ml-0.5" />}
            title="TILESET"
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

        {/* Drag handle between Tileset and Active Selection */}
        {showDragHandle2 ? (
          <div
            onPointerDown={makeDragBottomHandle(setActiveSelectionH, previewCollapsed, activeSelectionCollapsed)}
            className="relative h-px w-full shrink-0 bg-sidebar-border group"
          >
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-4 cursor-ns-resize z-50" />
          </div>
        ) : (
          <div className="h-px shrink-0 bg-sidebar-border" />
        )}

        {/* 3. Active Selection Panel */}
        <div
          data-panel-section
          className={`flex flex-col bg-card/40 overflow-hidden border-t border-sidebar-border ${transitionClass}`}
          style={{
            height: activeSelectionCollapsed ? HEADER_H : (lastExpanded === 'activeSelection' && !tilesetExpanded ? undefined : activeSelectionH),
            flex: activeSelectionCollapsed ? 'none' : (lastExpanded === 'activeSelection' && !tilesetExpanded ? '1 1 0%' : 'none'),
            minHeight: HEADER_H,
          }}
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
      </div>
    </ResizablePanel>
  )
}
