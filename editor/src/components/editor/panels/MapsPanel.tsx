import { Plus, FolderPlus, Folder as FolderIcon, ChevronRight, ChevronDown, FileImage, Edit2, Trash2, Download } from 'lucide-react'
import { MapData } from '@/types/editor'

interface MapsPanelProps {
  maps: any[]
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
  onSelectMap: (m: any) => void
}

export function MapsPanel({
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
}: MapsPanelProps) {
  const renderMapTree = (currentPath: string | null, level: number = 0): React.ReactNode => {
    const childrenFolders = mapFolders.filter(f => {
      if (currentPath === null) return !f.includes('/')
      return f.startsWith(currentPath + '/') && f.substring(currentPath.length + 1).indexOf('/') === -1
    })

    const childrenMaps = maps.filter(m => m.folderPath === currentPath)

    return (
      <div className="space-y-1" style={{ paddingLeft: level === 0 ? 0 : 16 }}>
        {childrenFolders.map(folder => {
          const folderName = folder.split('/').pop() || folder
          const isExpanded = expandedMapFolders.has(folder)
          const hasSubfolders = mapFolders.some(sub => sub.startsWith(folder + '/'))
          const hasMaps = maps.some(m => m.folderPath === folder || (m.folderPath && m.folderPath.startsWith(folder + '/')))
          const isEmpty = !hasSubfolders && !hasMaps
          const isSelected = selectedMapFolder === folder

          return (
            <div key={folder}>
              <div
                className={`flex items-center group py-1 px-2 rounded-md cursor-pointer text-sm transition-colors ${isSelected ? 'bg-sidebar-accent font-medium text-sidebar-foreground ring-1 ring-sidebar-ring' : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleMapDrop(e, folder)}
                onClick={() => { setSelectedMapFolder(folder); toggleMapFolder(folder); }}
              >
                <div className="flex-1 flex items-center">
                  {isExpanded ? <ChevronDown className="w-4 h-4 mr-1 opacity-70" /> : <ChevronRight className="w-4 h-4 mr-1 opacity-70" />}
                  <FolderIcon className="w-4 h-4 mr-2 text-blue-500" />
                  <span>{folderName}</span>
                </div>
                <div className="hidden group-hover:flex items-center gap-1">
                  <button onClick={(e) => { e.stopPropagation(); setCreateMapData({ name: '', width: 50, height: 50 }); setCreateMapDialog({ open: true, parentPath: folder }); }} className="p-1 hover:bg-black/10 rounded" title="New Map"><Plus className="w-3 h-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); setCreateMapFolderName(`Folder ${mapFolders.length + 1}`); setCreateMapFolderDialog({ open: true, parentPath: folder }); }} className="p-1 hover:bg-black/10 rounded" title="New Subfolder"><FolderPlus className="w-3 h-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); setRenameInput(folderName); setRenameDialog({ open: true, type: 'map-folder', oldPath: folder }); }} className="p-1 hover:bg-black/10 rounded" title="Rename"><Edit2 className="w-3 h-3" /></button>
                  {isEmpty && (
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteMapFolder(folder); }} className="p-1 hover:bg-red-500/20 hover:text-red-400 rounded text-red-400" title="Delete Empty Folder">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              {isExpanded && renderMapTree(folder, level + 1)}
            </div>
          )
        })}

        {childrenMaps.map(m => (
          <div
            key={m.fileName}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('mapFileName', m.fileName)
              e.dataTransfer.setData('mapSourceFolder', String(m.folderPath))
            }}
            onClick={() => onSelectMap(m)}
            className={`flex items-center group py-1.5 px-2.5 rounded-md cursor-pointer text-sm ml-5 transition-colors ${activeMap?.fileName === m.fileName ? 'bg-primary/30 text-primary-foreground font-medium border border-primary/40' : 'hover:bg-sidebar-accent text-sidebar-foreground'}`}
          >
            <FileImage className="w-4 h-4 mr-2 opacity-80" />
            <span className="flex-1 truncate">{m.name}</span>
            <div className="hidden group-hover:flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); handleExportMap(m) }}
                className="p-1 hover:bg-black/10 rounded" title="Export Map"
              >
                <Download className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setRenameInput(m.name); setRenameDialog({ open: true, type: 'map', oldName: m.name, oldPath: m.fileName, targetFolder: m.folderPath }) }}
                className="p-1 hover:bg-black/10 rounded" title="Rename Map"
              >
                <Edit2 className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteMap(m.folderPath, m.fileName) }}
                className="p-1 hover:bg-red-500/20 hover:text-red-400 rounded text-red-400" title="Delete Map"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return <>{renderMapTree(null)}</>
}
