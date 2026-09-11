import { Plus, FolderPlus, Folder as FolderIcon, ChevronRight, ChevronDown, LayoutGrid, Edit2, Trash2, XSquare } from 'lucide-react'
import { TilesetData } from '@/types/editor'

interface TilesetsPanelProps {
  tilesets: TilesetData[]
  folders: string[]
  activeTileset: TilesetData | null
  setActiveTileset: (t: TilesetData) => void
  expandedFolders: Set<string>
  selectedFolder: string | null
  setSelectedFolder: (v: string | null) => void
  toggleFolder: (folder: string) => void
  handlePickFile: (targetFolder: string | null) => void
  handleOpenCreateFolderDialog: (parentPath: string | null) => void
  setRenameInput: (v: string) => void
  setRenameDialog: (v: any) => void
  handleDeleteFolder: (folderPath: string) => void
  handleDrop: (e: React.DragEvent, targetFolder: string | null) => void
  activeLayerType?: string | null
}

export function TilesetsPanel({
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
}: TilesetsPanelProps) {
  const renderTree = (currentPath: string | null, level: number = 0): React.ReactNode => {
    const childrenFolders = folders.filter(f => {
      if (currentPath === null) return !f.includes('/')
      return f.startsWith(currentPath + '/') && f.substring(currentPath.length + 1).indexOf('/') === -1
    })

    const childrenTilesets = tilesets.filter(t => t.folderPath === currentPath)

    return (
      <div className="space-y-1" style={{ paddingLeft: level === 0 ? 0 : 16 }}>
        {childrenFolders.map(folder => {
          const folderName = folder.split('/').pop() || folder
          const isExpanded = expandedFolders.has(folder)
          const hasSubfolders = folders.some(sub => sub.startsWith(folder + '/'))
          const hasTilesets = tilesets.some(t => t.folderPath === folder || (t.folderPath && t.folderPath.startsWith(folder + '/')))
          const isEmpty = !hasSubfolders && !hasTilesets
          const isSelected = selectedFolder === folder

          return (
            <div key={folder}>
              <div
                className={`flex items-center group py-1 px-2 rounded-md cursor-pointer text-sm transition-colors ${isSelected ? 'bg-sidebar-accent font-medium text-sidebar-foreground ring-1 ring-sidebar-ring' : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, folder)}
                onClick={() => { setSelectedFolder(folder); toggleFolder(folder); }}
              >
                <div className="flex-1 flex items-center">
                  {isExpanded ? <ChevronDown className="w-4 h-4 mr-1 opacity-70" /> : <ChevronRight className="w-4 h-4 mr-1 opacity-70" />}
                  <FolderIcon className="w-4 h-4 mr-2 text-primary" />
                  <span>{folderName}</span>
                </div>
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); handlePickFile(folder); }} className="p-1 hover:bg-black/10 rounded" title="Add Tileset"><Plus className="w-3 h-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleOpenCreateFolderDialog(folder); }} className="p-1 hover:bg-black/10 rounded" title="New Subfolder"><FolderPlus className="w-3 h-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); setRenameInput(folderName); setRenameDialog({ open: true, type: 'folder', oldPath: folder }); }} className="p-1 hover:bg-black/10 rounded" title="Rename"><Edit2 className="w-3 h-3" /></button>
                  {isEmpty && (
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder); }} className="p-1 hover:bg-red-500/20 hover:text-red-400 rounded text-red-400" title="Delete Empty Folder (Delete key)">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              {isExpanded && (
                <div className="mt-1">
                  {renderTree(folder, level + 1)}
                </div>
              )}
            </div>
          )
        })}

        {childrenTilesets.map(t => (
          <div
            key={t.fileName}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('fileName', t.fileName)
              e.dataTransfer.setData('sourceFolder', String(t.folderPath))
            }}
            onClick={() => setActiveTileset(t)}
            className={`flex items-center group py-1.5 px-2.5 rounded-md cursor-pointer text-sm ml-5 border ${activeTileset?.fileName === t.fileName ? 'bg-primary/30 text-primary-foreground font-medium border-primary/40' : 'border-transparent hover:bg-sidebar-accent text-sidebar-foreground'}`}
          >
            <LayoutGrid className="w-4 h-4 mr-2 opacity-80" />
            <span className="flex-1 truncate">{t.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); setRenameInput(t.name); setRenameDialog({ open: true, type: 'tileset', oldName: t.name, oldPath: t.fileName, targetFolder: t.folderPath }) }}
              className="opacity-0 group-hover:opacity-100 block p-1 hover:bg-black/10 rounded transition-opacity"
            >
              <Edit2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    )
  }

  if (activeLayerType === 'collision') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center space-y-2 font-mono">
        <XSquare className="w-8 h-8 text-red-500/50 mb-2" />
        <p className="text-sm text-red-400">Collision Layer</p>
        <p className="text-xs">Select a tile layer to view tilesets.</p>
      </div>
    )
  }

  if (folders.length === 0 && tilesets.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center space-y-2 font-mono">
        <p className="text-sm">No tilesets yet.</p>
        <p className="text-xs">Click Add to import your first spritesheet.</p>
      </div>
    )
  }

  return <>{renderTree(null)}</>
}
