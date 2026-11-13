import React, { useState } from 'react'
import { Edit2, Trash2, Copy, Plus, Sparkles, Eye, EyeOff, Folder, FolderOpen, FolderPlus, ChevronRight, ChevronDown, FolderInput, Zap, Users } from 'lucide-react'
import { EntityData, ComponentType, EntityFolder, type PropBag } from '@/types/editor'
import { PRESET_PREFABS } from '@/lib/componentRegistry'
import { entityIconName, summarizeEntity } from '@/lib/entityVisuals'
import { openEventEditor } from '@/lib/openEventEditor'
import { useEditorSelector, type EditorContextValue } from '../layout/EditorContext'
import { Badge, IconButton } from '../ui/controls'
import { NamedIcon } from '../ui/icons'
import { SpriteThumb } from '../sprites/SpriteThumb'
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
import { RenameInput } from '../ui/RenameInput'

type Components = Partial<Record<ComponentType, PropBag>>
export type Prefab = (typeof PRESET_PREFABS)[number]

/**
 * The "Entity" entry of a right-click menu: New (an empty entity) and Prefab (one of the presets), each placed with the
 * next click on the map. Shared by the Layers panel and the map canvas so every menu offers the same choices.
 */
export function EntitySubmenu({ onNew, onPrefab }: { onNew: () => void; onPrefab: (prefab: Prefab) => void }) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Users className="mr-2 h-3.5 w-3.5 text-sky-400" />
        Entity
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-48">
        <ContextMenuItem onClick={onNew} title="An empty entity, one tile in size: add the components you need">
          <Plus className="mr-2 h-3.5 w-3.5 text-primary" />
          New
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Sparkles className="mr-2 h-3.5 w-3.5 text-amber-400" />
            Prefab
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-56">
            {PRESET_PREFABS.map((prefab) => (
              <ContextMenuItem key={prefab.id} onClick={() => onPrefab(prefab)} title={prefab.description}>
                <NamedIcon name={prefab.icon} className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                {prefab.name}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}

export interface EntityTreeProps {
  entities: EntityData[]
  selectedEntityId: string | null
  setSelectedEntityId: (id: string | null) => void
  createEntity: (name: string, x?: number, y?: number, initialComponents?: Components, folderId?: string | null) => void
  duplicateEntity: (id: string) => void
  deleteEntity: (id: string) => void
  renameEntity: (id: string, name: string) => void
  reorderEntities: (entities: EntityData[]) => void
  setConfirmDialog: (config: { open: boolean; title: string; description: string; action: () => void }) => void
  /** Starts placing an entity: the next click on the map puts it there. Without it, entities are created at (0, 0). */
  startPlacement?: (template: { name: string; components?: Components }) => void
  entityFolders?: EntityFolder[]
  renameEntityFolder?: (folderId: string, newName: string) => void
  deleteEntityFolder?: (folderId: string) => void
  toggleEntityFolderVisibility?: (folderId: string) => void
  toggleEntityFolderExpanded?: (folderId: string) => void
  toggleEntityVisibility?: (entityId: string) => void
  moveEntityToFolder?: (entityId: string, folderId: string | null) => void
}

/** New / Prefab placement for the tree and the Layers panel's menus. */
export function entityCreators(props: Pick<EntityTreeProps, 'startPlacement' | 'createEntity'>) {
  return {
    placeNew: (folderId: string | null = null) => {
      if (props.startPlacement) props.startPlacement({ name: 'New Entity' })
      else props.createEntity('New Entity', 0, 0, undefined, folderId)
    },
    placePrefab: (prefab: Prefab, folderId: string | null = null) => {
      if (props.startPlacement) props.startPlacement({ name: prefab.name, components: prefab.components })
      else props.createEntity(prefab.name, 0, 0, prefab.components, folderId)
    },
  }
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

/**
 * The entities of the map as a tree (folders, then the loose entities), shown under the Entities row of the Layers panel.
 * Click selects, double-click renames, drag reorders or moves into a folder, right-click for the rest.
 */
export function EntityTree(props: EntityTreeProps) {
  const {
    entities,
    selectedEntityId,
    setSelectedEntityId,
    duplicateEntity,
    deleteEntity,
    renameEntity,
    reorderEntities,
    setConfirmDialog,
    entityFolders = [],
    renameEntityFolder,
    deleteEntityFolder,
    toggleEntityFolderVisibility,
    toggleEntityFolderExpanded,
    toggleEntityVisibility,
    moveEntityToFolder,
  } = props
  const { placeNew, placePrefab } = entityCreators(props)
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [draggedEntityId, setDraggedEntityId] = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<{ id: string; position: 'top' | 'bottom' } | null>(null)

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.stopPropagation()
    setDraggedEntityId(id)
    e.dataTransfer.setData('entityId', id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOverEntity = (e: React.DragEvent, targetId: string) => {
    if (!draggedEntityId) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    if (draggedEntityId === targetId) return
    const rect = e.currentTarget.getBoundingClientRect()
    setDragOverTarget({ id: targetId, position: e.clientY - rect.top < rect.height / 2 ? 'top' : 'bottom' })
  }

  const handleDragOverFolder = (e: React.DragEvent, folderId: string) => {
    if (!draggedEntityId) return
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
    if (!draggedEntityId || draggedEntityId === targetEntity.id) return handleDragEnd()
    const srcIndex = entities.findIndex((ent) => ent.id === draggedEntityId)
    if (srcIndex === -1 || !entities.some((ent) => ent.id === targetEntity.id)) return handleDragEnd()
    const next = [...entities]
    const [moved] = next.splice(srcIndex, 1)
    // It joins the target's folder.
    const placed = { ...moved, folder: targetEntity.folder || null }
    let at = next.findIndex((ent) => ent.id === targetEntity.id)
    if (dragOverTarget?.position === 'bottom') at += 1
    next.splice(at, 0, placed)
    reorderEntities(next)
    handleDragEnd()
  }

  const handleDropOnFolder = (e: React.DragEvent, folderId: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedEntityId) moveEntityToFolder?.(draggedEntityId, folderId)
    handleDragEnd()
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
    const count = entities.filter((e) => e.folder === folder.id).length
    setTimeout(() => {
      setConfirmDialog({
        open: true,
        title: 'Delete Folder',
        description: `Are you sure you want to delete folder "${folder.name}"${count > 0 ? ` and move its ${count} entities to root?` : '?'}`,
        action: () => deleteEntityFolder?.(folder.id),
      })
    }, 0)
  }

  const renderEntityRow = (entity: EntityData, depth: 1 | 2) => {
    const isEditing = editingEntityId === entity.id
    const isSelected = selectedEntityId === entity.id
    const isDropTarget = dragOverTarget?.id === entity.id && draggedEntityId !== entity.id
    const isVisible = entity.visible !== false

    return (
      <ContextMenu key={entity.id}>
        <ContextMenuTrigger asChild>
          <div
            draggable={!isEditing}
            onDragStart={(e) => handleDragStart(e, entity.id)}
            onDragOver={(e) => handleDragOverEntity(e, entity.id)}
            onDragEnd={handleDragEnd}
            onDrop={(e) => handleDropOnEntity(e, entity)}
            onClick={() => setSelectedEntityId(entity.id)}
            onDoubleClick={() => setEditingEntityId(entity.id)}
            className="ed-row group"
            style={{ marginLeft: depth * 16, width: `calc(100% - ${depth * 16}px)` }}
            data-selected={isSelected ? 'true' : undefined}
            data-dim={!isVisible ? 'true' : undefined}
            data-testid={`entity-row-${entity.id}`}
          >
            {isDropTarget && (
              <div className={`pointer-events-none absolute left-0 right-0 z-30 h-[2px] rounded-full bg-primary ${dragOverTarget.position === 'top' ? '-top-[2px]' : '-bottom-[2px]'}`} />
            )}
            <div className="flex h-5 w-5 shrink-0 items-center justify-center">
              <EntityGlyph entity={entity} />
            </div>
            {isEditing ? (
              <RenameInput initial={entity.name} label="Entity name" onRename={(name) => renameEntity(entity.id, name)} onClose={() => setEditingEntityId(null)} className="h-row-sm border-primary/60" />
            ) : (
              <span className="ed-row-label" title={entity.name}>{entity.name}</span>
            )}
            <div className="ed-row-actions">
              <EntityBadges entity={entity} />
              <IconButton
                title={isVisible ? 'Hide entity' : 'Show entity'}
                aria-label={isVisible ? 'Hide entity' : 'Show entity'}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleEntityVisibility?.(entity.id)
                }}
              >
                {isVisible ? <Eye /> : <EyeOff className="text-amber-400/90" />}
              </IconButton>
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-48 text-xs">
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
          <ContextMenuItem onClick={() => setEditingEntityId(entity.id)}>
            <Edit2 className="mr-2 h-3.5 w-3.5" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem onClick={() => duplicateEntity(entity.id)}>
            <Copy className="mr-2 h-3.5 w-3.5" />
            Duplicate
          </ContextMenuItem>
          <ContextMenuItem onClick={() => toggleEntityVisibility?.(entity.id)}>
            {isVisible ? <EyeOff className="mr-2 h-3.5 w-3.5" /> : <Eye className="mr-2 h-3.5 w-3.5" />}
            {isVisible ? 'Hide Entity' : 'Show Entity'}
          </ContextMenuItem>
          {entityFolders.length > 0 && (
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <FolderInput className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                Move to Folder
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-44 text-xs">
                <ContextMenuItem disabled={!entity.folder} onClick={() => moveEntityToFolder?.(entity.id, null)}>
                  Root (No Folder)
                </ContextMenuItem>
                <ContextMenuSeparator />
                {entityFolders.map((f) => (
                  <ContextMenuItem key={f.id} disabled={entity.folder === f.id} onClick={() => moveEntityToFolder?.(entity.id, f.id)}>
                    {f.name}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
          <ContextMenuSeparator />
          <EntitySubmenu onNew={() => placeNew(entity.folder ?? null)} onPrefab={(p) => placePrefab(p, entity.folder ?? null)} />
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => confirmDeleteEntity(entity)} className="text-red-400 focus:bg-red-500/10 focus:text-red-400">
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete Entity
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  const rootEntities = entities.filter((e) => !e.folder || !entityFolders.some((f) => f.id === e.folder))

  return (
    <div className="flex flex-col gap-0.5" data-testid="entity-tree">
      {entityFolders.map((folder) => {
        const isExpanded = folder.expanded !== false
        const isFolderVisible = folder.visible !== false
        const folderEntities = entities.filter((e) => e.folder === folder.id)
        return (
          <div key={folder.id} className="flex flex-col gap-0.5">
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div
                  onDragOver={(e) => handleDragOverFolder(e, folder.id)}
                  onDragLeave={() => setDragOverFolderId(null)}
                  onDrop={(e) => handleDropOnFolder(e, folder.id)}
                  onDoubleClick={() => setEditingFolderId(folder.id)}
                  onClick={() => toggleEntityFolderExpanded?.(folder.id)}
                  className="ed-row group"
                  style={{ marginLeft: 16, width: 'calc(100% - 16px)' }}
                  data-testid="entity-folder-row"
                  data-drop={dragOverFolderId === folder.id ? 'true' : undefined}
                  data-dim={!isFolderVisible ? 'true' : undefined}
                >
                  {isExpanded ? <ChevronDown className="text-muted-foreground" /> : <ChevronRight className="text-muted-foreground" />}
                  {isExpanded ? <FolderOpen className="text-amber-400" /> : <Folder className="text-amber-400" />}
                  {editingFolderId === folder.id ? (
                    <RenameInput initial={folder.name} label="Folder name" onRename={(name) => renameEntityFolder?.(folder.id, name)} onClose={() => setEditingFolderId(null)} className="h-row-sm border-amber-400/60" />
                  ) : (
                    <span className="ed-row-label font-medium" title={folder.name}>{folder.name}</span>
                  )}
                  <div className="ed-row-actions">
                    <span className="ed-badge">{folderEntities.length}</span>
                    <IconButton
                      title={isFolderVisible ? 'Hide folder entities' : 'Show folder entities'}
                      aria-label={isFolderVisible ? 'Hide folder entities' : 'Show folder entities'}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleEntityFolderVisibility?.(folder.id)
                      }}
                    >
                      {isFolderVisible ? <Eye /> : <EyeOff className="text-amber-400/90" />}
                    </IconButton>
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48 text-xs">
                <EntitySubmenu onNew={() => placeNew(folder.id)} onPrefab={(p) => placePrefab(p, folder.id)} />
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => setEditingFolderId(folder.id)}>
                  <Edit2 className="mr-2 h-3.5 w-3.5" />
                  Rename Folder
                </ContextMenuItem>
                <ContextMenuItem onClick={() => toggleEntityFolderVisibility?.(folder.id)}>
                  {isFolderVisible ? <EyeOff className="mr-2 h-3.5 w-3.5" /> : <Eye className="mr-2 h-3.5 w-3.5" />}
                  {isFolderVisible ? 'Hide All in Folder' : 'Show All in Folder'}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => confirmDeleteFolder(folder)} className="text-red-400 focus:bg-red-500/10 focus:text-red-400">
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete Folder
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            {isExpanded &&
              (folderEntities.length === 0 ? (
                <div className="ed-hint flex h-row-sm items-center pl-2 italic" style={{ marginLeft: 32 }}>
                  Folder is empty
                </div>
              ) : (
                folderEntities.map((entity) => renderEntityRow(entity, 2))
              ))}
          </div>
        )
      })}
      {rootEntities.map((entity) => renderEntityRow(entity, 1))}
      {entities.length === 0 && entityFolders.length === 0 && (
        <div className="ed-hint flex h-row-sm items-center pl-2 italic" style={{ marginLeft: 16 }}>
          No entities yet: right-click › Entity
        </div>
      )}
    </div>
  )
}

/** The "New entity folder" entry of the Layers panel's menus. */
export function NewEntityFolderItem({ onCreate }: { onCreate: () => void }) {
  return (
    <ContextMenuItem onClick={onCreate}>
      <FolderPlus className="mr-2 h-3.5 w-3.5 text-amber-400" />
      New Entity Folder
    </ContextMenuItem>
  )
}
