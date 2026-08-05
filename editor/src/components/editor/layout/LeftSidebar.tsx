import React from 'react'
import { Plus, FolderPlus, Map as MapIcon, Layers as LayersIcon, Settings2 } from "lucide-react"
import { ResizablePanel as OriginalResizablePanel } from "@/components/ui/resizable"
const ResizablePanel = OriginalResizablePanel as any

import { Layer, MapData } from '@/types/editor'
import { MapsPanel } from '@/components/editor/panels/MapsPanel'
import { LayersPanel } from '@/components/editor/panels/LayersPanel'
import { PropertiesPanel } from '@/components/editor/panels/PropertiesPanel'
import { CollapsiblePanelHeader } from './CollapsiblePanelHeader'
import { useDragResize } from '@/hooks/useDragResize'

const HEADER_H = 40

interface LeftSidebarProps {
  mapsCollapsed: boolean
  setMapsCollapsed: (v: boolean) => void
  mapsH: number
  setMapsH: React.Dispatch<React.SetStateAction<number>>
  layersCollapsed: boolean
  setLayersCollapsed: (v: boolean) => void
  layersH: number
  setLayersH: React.Dispatch<React.SetStateAction<number>>
  propertiesCollapsed: boolean
  setPropertiesCollapsed: (v: boolean) => void
  makeDragHandle: (setHeight: React.Dispatch<React.SetStateAction<number>>, isTopCollapsed: boolean, isBottomCollapsed: boolean) => (e: React.PointerEvent<HTMLDivElement>) => void
  // Maps props
  maps: MapData[]
  mapFolders: string[]
  activeMap: MapData | null
  expandedMapFolders: Set<string>
  selectedMapFolder: string | null
  setSelectedMapFolder: (f: string | null) => void
  toggleMapFolder: (f: string) => void
  setCreateMapData: React.Dispatch<React.SetStateAction<{ name: string; width: number; height: number }>>
  setCreateMapDialog: React.Dispatch<React.SetStateAction<{ open: boolean; parentPath?: string | null }>>
  setCreateMapFolderName: (name: string) => void
  setCreateMapFolderDialog: React.Dispatch<React.SetStateAction<{ open: boolean; parentPath?: string | null }>>
  setRenameInput: (input: string) => void
  setRenameDialog: React.Dispatch<React.SetStateAction<{ open: boolean; type: 'folder' | 'tileset' | 'map-folder' | 'map'; oldPath?: string; oldName?: string; targetFolder?: string | null }>>
  handleDeleteMapFolder: (folderPath: string) => void
  handleDeleteMap: (folderPath: string | null, fileName: string) => void
  handleExportMap: (m: any) => void
  handleMapDrop: (e: React.DragEvent, targetFolder: string | null) => void
  onSelectMap: (m: MapData) => void
  // Layers props
  layers: Layer[]
  activeLayerId: string | null
  setActiveLayerId: (id: string | null) => void
  toggleLayerVisibility: (id: string) => void
  toggleLayerLock: (id: string) => void
  handleDeleteLayer: (id: string) => void
  handleReorderLayers: (newLayers: Layer[]) => void
  handleCreateLayer: () => void
  // Properties props
  updateLayers: (newLayers: Layer[]) => void
}

