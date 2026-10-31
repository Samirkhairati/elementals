import React, { useState } from 'react'
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

function RootContextMenuContent({
  onOpenCreateMap,
  onOpenCreateFolder,
}: {
  onOpenCreateMap: () => void
  onOpenCreateFolder: () => void
}) {
  return (
    <ContextMenuContent className="w-44">
      <ContextMenuItem onClick={onOpenCreateMap}>
        <Plus className="w-3.5 h-3.5 mr-2" />
        New Map
      </ContextMenuItem>
      <ContextMenuItem onClick={onOpenCreateFolder}>
        <FolderPlus className="w-3.5 h-3.5 mr-2" />
        New Folder
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

interface MapsPanelProps {
  maps: MapData[]
  mapFolders: string[]
  activeMap: MapData | null
  expandedMapFolders: Set<string>
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
  const [draggedFileName, setDraggedFileName] = useState<string | null>(null)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  const [mapDropTarget, setMapDropTarget] = useState<{
    fileName: string
    position: 'top' | 'bottom'
  } | null>(null)

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

  const handleDragEnd = () => {
    setDraggedFileName(null)
    setDragOverFolder(null)
    setMapDropTarget(null)
  }

  const renderMapTree = (currentPath: string | null, level: number = 0): React.ReactNode => {
    const childrenFolders = mapFolders.filter((f) => {
      if (currentPath === null) return !f.includes('/')
      return f.startsWith(currentPath + '/') && f.substring(currentPath.length + 1).indexOf('/') === -1
    })

    const childrenMaps = maps.filter((m) => m.folderPath === currentPath)

    if (currentPath !== null && childrenFolders.length === 0 && childrenMaps.length === 0) {
      return null
    }

    return (
      <div className="flex flex-col gap-0.5">
        {childrenFolders.map((folder) => {
          const folderName = folder.split('/').pop() || folder
          const isExpanded = expandedMapFolders.has(folder)
          const isFolderDropTarget = dragOverFolder === folder

          const subFolders = mapFolders.filter(
            (f) => f.startsWith(folder + '/') && f.substring(folder.length + 1).indexOf('/') === -1
          )
          const subMaps = maps.filter((m) => m.folderPath === folder)
          const hasChildren = subFolders.length > 0 || subMaps.length > 0

          return (
            <div key={folder} className="group/folder">
              <ContextMenu>
                <ContextMenuTrigger>
                  <div
                    className="ed-row"
                    data-drop={isFolderDropTarget ? 'true' : undefined}
                    onDragOver={(e) => {
                      e.preventDefault()
                      setDragOverFolder(folder)
                      setMapDropTarget(null)
                    }}
                    onDragLeave={() => {
                      if (dragOverFolder === folder) setDragOverFolder(null)
                    }}
                    onDrop={(e) => {
                      setDragOverFolder(null)
                      setMapDropTarget(null)
                      handleMapDrop(e, folder)
                    }}
                    onClick={() => {
                      toggleMapFolder(folder)
                    }}
                  >
                    {isExpanded ? (
                      <ChevronDown className="text-muted-foreground" />
                    ) : (
                      <ChevronRight className="text-muted-foreground" />
                    )}
                    <FolderIcon className="text-primary" />
                    <span className="ed-row-label" title={folderName}>{folderName}</span>
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

              {isExpanded && hasChildren && (
                <div className="ed-tree-children mt-0.5">
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
          const isMapDropTarget =
            mapDropTarget?.fileName === m.fileName && draggedFileName !== m.fileName

          return (
            <ContextMenu key={m.fileName}>
              <ContextMenuTrigger>
                <div
                  draggable
                  onDragStart={(e) => {
                    setDraggedFileName(m.fileName)
                    e.dataTransfer.setData('mapFileName', m.fileName)
                    e.dataTransfer.setData('mapSourceFolder', String(m.folderPath))
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    if (draggedFileName === m.fileName) return
                    const rect = e.currentTarget.getBoundingClientRect()
                    const isTop = e.clientY - rect.top < rect.height / 2
                    setMapDropTarget({ fileName: m.fileName, position: isTop ? 'top' : 'bottom' })
                    setDragOverFolder(null)
                  }}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => {
                    setMapDropTarget(null)
                    setDraggedFileName(null)
                    handleMapDrop(e, m.folderPath)
                  }}
                  onClick={() => onSelectMap(m)}
                  className="ed-row"
                  data-selected={isSelected ? 'true' : undefined}
                >
                  {/* Horizontal drag indicator line */}
                  {isMapDropTarget && (
                    <div
                      className={`absolute left-0 right-0 h-[2px] bg-primary z-30 pointer-events-none rounded-full ${
                        mapDropTarget.position === 'top' ? '-top-[2px]' : '-bottom-[2px]'
                      }`}
                    />
                  )}

                  <MapIcon className="opacity-80" />
                  <span className="ed-row-label" title={m.name}>{m.name}</span>
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

  if (maps.length === 0 && mapFolders.length === 0) {
    return (
      <ContextMenu>
        <ContextMenuTrigger className="block h-full w-full">
          <div
            className="ed-empty"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              setDragOverFolder(null)
              setMapDropTarget(null)
              handleMapDrop(e, null)
            }}
          >
            <p>Right-click here to create a map or folder.</p>
          </div>
        </ContextMenuTrigger>
        <RootContextMenuContent
          onOpenCreateMap={() => openCreateMap(null)}
          onOpenCreateFolder={() => openCreateFolder(null)}
        />
      </ContextMenu>
    )
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger className="block min-h-full h-full w-full">
        <div
          className="flex min-h-full h-full w-full flex-col gap-0.5"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            setDragOverFolder(null)
            setMapDropTarget(null)
            handleMapDrop(e, null)
          }}
        >
          {renderMapTree(null, 0)}
        </div>
      </ContextMenuTrigger>
      <RootContextMenuContent
        onOpenCreateMap={() => openCreateMap(null)}
        onOpenCreateFolder={() => openCreateFolder(null)}
      />
    </ContextMenu>
  )
}
