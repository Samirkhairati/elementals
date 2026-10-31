import React, { useState, useRef, useEffect } from 'react'
import {
  Edit2,
  Trash2,
  Copy,
  Plus,
  Sparkles,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  FolderInput,
  Zap,
} from 'lucide-react'
import { EntityData, ComponentType, EntityFolder } from '@/types/editor'
import { PRESET_PREFABS } from '@/lib/componentRegistry'
import { entityIconName, summarizeEntity } from '@/lib/entityVisuals'
import { openEventEditor } from '@/lib/openEventEditor'
import { useEditorSelector, type EditorContextValue } from '../layout/EditorContext'
import { Badge, IconButton } from '../ui/controls'
import { NamedIcon } from '../ui/icons'
import { SpriteThumb } from '../sprites/SpriteThumb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

interface EntitiesPanelProps {
  /** Whether a map is open (the panel only needs presence, not the map itself). */
  hasActiveMap: boolean
  entities: EntityData[]
  selectedEntityId: string | null
  setSelectedEntityId: (id: string | null) => void
  createEntity: (
    name: string,
    x?: number,
    y?: number,
    initialComponents?: Partial<Record<ComponentType, Record<string, any>>>,
    folderId?: string | null
  ) => void
  duplicateEntity: (id: string) => void
  deleteEntity: (id: string) => void
  renameEntity: (id: string, name: string) => void
  reorderEntities: (entities: EntityData[]) => void
  setConfirmDialog: (config: {
    open: boolean
    title: string
    description: string
    action: () => void
  }) => void
  startPlacement?: (template: { name: string; components?: any }) => void
  showEntities?: boolean
  toggleShowEntities?: () => void
  entityFolders?: EntityFolder[]
  createEntityFolder?: (name?: string) => void
  renameEntityFolder?: (folderId: string, newName: string) => void
  deleteEntityFolder?: (folderId: string) => void
  toggleEntityFolderVisibility?: (folderId: string) => void
  toggleEntityFolderExpanded?: (folderId: string) => void
  toggleEntityVisibility?: (entityId: string) => void
  moveEntityToFolder?: (entityId: string, folderId: string | null) => void
}

const selectSpriteAssets = (c: EditorContextValue) => c.spriteAssets

/** Sprite thumbnail when the entity has a sprite, otherwise the icon for what it is (npc, sign, warp ...). */
function EntityGlyph({ entity }: { entity: EntityData }) {
  const assets = useEditorSelector(selectSpriteAssets)
  const asset = entity.components.Sprite?.asset ? assets?.[entity.components.Sprite.asset] : undefined
  if (asset) return <SpriteThumb asset={asset} size={20} />
  return <NamedIcon name={entityIconName(entity)} className="text-muted-foreground" />
}

function EntityBadges({ entity }: { entity: EntityData }) {
  const s = summarizeEntity(entity)
  return (
    <>
      {s.hasEvent && (
        <Badge tone="event" title="Has an Event">
          <NamedIcon name="zap" />
        </Badge>
      )}
      {s.controller && s.controller !== 'none' && (
        <Badge tone="move" title={`Movement: ${s.controller}`}>
          <NamedIcon name="footprints" />
        </Badge>
      )}
      {s.solid === true && (
        <Badge tone="solid" title="Solid collider">
          solid
        </Badge>
      )}
      {s.solid === false && (
        <Badge tone="trigger" title="Trigger zone (not solid)">
          zone
        </Badge>
      )}
    </>
  )
}