export function LeftSidebar({
  mapsCollapsed,
  setMapsCollapsed,
  mapsH,
  setMapsH,
  layersCollapsed,
  setLayersCollapsed,
  layersH,
  setLayersH,
  propertiesCollapsed,
  setPropertiesCollapsed,
  maps,
  mapFolders,
  activeMap,
  expandedMapFolders,
  selectedMapFolder,
  setSelectedMapFolder,
  toggleMapFolder,
  setCreateMapData,
  setCreateMapDialog,
  setCreateMapFolderName,
  setCreateMapFolderDialog,
  setRenameInput,
  setRenameDialog,
  handleDeleteMapFolder,
  handleDeleteMap,
  handleExportMap,
  handleMapDrop,
  onSelectMap,
  layers,
  activeLayerId,
  setActiveLayerId,
  toggleLayerVisibility,
  toggleLayerLock,
  handleDeleteLayer,
  handleReorderLayers,
  handleCreateLayer,
  updateLayers
}: LeftSidebarProps) {
  const { isDragging, makeDragTopHandle } = useDragResize()

  const expandedSections: string[] = []
  if (!mapsCollapsed) expandedSections.push('maps')
  if (!layersCollapsed) expandedSections.push('layers')
  if (!propertiesCollapsed) expandedSections.push('properties')
  const lastExpanded = expandedSections.length > 0 ? expandedSections[expandedSections.length - 1] : null

  const showDragHandle1 = !mapsCollapsed && !layersCollapsed
  const showDragHandle2 = !layersCollapsed && !propertiesCollapsed

  const transitionClass = isDragging ? 'transition-none' : 'transition-[height,flex] duration-200 ease-in-out'

  return (
    <ResizablePanel defaultSize="20%" minSize="15%" maxSize="30%" className="flex flex-col z-10 shadow-xl bg-sidebar-background border-r border-border min-w-0 min-h-0">
      <div className="flex flex-col h-full w-full overflow-hidden">
        {/* Maps Panel */}
        <div
          data-panel-section
          className={`flex flex-col overflow-hidden ${transitionClass}`}
          style={{
            height: mapsCollapsed ? HEADER_H : (lastExpanded === 'maps' ? undefined : mapsH),
            flex: mapsCollapsed ? 'none' : (lastExpanded === 'maps' ? '1 1 0%' : 'none'),
            minHeight: HEADER_H,
          }}
        >
          <CollapsiblePanelHeader
            collapsed={mapsCollapsed}
            onToggle={() => setMapsCollapsed(!mapsCollapsed)}
            icon={<MapIcon className="w-4 h-4 ml-0.5" />}
            title="MAPS"
            actions={
              <>
                <button
                  onClick={() => {
                    setCreateMapFolderName(`Folder ${mapFolders.length + 1}`)
                    setCreateMapFolderDialog({ open: true, parentPath: null })
                  }}
                  className="p-1.5 hover:bg-sidebar-accent rounded-md text-sidebar-foreground"
                  title="New Folder"
                >
                  <FolderPlus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setCreateMapData({ name: '', width: 50, height: 50 })
                    setCreateMapDialog({ open: true, parentPath: null })
                  }}
                  className="p-1.5 hover:bg-sidebar-accent rounded-md text-sidebar-foreground"
                  title="New Map"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </>
            }
          />
          {!mapsCollapsed && (
            <div className="flex-1 overflow-y-auto p-2 font-mono text-xs min-h-0">
              <MapsPanel
                maps={maps}
                mapFolders={mapFolders}
                activeMap={activeMap}
                expandedMapFolders={expandedMapFolders}
                selectedMapFolder={selectedMapFolder}
                setSelectedMapFolder={setSelectedMapFolder}
                toggleMapFolder={toggleMapFolder}
                setCreateMapData={setCreateMapData}
                setCreateMapDialog={setCreateMapDialog}
                setCreateMapFolderName={setCreateMapFolderName}
                setCreateMapFolderDialog={setCreateMapFolderDialog}
                setRenameInput={setRenameInput}
                setRenameDialog={setRenameDialog}
                handleDeleteMapFolder={handleDeleteMapFolder}
                handleDeleteMap={handleDeleteMap}
                handleExportMap={handleExportMap}
                handleMapDrop={handleMapDrop}
                onSelectMap={onSelectMap}
              />
            </div>
          )}
        </div>

        {/* Drag handle between Maps and Layers */}
        {showDragHandle1 ? (
          <div
            onPointerDown={makeDragTopHandle(setMapsH, mapsCollapsed, layersCollapsed)}
            className="relative h-px w-full shrink-0 bg-sidebar-border group"
          >
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-4 cursor-ns-resize z-50" />
          </div>
        ) : (
          <div className="h-px shrink-0 bg-sidebar-border" />
        )}

        {/* Layers Panel */}
        <div
          data-panel-section
          className={`flex flex-col overflow-hidden ${transitionClass}`}
          style={{
            height: layersCollapsed ? HEADER_H : (lastExpanded === 'layers' ? undefined : layersH),
            flex: layersCollapsed ? 'none' : (lastExpanded === 'layers' ? '1 1 0%' : 'none'),
            minHeight: HEADER_H,
          }}
        >
          <CollapsiblePanelHeader
            collapsed={layersCollapsed}
            onToggle={() => setLayersCollapsed(!layersCollapsed)}
            icon={<LayersIcon className="w-4 h-4 ml-0.5" />}
            title="LAYERS"
            actions={
              <button
                onClick={() => {
                  if (!activeMap) {
                    alert("Please select a map first")
                    return
                  }
                  handleCreateLayer()
                }}
                className="p-1.5 hover:bg-sidebar-accent rounded-md text-sidebar-foreground"
                title="New Layer"
              >
                <Plus className="w-4 h-4" />
              </button>
            }
          />
          {!layersCollapsed && (
            <div className="flex-1 overflow-y-auto p-2 font-mono text-xs min-h-0">
              <LayersPanel
                layers={layers}
                activeLayerId={activeLayerId}
                setActiveLayerId={setActiveLayerId}
                toggleLayerVisibility={toggleLayerVisibility}
                toggleLayerLock={toggleLayerLock}
                deleteLayer={handleDeleteLayer}
                reorderLayers={handleReorderLayers}
              />
            </div>
          )}
        </div>

        {/* Drag handle between Layers and Properties */}
        {showDragHandle2 ? (
          <div
            onPointerDown={makeDragTopHandle(setLayersH, layersCollapsed, propertiesCollapsed)}
            className="relative h-px w-full shrink-0 bg-sidebar-border group"
          >
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-4 cursor-ns-resize z-50" />
          </div>
        ) : (
          <div className="h-px shrink-0 bg-sidebar-border" />
        )}

        {/* Properties Panel */}
        <div
          data-panel-section
          className={`flex flex-col bg-card/40 overflow-hidden ${transitionClass} min-h-[40px]`}
          style={{
            height: propertiesCollapsed ? HEADER_H : undefined,
            flex: propertiesCollapsed ? 'none' : '1 1 0%',
            minHeight: HEADER_H,
          }}
        >
          <CollapsiblePanelHeader
            collapsed={propertiesCollapsed}
            onToggle={() => setPropertiesCollapsed(!propertiesCollapsed)}
            icon={<Settings2 className="w-4 h-4 ml-0.5" />}
            title="PROPERTIES"
          />
          {!propertiesCollapsed && (
            <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-start text-xs text-muted-foreground text-center min-h-0">
              <PropertiesPanel layers={layers} activeLayerId={activeLayerId} updateLayers={updateLayers} />
            </div>
          )}
        </div>
      </div>
    </ResizablePanel>
  )
}
