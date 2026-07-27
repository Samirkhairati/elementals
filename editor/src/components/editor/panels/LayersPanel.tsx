import { useState } from 'react'
import { Eye, EyeOff, Lock, Unlock, Box, Layers as Layers2, Hexagon, XSquare, Droplet, Leaf, Trash2 } from 'lucide-react'
import { Layer, LayerType } from '@/types/editor'

function getLayerIcon(type: LayerType) {
  switch (type) {
    case 'tile': return <Layers2 className="w-4 h-4 text-gray-400" />
    case 'collision': return <XSquare className="w-4 h-4 text-red-400" />
    case 'terrain': return <Droplet className="w-4 h-4 text-blue-400" />
    case 'objects': return <Box className="w-4 h-4 text-gray-400" />
    case 'encounters': return <Leaf className="w-4 h-4 text-green-400" />
    default: return <Layers2 className="w-4 h-4 text-gray-400" />
  }
}

interface LayersPanelProps {
  layers: Layer[]
  activeLayerId: string | null
  setActiveLayerId: (id: string) => void
  toggleLayerVisibility: (id: string, shiftKey: boolean) => void
  toggleLayerLock: (id: string) => void
  deleteLayer: (id: string) => void
  reorderLayers: (newLayers: Layer[]) => void
}

export function LayersPanel({
  layers,
  activeLayerId,
  setActiveLayerId,
  toggleLayerVisibility,
  toggleLayerLock,
  deleteLayer,
  reorderLayers,
}: LayersPanelProps) {
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null)
  if (layers.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground p-8 text-center">
        <p className="text-xs">No layers yet.</p>
      </div>
    )
  }

  const specialTypes = ['collision', 'terrain', 'encounters']
  const normalLayers = layers.filter(l => !specialTypes.includes(l.type))
  const specialLayers = layers.filter(l => specialTypes.includes(l.type))

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedLayerId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!draggedLayerId || draggedLayerId === targetId) return
    
    const oldIndex = normalLayers.findIndex(l => l.id === draggedLayerId)
    const newIndex = normalLayers.findIndex(l => l.id === targetId)
    
    if (oldIndex !== -1 && newIndex !== -1) {
      const newNormalLayers = [...normalLayers]
      const [removed] = newNormalLayers.splice(oldIndex, 1)
      newNormalLayers.splice(newIndex, 0, removed)
      reorderLayers([...newNormalLayers, ...specialLayers])
    }
    setDraggedLayerId(null)
  }

  const renderLayer = (layer: Layer, isNormal: boolean) => (
    <div
      key={layer.id}
      onClick={() => setActiveLayerId(layer.id)}
      draggable={isNormal}
      onDragStart={(e) => isNormal && handleDragStart(e, layer.id)}
      onDragOver={(e) => isNormal && handleDragOver(e, layer.id)}
      onDrop={(e) => isNormal && handleDrop(e, layer.id)}
      className={`flex items-center group py-1.5 px-2 rounded-md cursor-pointer transition-colors ${activeLayerId === layer.id ? 'bg-primary/30 text-primary-foreground font-medium border border-primary/40' : 'hover:bg-sidebar-accent text-sidebar-foreground'} ${isNormal ? 'text-gray-400' : ''}`}
    >
      <div className={`mr-2 opacity-80 ${isNormal ? 'cursor-grab active:cursor-grabbing' : ''}`}>{getLayerIcon(layer.type)}</div>
      <span className="flex-1 truncate">{layer.name}</span>
      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 opacity-70 transition-opacity">
        {isNormal && (
          <button onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id) }} className="p-1 hover:bg-red-500/20 hover:text-red-400 rounded">
            <Trash2 className="w-3 h-3" />
          </button>
        )}
        <button onClick={(e) => { e.stopPropagation(); toggleLayerLock(layer.id) }} className="p-1 hover:bg-black/10 rounded">
          {layer.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
        </button>
        <button onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id, e.shiftKey) }} className="p-1 hover:bg-black/10 rounded">
          {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-1">
      {normalLayers.map(l => renderLayer(l, true))}
      
      {normalLayers.length > 0 && specialLayers.length > 0 && (
        <div className="h-px bg-sidebar-border my-2" />
      )}
      
      {specialLayers.map(l => renderLayer(l, false))}
    </div>
  )
}
