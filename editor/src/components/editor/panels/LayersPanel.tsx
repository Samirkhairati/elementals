import React, { useState, useRef, useEffect } from 'react'
import {
  Layers as LayersIcon,
  XSquare,
  Droplet,
  Leaf,
  Box,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Edit2,
  Trash2,
  Copy,
  Plus,
  Image as ImageIcon,
  Users,
} from 'lucide-react'
import { Layer, LayerType } from '@/types/editor'
import { ENTITIES_ID, moveInStack, stackIds } from '@/lib/layerOrder'
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

function getLayerIcon(type: LayerType) {
  switch (type) {
    case 'tile':
      return <LayersIcon className="text-gray-400" />
    case 'collision':
      return <XSquare className="text-red-400" />
    case 'terrain':
      return <Droplet className="text-blue-400" />
    case 'objects':
      return <Box className="text-amber-400" />
    case 'encounters':
      return <Leaf className="text-green-400" />
    case 'image':
      return <ImageIcon className="text-violet-400" />
    default:
      return <LayersIcon className="text-gray-400" />
  }
}

function NewLayerSubmenu({
  createLayerOfType,
  hasCollision,
  hasTerrain,
  hasEncounters,
}: {
  createLayerOfType: (type: LayerType) => void
  hasCollision: boolean
  hasTerrain: boolean
  hasEncounters: boolean
}) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Plus className="w-3.5 h-3.5 mr-2" />
        New Layer
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-44">
        <ContextMenuItem onClick={() => createLayerOfType('tile')}>Tile Layer</ContextMenuItem>
        <ContextMenuItem onClick={() => createLayerOfType('image')}>Image Layer</ContextMenuItem>
        <ContextMenuItem disabled={hasCollision} onClick={() => createLayerOfType('collision')}>
          Collision Layer
        </ContextMenuItem>
        <ContextMenuItem disabled={hasTerrain} onClick={() => createLayerOfType('terrain')}>
          Terrain Layer
        </ContextMenuItem>
        <ContextMenuItem disabled={hasEncounters} onClick={() => createLayerOfType('encounters')}>
          Encounters Layer
        </ContextMenuItem>
        <ContextMenuItem onClick={() => createLayerOfType('objects')}>Objects Layer</ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}

interface EntitiesRowProps {
  visible: boolean
  onToggle?: () => void
  /** Drag handlers of the stack: the row moves among the layers like a layer does (not set when there is nothing to move past). */
  drag?: {
    onDragStart: (e: React.DragEvent) => void
    onDragOver: (e: React.DragEvent) => void
    onDragEnd: () => void
    onDrop: (e: React.DragEvent) => void
  }
  /** Where a dragged item would land relative to this row. */
  dropPosition?: 'top' | 'bottom' | null
}

function EntitiesRow({ visible, onToggle, drag, dropPosition }: EntitiesRowProps) {
  return (
    <div
      className="ed-row"
      data-dim={visible ? undefined : 'true'}
      data-testid="entities-row"
      title="All entities of the map. Drag to change where they draw among the layers."
      draggable={!!drag}
      {...drag}
    >
      {dropPosition && (
        <div
          className={`absolute left-0 right-0 h-[2px] bg-primary z-30 pointer-events-none rounded-full ${
            dropPosition === 'top' ? '-top-[2px]' : '-bottom-[2px]'
          }`}
        />
      )}
      <Users className="text-sky-400" />
      <span className="ed-row-label">Entities</span>
      <div className="ed-row-actions">
        <button
          type="button"
          onClick={onToggle}
          className="ed-iconbtn"
          title={visible ? 'Hide all entities on the canvas' : 'Show entities on the canvas'}
          aria-label={visible ? 'Hide entities' : 'Show entities'}
        >
          {visible ? <Eye /> : <EyeOff />}
        </button>
      </div>
    </div>
  )
}

