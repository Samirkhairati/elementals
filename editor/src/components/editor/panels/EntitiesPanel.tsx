import React, { useState, useRef, useEffect } from 'react'
import {
  User,
  DoorOpen,
  MessageSquare,
  Package,
  Box,
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
} from 'lucide-react'
import { EntityData, ComponentType, EntityFolder } from '@/types/editor'
import { PRESET_PREFABS } from '@/lib/componentRegistry'
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

function getEntityIcon(entity: EntityData) {
  const comps = entity.components
  if (comps.Tag?.tag === 'warp' || comps.Interactable?.targetMap) {
    return <DoorOpen className="w-4 h-4 text-cyan-400" />
  }
  if (comps.CharacterAnimation || comps.Tag?.tag === 'npc' || comps.AIWander) {
    return <User className="w-4 h-4 text-emerald-400" />
  }
  if (comps.Tag?.tag === 'sign') {
    return <MessageSquare className="w-4 h-4 text-blue-400" />
  }
  if (comps.Tag?.tag === 'chest') {
    return <Package className="w-4 h-4 text-amber-400" />
  }
  return <Box className="w-4 h-4 text-purple-400" />
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
      <div className="h-full flex items-center justify-center text-muted-foreground p-8 text-center select-none">
        <p className="text-xs">Select a map to view entities</p>
      </div>
    )
  }

  const renderNewEntityMenuItems = (targetFolderId?: string | null) => (
    <>
      <ContextMenuItem
        onClick={() => {
          if (startPlacement) {
            startPlacement({ name: 'New Entity' })
          } else {
            createEntity('New Entity', 0, 0, undefined, targetFolderId)
          }
        }}
      >
        <Plus className="w-3.5 h-3.5 mr-2 text-primary" />
        New Empty Entity
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Sparkles className="w-3.5 h-3.5 mr-2 text-amber-400" />
          From Prefab
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-48 font-mono text-xs">
          {PRESET_PREFABS.map(prefab => (
            <ContextMenuItem
              key={prefab.name}
              onClick={() => {
                if (startPlacement) {
                  startPlacement({ name: prefab.name, components: prefab.components })
                } else {
                  createEntity(prefab.name, 0, 0, prefab.components, targetFolderId)
                }
              }}
            >
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
    const compCount = Object.keys(entity.components || {}).length
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
            className={`group relative flex items-center py-1.5 px-2 rounded-md cursor-pointer text-xs select-none border transition-colors ${
              isInsideFolder ? 'ml-4' : ''
            } ${
              isSelected
                ? 'bg-primary/25 text-primary-foreground font-medium border-primary/40'
                : 'border-transparent hover:bg-sidebar-accent text-sidebar-foreground'
            } ${!isVisible ? 'opacity-50' : ''}`}
          >
            {/* Horizontal drag indicator line */}
            {isDropTarget && (
              <div
                className={`absolute left-0 right-0 h-[2px] bg-primary shadow-[0_0_8px_rgba(59,130,246,1)] z-30 pointer-events-none rounded-full ${
                  dragOverTarget.position === 'top' ? '-top-[2px]' : '-bottom-[2px]'
                }`}
              />
            )}

            <div className="mr-2 shrink-0 opacity-80 cursor-grab active:cursor-grabbing">
              {getEntityIcon(entity)}
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
                className="flex-1 bg-black/40 border border-primary/60 rounded px-1.5 py-0.5 text-xs text-foreground outline-none font-mono"
              />
            ) : (
              <span className="flex-1 truncate">{entity.name}</span>
            )}

            {/* Right side actions: Visibility & component count */}
            <div className="flex items-center gap-1.5 ml-2 shrink-0">
              <button
                type="button"
                title={isVisible ? 'Hide Entity' : 'Show Entity'}
                onClick={e => {
                  e.stopPropagation()
                  toggleEntityVisibility?.(entity.id)
                }}
                className={`p-1 rounded transition-colors ${
                  isVisible
                    ? 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/40'
                    : 'text-muted-foreground hover:text-foreground bg-muted/30'
                }`}
              >
                {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-amber-400/90" />}
              </button>

              <span
                title={`${compCount} components`}
                className="text-[10px] px-1.5 py-0.2 rounded bg-black/20 text-muted-foreground font-mono"
              >
                {compCount}
              </span>
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-48 font-mono text-xs">
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
    <div className="flex flex-col h-full w-full select-none font-mono text-xs">
      {/* Top Header Controls */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-sidebar-border bg-sidebar/50 mb-1.5 rounded-t-md">
        <button
          type="button"
          onClick={toggleShowEntities}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
            showEntities
              ? 'bg-primary/20 text-primary font-medium border border-primary/30'
              : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground border border-transparent'
          }`}
          title={showEntities ? 'Hide all entities on canvas' : 'Show entities on canvas'}
        >
          {showEntities ? <Eye className="w-3.5 h-3.5 text-primary" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
          <span>Entities</span>
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => createEntityFolder?.()}
            className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Create Entity Folder"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (startPlacement) {
                startPlacement({ name: 'New Entity' })
              } else {
                createEntity('New Entity')
              }
            }}
            className="p-1.5 rounded hover:bg-muted/50 text-primary hover:text-primary transition-colors"
            title="New Entity"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Entities & Folders Tree View */}
      <ContextMenu>
        <ContextMenuTrigger className="flex-1 overflow-y-auto min-h-0">
          <div className="space-y-1 pb-4">
            {/* Entity Folders */}
            {entityFolders.map(folder => {
              const isExpanded = folder.expanded !== false
              const isFolderVisible = folder.visible !== false
              const isEditing = editingFolderId === folder.id
              const folderEntities = entities.filter(e => e.folder === folder.id)
              const isDragOver = dragOverFolderId === folder.id

              return (
                <div key={folder.id} className="space-y-1">
                  <ContextMenu>
                    <ContextMenuTrigger>
                      <div
                        onDragOver={e => handleDragOverFolder(e, folder.id)}
                        onDragLeave={() => setDragOverFolderId(null)}
                        onDrop={e => handleDropOnFolder(e, folder.id)}
                        onDoubleClick={() => startEditingFolder(folder)}
                        className={`flex items-center py-1.5 px-2 rounded-md cursor-pointer transition-colors border ${
                          isDragOver
                            ? 'bg-amber-500/20 border-amber-400/50'
                            : 'border-transparent hover:bg-sidebar-accent text-sidebar-foreground'
                        } ${!isFolderVisible ? 'opacity-50' : ''}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleEntityFolderExpanded?.(folder.id)}
                          className="p-0.5 mr-1 hover:bg-muted/50 rounded text-muted-foreground"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <div
                          className="mr-1.5 text-amber-400"
                          onClick={() => toggleEntityFolderExpanded?.(folder.id)}
                        >
                          {isExpanded ? (
                            <FolderOpen className="w-4 h-4" />
                          ) : (
                            <Folder className="w-4 h-4" />
                          )}
                        </div>

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
                            className="flex-1 bg-black/40 border border-amber-400/60 rounded px-1.5 py-0.5 text-xs text-foreground outline-none font-mono"
                          />
                        ) : (
                          <span
                            onClick={() => toggleEntityFolderExpanded?.(folder.id)}
                            className="flex-1 truncate font-medium"
                          >
                            {folder.name}
                          </span>
                        )}

                        <div className="flex items-center gap-1.5 ml-2 shrink-0">
                          <button
                            type="button"
                            title={isFolderVisible ? 'Hide Folder Entities' : 'Show Folder Entities'}
                            onClick={e => {
                              e.stopPropagation()
                              toggleEntityFolderVisibility?.(folder.id)
                            }}
                            className={`p-1 rounded transition-colors ${
                              isFolderVisible
                                ? 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/40'
                                : 'text-muted-foreground hover:text-foreground bg-muted/30'
                            }`}
                          >
                            {isFolderVisible ? (
                              <Eye className="w-3.5 h-3.5" />
                            ) : (
                              <EyeOff className="w-3.5 h-3.5 text-amber-400/90" />
                            )}
                          </button>

                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/20 text-muted-foreground font-mono">
                            {folderEntities.length}
                          </span>
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
                    <div className="space-y-1">
                      {folderEntities.length === 0 ? (
                        <div className="pl-8 py-1 text-[11px] text-muted-foreground/60 italic">
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
              <div className="h-40 flex flex-col items-center justify-center text-muted-foreground p-4 text-center select-none">
                <p className="text-xs">
                  No entities yet.
                  <br />
                  <span className="text-[11px] opacity-70">Right-click here or click + above to add an entity.</span>
                </p>
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
