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
} from 'lucide-react'
import { Layer, LayerType, MapData } from '@/types/editor'
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
      return <LayersIcon className="w-4 h-4 text-gray-400" />
    case 'collision':
      return <XSquare className="w-4 h-4 text-red-400" />
    case 'terrain':
      return <Droplet className="w-4 h-4 text-blue-400" />
    case 'objects':
      return <Box className="w-4 h-4 text-amber-400" />
    case 'encounters':
      return <Leaf className="w-4 h-4 text-green-400" />
    default:
      return <LayersIcon className="w-4 h-4 text-gray-400" />
  }
}

interface LayersPanelProps {
  activeMap: MapData | null
  layers: Layer[]
  activeLayerId: string | null
  setActiveLayerId: (id: string) => void
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
  activeMap,
  layers,
  activeLayerId,
  setActiveLayerId,
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
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!draggedLayerId || draggedLayerId === targetId) return

    const oldIndex = layers.findIndex((l) => l.id === draggedLayerId)
    const newIndex = layers.findIndex((l) => l.id === targetId)

    if (oldIndex !== -1 && newIndex !== -1) {
      const next = [...layers]
      const [removed] = next.splice(oldIndex, 1)
      next.splice(newIndex, 0, removed)
      reorderLayers(next)
    }
    setDraggedLayerId(null)
  }

  const confirmDeleteLayer = (layer: Layer) => {
    setConfirmDialog({
      open: true,
      title: 'Delete Layer',
      description: `Are you sure you want to delete layer "${layer.name}"?`,
      action: () => deleteLayer(layer.id),
    })
  }

  const hasCollision = layers.some((l) => l.type === 'collision')
  const hasTerrain = layers.some((l) => l.type === 'terrain')
  const hasEncounters = layers.some((l) => l.type === 'encounters')

  if (!activeMap) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground p-8 text-center select-none">
        <p className="text-xs">Select a map to view layers</p>
      </div>
    )
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger className="block min-h-full h-full w-full">
        <div className="min-h-full h-full w-full space-y-1">
          {layers.map((layer) => {
            const isEditing = editingLayerId === layer.id
            const isSelected = activeLayerId === layer.id

            return (
              <ContextMenu key={layer.id}>
                <ContextMenuTrigger>
                  <div
                    draggable={!layer.locked && !isEditing}
                    onDragStart={(e) => handleDragStart(e, layer.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, layer.id)}
                    onClick={() => setActiveLayerId(layer.id)}
                    onDoubleClick={() => {
                      if (!layer.locked) startEditing(layer)
                    }}
                    className={`flex items-center py-1.5 px-2.5 rounded-md cursor-pointer text-sm transition-colors select-none ${
                      isSelected
                        ? 'bg-primary/30 text-primary-foreground font-medium border border-primary/40'
                        : 'hover:bg-sidebar-accent text-sidebar-foreground'
                    }`}
                  >
                    <div className="mr-2 shrink-0 opacity-80 cursor-grab active:cursor-grabbing">
                      {getLayerIcon(layer.type)}
                    </div>

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
                        className="flex-1 bg-black/40 border border-primary/60 rounded px-1 py-0.5 text-xs text-foreground outline-none font-mono"
                      />
                    ) : (
                      <span className="flex-1 truncate">{layer.name}</span>
                    )}

                    {/* Compact status indicators */}
                    <div className="flex items-center gap-1.5 ml-2 shrink-0 opacity-60">
                      {layer.locked && <Lock className="w-3.5 h-3.5 text-amber-400" />}
                      {!layer.visible && <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
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

          {layers.length === 0 && (
            <div className="h-40 flex items-center justify-center text-muted-foreground p-4 text-center select-none">
              <p className="text-xs">
                No layers yet.
                <br />
                <span className="text-[11px] opacity-70">Right-click here to create a layer.</span>
              </p>
            </div>
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-48">
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Plus className="w-3.5 h-3.5 mr-2" />
            New Layer
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuItem onClick={() => createLayerOfType('tile')}>
              Tile Layer
            </ContextMenuItem>
            <ContextMenuItem
              disabled={hasCollision}
              onClick={() => createLayerOfType('collision')}
            >
              Collision Layer
            </ContextMenuItem>
            <ContextMenuItem
              disabled={hasTerrain}
              onClick={() => createLayerOfType('terrain')}
            >
              Terrain Layer
            </ContextMenuItem>
            <ContextMenuItem
              disabled={hasEncounters}
              onClick={() => createLayerOfType('encounters')}
            >
              Encounters Layer
            </ContextMenuItem>
            <ContextMenuItem onClick={() => createLayerOfType('objects')}>
              Objects Layer
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  )
}