interface LayersPanelProps {
  /** Whether a map is open (the panel only needs presence, not the map itself). */
  hasActiveMap: boolean
  layers: Layer[]
  activeLayerId: string | null
  setActiveLayerId: (id: string) => void
  /** Plain click selects one layer; Ctrl/Cmd+click adds it to the multi-selection. Falls back to `setActiveLayerId`. */
  selectLayer?: (id: string, additive?: boolean) => void
  /** Layers picked in addition to the active one. */
  selectedLayerIds?: readonly string[]
  /** The entities of the map are not a layer: one row that toggles their visibility and can be dragged among the layers. */
  showEntities?: boolean
  toggleShowEntities?: () => void
  /** How many layers are above the Entities row (0 = on top). */
  entitiesIndex?: number
  setEntitiesIndex?: (index: number) => void
  setSelectedEntityId?: (id: string | null) => void
  toggleLayerVisibility: (id: string) => void
  toggleLayerLock: (id: string) => void
  deleteLayer: (id: string) => void
  reorderLayers: (newLayers: Layer[]) => void
  createLayerOfType: (type: LayerType) => void
  renameLayer: (id: string, newName: string) => void
  duplicateLayer: (id: string) => void
  setConfirmDialog: (config: {
    open: boolean
    title: string
    description: string
    action: () => void
  }) => void
}

