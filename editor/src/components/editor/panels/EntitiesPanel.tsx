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
} from 'lucide-react'
import { EntityData, MapData, ComponentType } from '@/types/editor'
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
  activeMap: MapData | null
  entities: EntityData[]
  selectedEntityId: string | null
  setSelectedEntityId: (id: string | null) => void
  createEntity: (
    name: string,
    x?: number,
    y?: number,
    initialComponents?: Partial<Record<ComponentType, Record<string, any>>>
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
  activeMap,
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
}: EntitiesPanelProps) {
  // Inline rename state
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Drag & drop reorder state
  const [draggedEntityId, setDraggedEntityId] = useState<string | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<{ id: string; position: 'top' | 'bottom' } | null>(
    null
  )

  useEffect(() => {
    if (editingEntityId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingEntityId])

  const startEditing = (entity: EntityData) => {
    setEditingEntityId(entity.id)
    setEditingName(entity.name)
  }

  const commitEditing = (id: string) => {
    if (editingEntityId === id) {
      renameEntity(id, editingName)
      setEditingEntityId(null)
    }
  }

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedEntityId(id)
    e.dataTransfer.setData('entityId', id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedEntityId === targetId) return

    const rect = e.currentTarget.getBoundingClientRect()
    const isTop = e.clientY - rect.top < rect.height / 2
    setDragOverTarget({ id: targetId, position: isTop ? 'top' : 'bottom' })
  }

  const handleDragEnd = () => {
    setDraggedEntityId(null)
    setDragOverTarget(null)
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!draggedEntityId || draggedEntityId === targetId) return

    const srcIndex = entities.findIndex(ent => ent.id === draggedEntityId)
    const dstIndex = entities.findIndex(ent => ent.id === targetId)
    if (srcIndex === -1 || dstIndex === -1) return

    const newEntities = [...entities]
    const [moved] = newEntities.splice(srcIndex, 1)

    let finalDstIndex = newEntities.findIndex(ent => ent.id === targetId)
    if (dragOverTarget?.position === 'bottom') {
      finalDstIndex += 1
    }
    newEntities.splice(finalDstIndex, 0, moved)

    reorderEntities(newEntities)
    setDraggedEntityId(null)
    setDragOverTarget(null)
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

  if (!activeMap) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground p-8 text-center select-none">
        <p className="text-xs">Select a map to view entities</p>
      </div>
    )
  }

  const renderNewEntityMenu = () => (
    <>
      <ContextMenuItem
        onClick={() => {
          if (startPlacement) {
            startPlacement({ name: 'New Entity' })
          } else {
            createEntity('New Entity')
          }
        }}
      >
        <Plus className="w-3.5 h-3.5 mr-2" />
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
                  createEntity(prefab.name, 0, 0, prefab.components)
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

  if (entities.length === 0) {
    return (
      <ContextMenu>
        <ContextMenuTrigger className="block h-full w-full">
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center select-none">
            <p className="text-xs">
              No entities yet.
              <br />
              <span className="text-[11px] opacity-70">Right-click here to create an entity.</span>
            </p>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-48">
          {renderNewEntityMenu()}
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger className="block min-h-full h-full w-full">
        <div className="min-h-full h-full w-full space-y-1">
          {entities.map(entity => {
            const isEditing = editingEntityId === entity.id
            const isSelected = selectedEntityId === entity.id
            const isDropTarget = dragOverTarget?.id === entity.id && draggedEntityId !== entity.id
            const compCount = Object.keys(entity.components || {}).length

            return (
              <ContextMenu key={entity.id}>
                <ContextMenuTrigger>
                  <div
                    draggable={!isEditing}
                    onDragStart={e => handleDragStart(e, entity.id)}
                    onDragOver={e => handleDragOver(e, entity.id)}
                    onDragEnd={handleDragEnd}
                    onDrop={e => handleDrop(e, entity.id)}
                    onClick={() => setSelectedEntityId(entity.id)}
                    onDoubleClick={() => startEditing(entity)}
                    className={`relative flex items-center py-1.5 px-2.5 rounded-md cursor-pointer text-sm select-none border ${
                      isSelected
                        ? 'bg-primary/30 text-primary-foreground font-medium border-primary/40'
                        : 'border-transparent hover:bg-sidebar-accent text-sidebar-foreground'
                    }`}
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
                        onBlur={() => commitEditing(entity.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitEditing(entity.id)
                          if (e.key === 'Escape') setEditingEntityId(null)
                        }}
                        onClick={e => e.stopPropagation()}
                        className="flex-1 bg-black/40 border border-primary/60 rounded px-1 py-0.5 text-xs text-foreground outline-none font-mono"
                      />
                    ) : (
                      <span className="flex-1 truncate">{entity.name}</span>
                    )}

                    {/* Component count badge */}
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <span
                        title={`${compCount} components`}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-black/20 text-muted-foreground font-mono"
                      >
                        {compCount}
                      </span>
                    </div>
                  </div>
                </ContextMenuTrigger>

                <ContextMenuContent className="w-48">
                  <ContextMenuItem onClick={() => startEditing(entity)}>
                    <Edit2 className="w-3.5 h-3.5 mr-2" />
                    Rename
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => duplicateEntity(entity.id)}>
                    <Copy className="w-3.5 h-3.5 mr-2" />
                    Duplicate
                  </ContextMenuItem>
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
          })}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-48">
        {renderNewEntityMenu()}
      </ContextMenuContent>
    </ContextMenu>
  )
}
