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
      <div className="flex flex-col gap-0.5" style={{ paddingLeft: level === 0 ? 0 : 16 }}>
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
                className="ed-row group"
                data-selected={isSelected ? 'true' : undefined}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, folder)}
                onClick={() => { setSelectedFolder(folder); toggleFolder(folder); }}
              >
                {isExpanded ? <ChevronDown className="text-muted-foreground" /> : <ChevronRight className="text-muted-foreground" />}
                <FolderIcon className="text-primary" />
                <span className="ed-row-label" title={folderName}>{folderName}</span>
                <div className="ed-row-actions opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={(e) => { e.stopPropagation(); handlePickFile(folder); }} className="ed-iconbtn" title="Add Tileset" aria-label="Add tileset"><Plus /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleOpenCreateFolderDialog(folder); }} className="ed-iconbtn" title="New Subfolder" aria-label="New subfolder"><FolderPlus /></button>
                  <button onClick={(e) => { e.stopPropagation(); setRenameInput(folderName); setRenameDialog({ open: true, type: 'folder', oldPath: folder }); }} className="ed-iconbtn" title="Rename" aria-label="Rename folder"><Edit2 /></button>
                  {isEmpty && (
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder); }} className="ed-iconbtn" data-tone="danger" title="Delete Empty Folder (Delete key)" aria-label="Delete folder"><Trash2 /></button>
                  )}
                </div>
              </div>
              {isExpanded && !isEmpty && (
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
            className="ed-row ed-indent group !w-[calc(100%-16px)]"
            data-selected={activeTileset?.fileName === t.fileName ? 'true' : undefined}
          >
            <LayoutGrid className="opacity-80" />
            <span className="ed-row-label" title={t.name}>{t.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); setRenameInput(t.name); setRenameDialog({ open: true, type: 'tileset', oldName: t.name, oldPath: t.fileName, targetFolder: t.folderPath }) }}
              className="ed-iconbtn opacity-0 transition-opacity group-hover:opacity-100"
              title="Rename"
              aria-label="Rename tileset"
            >
              <Edit2 />
            </button>
          </div>
        ))}
      </div>
    )
  }

  if (activeLayerType === 'collision') {
    return (
      <div className="ed-empty">
        <XSquare className="mb-1 h-6 w-6 text-red-500/50" />
        <p className="text-red-400">Collision Layer</p>
        <p className="ed-hint">Select a tile layer to view tilesets.</p>
      </div>
    )
  }

  if (folders.length === 0 && tilesets.length === 0) {
    return (
      <div className="ed-empty">
        <p>No tilesets yet.</p>
        <p className="ed-hint">Click Add to import your first spritesheet.</p>
      </div>
    )
  }

  return <>{renderTree(null)}</>
}