export function EntitiesPanel({
  hasActiveMap,
  entities,
  selectedEntityId,
  setSelectedEntityId,
  createEntity,
  duplicateEntity,
  deleteEntity,
  renameEntity,
  reorderEntities,
  setConfirmDialog,
  startPlacement,
  showEntities = true,
  toggleShowEntities,
  entityFolders = [],
  createEntityFolder,
  renameEntityFolder,
  deleteEntityFolder,
  toggleEntityFolderVisibility,
  toggleEntityFolderExpanded,
  toggleEntityVisibility,
  moveEntityToFolder,
}: EntitiesPanelProps) {
  // Inline rename state for entities
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Inline rename state for folders
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState('')
  const folderInputRef = useRef<HTMLInputElement>(null)

  // Drag & drop state
  const [draggedEntityId, setDraggedEntityId] = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<{ id: string; position: 'top' | 'bottom' } | null>(null)

  useEffect(() => {
    if (editingEntityId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingEntityId])

  useEffect(() => {
    if (editingFolderId && folderInputRef.current) {
      folderInputRef.current.focus()
      folderInputRef.current.select()
    }
  }, [editingFolderId])

  const startEditingEntity = (entity: EntityData) => {
    setEditingEntityId(entity.id)
    setEditingName(entity.name)
  }

  const commitEditingEntity = (id: string) => {
    if (editingEntityId === id) {
      if (editingName.trim()) {
        renameEntity(id, editingName.trim())
      }
      setEditingEntityId(null)
    }
  }

  const startEditingFolder = (folder: EntityFolder) => {
    setEditingFolderId(folder.id)
    setEditingFolderName(folder.name)
  }

  const commitEditingFolder = (id: string) => {
    if (editingFolderId === id) {
      if (editingFolderName.trim()) {
        renameEntityFolder?.(id, editingFolderName.trim())
      }
      setEditingFolderId(null)
    }
  }

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedEntityId(id)
    e.dataTransfer.setData('entityId', id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOverEntity = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    if (draggedEntityId === targetId) return

    const rect = e.currentTarget.getBoundingClientRect()
    const isTop = e.clientY - rect.top < rect.height / 2
    setDragOverTarget({ id: targetId, position: isTop ? 'top' : 'bottom' })
  }

  const handleDragOverFolder = (e: React.DragEvent, folderId: string) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDragOverFolderId(folderId)
  }

  const handleDragEnd = () => {
    setDraggedEntityId(null)
    setDragOverTarget(null)
    setDragOverFolderId(null)
  }

  const handleDropOnEntity = (e: React.DragEvent, targetEntity: EntityData) => {
    e.preventDefault()
    e.stopPropagation()
    if (!draggedEntityId || draggedEntityId === targetEntity.id) return

    const srcIndex = entities.findIndex(ent => ent.id === draggedEntityId)
    const dstIndex = entities.findIndex(ent => ent.id === targetEntity.id)
    if (srcIndex === -1 || dstIndex === -1) return

    const newEntities = [...entities]
    const [moved] = newEntities.splice(srcIndex, 1)

    // Match folder of target entity
    moved.folder = targetEntity.folder || null

    let finalDstIndex = newEntities.findIndex(ent => ent.id === targetEntity.id)
    if (dragOverTarget?.position === 'bottom') {
      finalDstIndex += 1
    }
    newEntities.splice(finalDstIndex, 0, moved)

    reorderEntities(newEntities)
    setDraggedEntityId(null)
    setDragOverTarget(null)
    setDragOverFolderId(null)
  }

  const handleDropOnFolder = (e: React.DragEvent, folderId: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!draggedEntityId) return

    moveEntityToFolder?.(draggedEntityId, folderId)
    setDraggedEntityId(null)
    setDragOverTarget(null)
    setDragOverFolderId(null)
  }

  const confirmDeleteEntity = (entity: EntityData) => {
    setTimeout(() => {
      setConfirmDialog({
        open: true,
        title: 'Delete Entity',
        description: `Are you sure you want to delete entity "${entity.name}"?`,
        action: () => deleteEntity(entity.id),
      })
    }, 0)
  }

  const confirmDeleteFolder = (folder: EntityFolder) => {
    const count = entities.filter(e => e.folder === folder.id).length
    setTimeout(() => {
      setConfirmDialog({
        open: true,
        title: 'Delete Folder',
        description: `Are you sure you want to delete folder "${folder.name}"${
          count > 0 ? ` and move its ${count} entities to root?` : '?'
        }`,
        action: () => deleteEntityFolder?.(folder.id),
      })
    }, 0)
  }

  if (!hasActiveMap) {
    return (
      <div className="ed-empty">Select a map to view entities</div>
    )
  }

  const placeEmpty = (targetFolderId?: string | null) => {
    if (startPlacement) startPlacement({ name: 'New Entity' })
    else createEntity('New Entity', 0, 0, undefined, targetFolderId)
  }
  const placePrefab = (prefab: (typeof PRESET_PREFABS)[number], targetFolderId?: string | null) => {
    if (startPlacement) startPlacement({ name: prefab.name, components: prefab.components })
    else createEntity(prefab.name, 0, 0, prefab.components, targetFolderId)
  }

  const renderNewEntityMenuItems = (targetFolderId?: string | null) => (
    <>
      <ContextMenuItem onClick={() => placeEmpty(targetFolderId)}>
        <Plus className="ed-icon mr-2 text-primary" />
        Empty entity
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Sparkles className="ed-icon mr-2 text-amber-400" />
          From prefab
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-64">
          {PRESET_PREFABS.map((prefab) => (
            <ContextMenuItem key={prefab.id} onClick={() => placePrefab(prefab, targetFolderId)}>
              <NamedIcon name={prefab.icon} className="ed-icon mr-2 text-muted-foreground" />
              {prefab.name}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
    </>
  )

  const renderEntityRow = (entity: EntityData, isInsideFolder: boolean = false) => {
    const isEditing = editingEntityId === entity.id
    const isSelected = selectedEntityId === entity.id
    const isDropTarget = dragOverTarget?.id === entity.id && draggedEntityId !== entity.id
    const isVisible = entity.visible !== false

    return (
      <ContextMenu key={entity.id}>
        <ContextMenuTrigger>
          <div
            draggable={!isEditing}
            onDragStart={e => handleDragStart(e, entity.id)}
            onDragOver={e => handleDragOverEntity(e, entity.id)}
            onDragEnd={handleDragEnd}
            onDrop={e => handleDropOnEntity(e, entity)}
            onClick={() => setSelectedEntityId(entity.id)}
            onDoubleClick={() => startEditingEntity(entity)}
            className={`ed-row group ${isInsideFolder ? 'ed-indent !w-[calc(100%-16px)]' : ''}`}
            data-selected={isSelected ? 'true' : undefined}
            data-dim={!isVisible ? 'true' : undefined}
            data-testid={`entity-row-${entity.id}`}
          >
            {/* Horizontal drag indicator line */}
            {isDropTarget && (
              <div
                className={`pointer-events-none absolute left-0 right-0 z-30 h-[2px] rounded-full bg-primary ${
                  dragOverTarget.position === 'top' ? '-top-[2px]' : '-bottom-[2px]'
                }`}
              />
            )}

            <div className="flex h-5 w-5 shrink-0 items-center justify-center">
              <EntityGlyph entity={entity} />
            </div>

            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editingName}
                onChange={e => setEditingName(e.target.value)}
                onBlur={() => commitEditingEntity(entity.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitEditingEntity(entity.id)
                  if (e.key === 'Escape') setEditingEntityId(null)
                }}
                onClick={e => e.stopPropagation()}
                className="ed-input h-row-sm min-w-0 flex-1 border-primary/60"
              />
            ) : (
              <span className="ed-row-label" title={entity.name}>{entity.name}</span>
            )}

            <div className="ed-row-actions">
              <EntityBadges entity={entity} />
              <IconButton
                title={isVisible ? 'Hide entity' : 'Show entity'}
                aria-label={isVisible ? 'Hide entity' : 'Show entity'}
                onClick={e => {
                  e.stopPropagation()
                  toggleEntityVisibility?.(entity.id)
                }}
              >
                {isVisible ? <Eye /> : <EyeOff className="text-amber-400/90" />}
              </IconButton>
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-48 font-mono text-xs">
          {entity.components.Event && (
            <ContextMenuItem
              onClick={() => {
                setSelectedEntityId(entity.id)
                // let the inspector render the selected entity's Event card first
                openEventEditor(entity.id, 60)
              }}
            >
              <Zap className="ed-icon mr-2 text-blue-400" />
              Edit event…
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={() => startEditingEntity(entity)}>
            <Edit2 className="w-3.5 h-3.5 mr-2" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem onClick={() => duplicateEntity(entity.id)}>
            <Copy className="w-3.5 h-3.5 mr-2" />
            Duplicate
          </ContextMenuItem>
          <ContextMenuItem onClick={() => toggleEntityVisibility?.(entity.id)}>
            {isVisible ? <EyeOff className="w-3.5 h-3.5 mr-2" /> : <Eye className="w-3.5 h-3.5 mr-2" />}
            {isVisible ? 'Hide Entity' : 'Show Entity'}
          </ContextMenuItem>

          {entityFolders.length > 0 && (
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <FolderInput className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                Move to Folder
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-44 font-mono text-xs">
                <ContextMenuItem
                  disabled={!entity.folder}
                  onClick={() => moveEntityToFolder?.(entity.id, null)}
                >
                  Root (No Folder)
                </ContextMenuItem>
                <ContextMenuSeparator />
                {entityFolders.map(f => (
                  <ContextMenuItem
                    key={f.id}
                    disabled={entity.folder === f.id}
                    onClick={() => moveEntityToFolder?.(entity.id, f.id)}
                  >
                    {f.name}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}

          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => confirmDeleteEntity(entity)}
            className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
          >
            <Trash2 className="w-3.5 h-3.5 mr-2" />
            Delete Entity
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  const rootEntities = entities.filter(e => !e.folder)

  return (
    <div className="flex h-full w-full flex-col select-none text-ed-body">
      {/* Header: show/hide all + add */}
      <div className="mb-1 flex h-row shrink-0 items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggleShowEntities}
          className="ed-btn"
          data-size="sm"
          data-variant={showEntities ? 'primary' : undefined}
          title={showEntities ? 'Hide all entities on the canvas' : 'Show entities on the canvas'}
        >
          {showEntities ? <Eye /> : <EyeOff />}
          <span>Entities</span>
          <span className="ed-badge ml-1">{entities.length}</span>
        </button>

        <div className="flex items-center gap-1">
          <IconButton title="New entity folder" aria-label="New entity folder" onClick={() => createEntityFolder?.()}>
            <FolderPlus />
          </IconButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="ed-btn" data-size="sm" data-variant="primary" aria-label="Add entity">
                <Plus />
                Add
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 p-1" data-testid="add-entity-menu">
              <DropdownMenuLabel className="px-2 py-1 text-ed-label font-normal text-muted-foreground">
                Pick one, then click the map to place it
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => placeEmpty(null)} className="flex items-start gap-2 px-2 py-2" aria-label="Empty entity">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <Plus className="ed-icon" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-ed-body text-foreground">Empty entity</span>
                  <span className="block text-ed-label leading-4 text-muted-foreground">Just a position. Add the components you need.</span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {PRESET_PREFABS.map(prefab => (
                <DropdownMenuItem
                  key={prefab.id}
                  onClick={() => placePrefab(prefab, null)}
                  className="flex items-start gap-2 px-2 py-2"
                  aria-label={prefab.name}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <NamedIcon name={prefab.icon} className="ed-icon" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-ed-body text-foreground">{prefab.name}</span>
                    <span className="block text-ed-label leading-4 text-muted-foreground">{prefab.description}</span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main Entities & Folders Tree View */}
      <ContextMenu>
        <ContextMenuTrigger className="flex-1 overflow-y-auto min-h-0">
          <div className="flex flex-col gap-0.5 pb-4">
            {/* Entity Folders */}
            {entityFolders.map(folder => {
              const isExpanded = folder.expanded !== false
              const isFolderVisible = folder.visible !== false
              const isEditing = editingFolderId === folder.id
              const folderEntities = entities.filter(e => e.folder === folder.id)
              const isDragOver = dragOverFolderId === folder.id

              return (
                <div key={folder.id} className="flex flex-col gap-0.5">
                  <ContextMenu>
                    <ContextMenuTrigger>
                      <div
                        onDragOver={e => handleDragOverFolder(e, folder.id)}
                        onDragLeave={() => setDragOverFolderId(null)}
                        onDrop={e => handleDropOnFolder(e, folder.id)}
                        onDoubleClick={() => startEditingFolder(folder)}
                        onClick={() => toggleEntityFolderExpanded?.(folder.id)}
                        className="ed-row group"
                        data-drop={isDragOver ? 'true' : undefined}
                        data-dim={!isFolderVisible ? 'true' : undefined}
                      >
                        {isExpanded ? (
                          <ChevronDown className="text-muted-foreground" />
                        ) : (
                          <ChevronRight className="text-muted-foreground" />
                        )}
                        {isExpanded ? <FolderOpen className="text-amber-400" /> : <Folder className="text-amber-400" />}

                        {isEditing ? (
                          <input
                            ref={folderInputRef}
                            type="text"
                            value={editingFolderName}
                            onChange={e => setEditingFolderName(e.target.value)}
                            onBlur={() => commitEditingFolder(folder.id)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') commitEditingFolder(folder.id)
                              if (e.key === 'Escape') setEditingFolderId(null)
                            }}
                            onClick={e => e.stopPropagation()}
                            className="ed-input h-row-sm min-w-0 flex-1 border-amber-400/60"
                          />
                        ) : (
                          <span className="ed-row-label font-medium" title={folder.name}>
                            {folder.name}
                          </span>
                        )}

                        <div className="ed-row-actions">
                          <span className="ed-badge">{folderEntities.length}</span>
                          <IconButton
                            title={isFolderVisible ? 'Hide folder entities' : 'Show folder entities'}
                            aria-label={isFolderVisible ? 'Hide folder entities' : 'Show folder entities'}
                            onClick={e => {
                              e.stopPropagation()
                              toggleEntityFolderVisibility?.(folder.id)
                            }}
                          >
                            {isFolderVisible ? <Eye /> : <EyeOff className="text-amber-400/90" />}
                          </IconButton>
                        </div>
                      </div>
                    </ContextMenuTrigger>

                    <ContextMenuContent className="w-48 font-mono text-xs">
                      {renderNewEntityMenuItems(folder.id)}
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => startEditingFolder(folder)}>
                        <Edit2 className="w-3.5 h-3.5 mr-2" />
                        Rename Folder
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => toggleEntityFolderVisibility?.(folder.id)}>
                        {isFolderVisible ? <EyeOff className="w-3.5 h-3.5 mr-2" /> : <Eye className="w-3.5 h-3.5 mr-2" />}
                        {isFolderVisible ? 'Hide All in Folder' : 'Show All in Folder'}
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        onClick={() => confirmDeleteFolder(folder)}
                        className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" />
                        Delete Folder
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>

                  {/* Folder Children */}
                  {isExpanded && (
                    <div className="flex flex-col gap-0.5">
                      {folderEntities.length === 0 ? (
                        <div className="ed-indent ed-hint flex h-row-sm items-center pl-2 italic">
                          Folder is empty
                        </div>
                      ) : (
                        folderEntities.map(entity => renderEntityRow(entity, true))
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Root Entities */}
            {rootEntities.map(entity => renderEntityRow(entity, false))}

            {entities.length === 0 && entityFolders.length === 0 && (
              <div className="ed-empty h-40">
                <p>No entities yet.</p>
                <p className="ed-hint">Use “Add” above or right-click here.</p>
              </div>
            )}
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-48 font-mono text-xs">
          {renderNewEntityMenuItems(null)}
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => createEntityFolder?.()}>
            <FolderPlus className="w-3.5 h-3.5 mr-2 text-amber-400" />
            New Folder
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  )
}
