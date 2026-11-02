import { ChevronRight, ChevronDown, Folder as FolderIcon, LayoutGrid, XSquare } from 'lucide-react'
import { TilesetData } from '@/types/editor'

interface TilesetsPanelProps {
  tilesets: TilesetData[]
  folders: string[]
  activeTileset: TilesetData | null
  setActiveTileset: (t: TilesetData) => void
  expandedFolders: Set<string>
  toggleFolder: (folder: string) => void
  activeLayerType?: string | null
}

/**
 * Browse and choose: the tileset tree of the project. Importing, renaming, moving
 * into folders and deleting all happen in Database › Tilesets, which also rewrites the maps.
 */
export function TilesetsPanel({
  tilesets,
  folders,
  activeTileset,
  setActiveTileset,
  expandedFolders,
  toggleFolder,
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

          return (
            <div key={folder}>
              <div className="ed-row" role="button" aria-expanded={isExpanded} tabIndex={0} onClick={() => toggleFolder(folder)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleFolder(folder)}>
                {isExpanded ? <ChevronDown className="text-muted-foreground" /> : <ChevronRight className="text-muted-foreground" />}
                <FolderIcon className="text-primary" />
                <span className="ed-row-label" title={folderName}>{folderName}</span>
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
            role="button"
            tabIndex={0}
            onClick={() => setActiveTileset(t)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setActiveTileset(t)}
            className="ed-row ed-indent !w-[calc(100%-16px)]"
            data-selected={activeTileset?.fileName === t.fileName ? 'true' : undefined}
          >
            <LayoutGrid className="opacity-80" />
            <span className="ed-row-label" title={t.name}>{t.name}</span>
          </div>
        ))}
      </div>
    )
  }

  if (activeLayerType === 'image') {
    return (
      <div className="ed-empty">
        <p>Image Layer</p>
        <p className="ed-hint">Images are not painted from tilesets. Use Add in the layer's properties, then click the map.</p>
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
        <p className="ed-hint">Import your first tileset in Database › Tilesets.</p>
      </div>
    )
  }

  return <>{renderTree(null)}</>
}