export function LayersPanel({
  hasActiveMap,
  layers,
  activeLayerId,
  setActiveLayerId,
  selectLayer,
  selectedLayerIds = [],
  showEntities = true,
  toggleShowEntities,
  entitiesIndex = 0,
  setEntitiesIndex,
  setSelectedEntityId,
  toggleLayerVisibility,
  toggleLayerLock,
  deleteLayer,
  reorderLayers,
  createLayerOfType,
  renameLayer,
  duplicateLayer,
  setConfirmDialog,
}: LayersPanelProps) {
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<{
    id: string
    position: 'top' | 'bottom'
  } | null>(null)
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingLayerId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingLayerId])

  const startEditing = (layer: Layer) => {
    setEditingLayerId(layer.id)
    setEditingName(layer.name)
  }

  const commitEditing = (id: string) => {
    if (editingName.trim()) {
      renameLayer(id, editingName.trim())
    }
    setEditingLayerId(null)
  }

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedLayerId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!draggedLayerId || draggedLayerId === targetId) {
      setDragOverTarget(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const isTop = e.clientY - rect.top < rect.height / 2
    setDragOverTarget({ id: targetId, position: isTop ? 'top' : 'bottom' })
  }

  const handleDragEnd = () => {
    setDraggedLayerId(null)
    setDragOverTarget(null)
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!draggedLayerId || draggedLayerId === targetId) {
      setDraggedLayerId(null)
      setDragOverTarget(null)
      return
    }

    // Layers and the Entities row are one stack; only the order changes (no z, no other property).
    const moved = moveInStack(layers, entitiesIndex, draggedLayerId, targetId, dragOverTarget?.position === 'bottom' ? 'bottom' : 'top')
    if (moved.layers !== layers) reorderLayers(moved.layers)
    if (moved.entitiesIndex !== Math.min(entitiesIndex, layers.length)) setEntitiesIndex?.(moved.entitiesIndex)
    setDraggedLayerId(null)
    setDragOverTarget(null)
  }

  const confirmDeleteLayer = (layer: Layer) => {
    setTimeout(() => {
      setConfirmDialog({
        open: true,
        title: 'Delete Layer',
        description: `Are you sure you want to delete layer "${layer.name}"?`,
        action: () => deleteLayer(layer.id),
      })
    }, 0)
  }

  const stack = stackIds(layers, entitiesIndex)

  const hasCollision = layers.some((l) => l.type === 'collision')
  const hasTerrain = layers.some((l) => l.type === 'terrain')
  const hasEncounters = layers.some((l) => l.type === 'encounters')

  if (!hasActiveMap) {
    return (
      <div className="ed-empty">Select a map to view layers</div>
    )
  }

  if (layers.length === 0) {
    return (
      <ContextMenu>
        <ContextMenuTrigger className="block h-full w-full">
          <EntitiesRow visible={showEntities} onToggle={toggleShowEntities} />
          <div className="ed-empty">
            <p>No layers yet.</p>
            <p className="ed-hint">Right-click here to create a layer.</p>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-48">
          <NewLayerSubmenu
            createLayerOfType={createLayerOfType}
            hasCollision={hasCollision}
            hasTerrain={hasTerrain}
            hasEncounters={hasEncounters}
          />
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger className="block min-h-full h-full w-full">
        <div className="flex min-h-full h-full w-full flex-col gap-0.5">
          {stack.map((stackId) => {
            if (stackId === ENTITIES_ID) {
              return (
                <EntitiesRow
                  key={ENTITIES_ID}
                  visible={showEntities}
                  onToggle={toggleShowEntities}
                  drag={{
                    onDragStart: (e) => handleDragStart(e, ENTITIES_ID),
                    onDragOver: (e) => handleDragOver(e, ENTITIES_ID),
                    onDragEnd: handleDragEnd,
                    onDrop: (e) => handleDrop(e, ENTITIES_ID),
                  }}
                  dropPosition={dragOverTarget?.id === ENTITIES_ID && draggedLayerId !== ENTITIES_ID ? dragOverTarget.position : null}
                />
              )
            }
            const layer = layers.find((l) => l.id === stackId)
            if (!layer) return null
            const isEditing = editingLayerId === layer.id
            const isSelected = activeLayerId === layer.id
            const isMulti = !isSelected && selectedLayerIds.includes(layer.id)
            const isDropTarget = dragOverTarget?.id === layer.id && draggedLayerId !== layer.id

            return (
              <ContextMenu key={layer.id}>
                <ContextMenuTrigger>
                  <div
                    draggable={!layer.locked && !isEditing}
                    onDragStart={(e) => handleDragStart(e, layer.id)}
                    onDragOver={(e) => handleDragOver(e, layer.id)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, layer.id)}
                    onClick={(e) => {
                      const additive = e.metaKey || e.ctrlKey
                      if (selectLayer) selectLayer(layer.id, additive)
                      else setActiveLayerId(layer.id)
                      setSelectedEntityId?.(null)
                    }}
                    onDoubleClick={() => {
                      if (!layer.locked) startEditing(layer)
                    }}
                    className="ed-row"
                    data-selected={isSelected ? 'true' : undefined}
                    data-multi={isMulti ? 'true' : undefined}
                  >
                    {/* Horizontal drag indicator line */}
                    {isDropTarget && (
                      <div
                        className={`absolute left-0 right-0 h-[2px] bg-primary z-30 pointer-events-none rounded-full ${
                          dragOverTarget.position === 'top' ? '-top-[2px]' : '-bottom-[2px]'
                        }`}
                      />
                    )}

                    {getLayerIcon(layer.type)}

                    {isEditing ? (
                      <input
                        ref={inputRef}
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => commitEditing(layer.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEditing(layer.id)
                          if (e.key === 'Escape') setEditingLayerId(null)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="ed-input h-row-sm min-w-0 flex-1 border-primary/60"
                      />
                    ) : (
                      <span className="ed-row-label" title={layer.name}>{layer.name}</span>
                    )}

                    <span className="ed-badge" title="Z-index: draw order, higher draws on top" data-testid="layer-z">
                      z {layer.z ?? 0}
                    </span>

                    {/* Compact status & inline visibility toggle */}
                    <div
                      className="ed-row-actions"
                      onDoubleClick={(e) => e.stopPropagation()}
                    >
                      {layer.locked && (
                        <div title="Layer locked" className="flex h-6 w-6 items-center justify-center">
                          <Lock className="text-amber-400" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleLayerVisibility(layer.id)
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                        }}
                        className="ed-iconbtn"
                        title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                      >
                        {layer.visible ? <Eye /> : <EyeOff />}
                      </button>
                    </div>
                  </div>
                </ContextMenuTrigger>

                <ContextMenuContent className="w-48">
                  <ContextMenuItem onClick={() => startEditing(layer)}>
                    <Edit2 className="w-3.5 h-3.5 mr-2" />
                    Rename
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => duplicateLayer(layer.id)}>
                    <Copy className="w-3.5 h-3.5 mr-2" />
                    Duplicate
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => toggleLayerVisibility(layer.id)}>
                    {layer.visible ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5 mr-2" />
                        Hide Layer
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 mr-2" />
                        Show Layer
                      </>
                    )}
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => toggleLayerLock(layer.id)}>
                    {layer.locked ? (
                      <>
                        <Unlock className="w-3.5 h-3.5 mr-2" />
                        Unlock Layer
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5 mr-2" />
                        Lock Layer
                      </>
                    )}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onClick={() => confirmDeleteLayer(layer)}
                    className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                    Delete Layer
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            )
          })}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-48">
        <NewLayerSubmenu
          createLayerOfType={createLayerOfType}
          hasCollision={hasCollision}
          hasTerrain={hasTerrain}
          hasEncounters={hasEncounters}
        />
      </ContextMenuContent>
    </ContextMenu>
  )
}
