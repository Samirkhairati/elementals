import React from 'react'
import {
  Folder as FolderIcon,
  ChevronRight,
  ChevronDown,
  Map as MapIcon,
  Plus,
  FolderPlus,
  Edit2,
  Trash2,
  Download,
} from 'lucide-react'
import { MapData } from '@/types/editor'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

interface MapsPanelProps {
  maps: MapData[]
  mapFolders: string[]
  activeMap: MapData | null
  expandedMapFolders: Set<string>
  selectedMapFolder: string | null
  setSelectedMapFolder: (v: string | null) => void
  toggleMapFolder: (folder: string) => void
  setCreateMapData: (v: { name: string; width: number; height: number }) => void
  setCreateMapDialog: (v: { open: boolean; parentPath?: string | null }) => void
  setCreateMapFolderName: (v: string) => void
  setCreateMapFolderDialog: (v: { open: boolean; parentPath?: string | null }) => void
  setRenameInput: (v: string) => void
  setRenameDialog: (v: any) => void
  handleDeleteMapFolder: (folderPath: string) => void
  handleDeleteMap: (folderPath: string | null, fileName: string) => void
  handleExportMap: (m: any) => void
  handleMapDrop: (e: React.DragEvent, targetFolder: string | null) => void
  onSelectMap: (m: MapData) => void
}

export function MapsPanel({
  maps,
  mapFolders,
  activeMap,
  expandedMapFolders,
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
}: MapsPanelProps) {
  const openCreateMap = (parentPath: string | null = null) => {
    setTimeout(() => {
      setCreateMapData({ name: '', width: 50, height: 50 })
      setCreateMapDialog({ open: true, parentPath })
    }, 0)
  }

  const openCreateFolder = (parentPath: string | null = null) => {
    setTimeout(() => {
      const depthFolders = mapFolders.filter((f) =>
        parentPath ? f.startsWith(parentPath + '/') : !f.includes('/')
      )
      setCreateMapFolderName(`Folder ${depthFolders.length + 1}`)
      setCreateMapFolderDialog({ open: true, parentPath })
    }, 0)
  }

  const renderMapTree = (currentPath: string | null, level: number = 0): React.ReactNode => {
    const childrenFolders = mapFolders.filter((f) => {
      if (currentPath === null) return !f.includes('/')
      return f.startsWith(currentPath + '/') && f.substring(currentPath.length + 1).indexOf('/') === -1
    })

    const childrenMaps = maps.filter((m) => m.folderPath === currentPath)

    return (
      <div className="space-y-0.5">
        {childrenFolders.map((folder) => {
          const folderName = folder.split('/').pop() || folder
          const isExpanded = expandedMapFolders.has(folder)

          return (
            <div key={folder} className="group/folder">
              <ContextMenu>
                <ContextMenuTrigger>
                  <div
                    className="flex items-center py-1.5 px-2 rounded-md cursor-pointer text-sm transition-colors select-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleMapDrop(e, folder)}
                    onClick={() => {
                      toggleMapFolder(folder)
                    }}
                  >
                    <div className="flex items-center flex-1 min-w-0">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 mr-1 shrink-0 opacity-70" />
                      ) : (
                        <ChevronRight className="w-4 h-4 mr-1 shrink-0 opacity-70" />
                      )}
                      <FolderIcon className="w-4 h-4 mr-2 shrink-0 text-primary" />
                      <span className="truncate">{folderName}</span>
                    </div>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48">
                  <ContextMenuItem onClick={() => openCreateMap(folder)}>
                    <Plus className="w-3.5 h-3.5 mr-2" />
                    New Map
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => openCreateFolder(folder)}>
                    <FolderPlus className="w-3.5 h-3.5 mr-2" />
                    New Subfolder
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onClick={() => {
                      setTimeout(() => {
                        setRenameInput(folderName)
                        setRenameDialog({ open: true, type: 'map-folder', oldPath: folder })
                      }, 0)
                    }}
                  >
                    <Edit2 className="w-3.5 h-3.5 mr-2" />
                    Rename
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => {
                      setTimeout(() => {
                        handleDeleteMapFolder(folder)
                      }, 0)
                    }}
                    className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                    Delete Folder
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>

              {isExpanded && (
                <div className="relative pl-3 ml-2.5 border-l border-white/0 hover:border-white/30 group-hover/folder:border-white/20 transition-colors mt-0.5 space-y-0.5">
                  {renderMapTree(folder, level + 1)}
                </div>
              )}
            </div>
          )
        })}

        {childrenMaps.map((m) => {
          const isSelected =
            activeMap?.fileName === m.fileName &&
            (activeMap?.folderPath || null) === (m.folderPath || null)

          return (
            <ContextMenu key={m.fileName}>
              <ContextMenuTrigger>
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('mapFileName', m.fileName)
                    e.dataTransfer.setData('mapSourceFolder', String(m.folderPath))
                  }}
                  onClick={() => onSelectMap(m)}
                  className={`flex items-center py-1.5 px-2 rounded-md cursor-pointer text-sm transition-colors select-none ${
                    isSelected
                      ? 'bg-primary/30 text-primary-foreground font-medium border border-primary/40'
                      : 'hover:bg-sidebar-accent text-sidebar-foreground'
                  }`}
                >
                  <div className="w-4 h-4 mr-1 shrink-0 opacity-0" />
                  <MapIcon className="w-4 h-4 mr-2 shrink-0 opacity-80" />
                  <span className="flex-1 truncate">{m.name}</span>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-44">
                <ContextMenuItem
                  onClick={() => {
                    setTimeout(() => {
                      setRenameInput(m.name)
                      setRenameDialog({
                        open: true,
                        type: 'map',
                        oldName: m.name,
                        oldPath: m.fileName,
                        targetFolder: m.folderPath,
                      })
                    }, 0)
                  }}
                >
                  <Edit2 className="w-3.5 h-3.5 mr-2" />
                  Rename
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleExportMap(m)}>
                  <Download className="w-3.5 h-3.5 mr-2" />
                  Export Map
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={() => {
                    setTimeout(() => {
                      handleDeleteMap(m.folderPath, m.fileName)
                    }, 0)
                  }}
                  className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  Delete Map
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          )
        })}
      </div>
    )
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger className="block min-h-full h-full w-full">
        <div
          className="min-h-full h-full w-full space-y-1"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleMapDrop(e, null)}
        >
          {renderMapTree(null, 0)}
          {maps.length === 0 && mapFolders.length === 0 && (
            <div className="h-40 flex items-center justify-center text-muted-foreground p-4 text-center">
              <p className="text-xs">Right-click here to create a map or folder.</p>
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onClick={() => openCreateMap(null)}>
          <Plus className="w-3.5 h-3.5 mr-2" />
          New Map
        </ContextMenuItem>
        <ContextMenuItem onClick={() => openCreateFolder(null)}>
          <FolderPlus className="w-3.5 h-3.5 mr-2" />
          New Folder
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
