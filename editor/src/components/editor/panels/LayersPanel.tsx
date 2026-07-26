import { Eye, EyeOff, Lock, Unlock, Box, Layers as Layers2, Hexagon, XSquare, Droplet, Leaf } from 'lucide-react'
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
}

export function LayersPanel({
  layers,
  activeLayerId,
  setActiveLayerId,
  toggleLayerVisibility,
  toggleLayerLock,
}: LayersPanelProps) {
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

  const renderLayer = (layer: Layer, isNormal: boolean) => (
    <div
      key={layer.id}
      onClick={() => setActiveLayerId(layer.id)}
      className={`flex items-center group py-1.5 px-2 rounded-md cursor-pointer transition-colors ${activeLayerId === layer.id ? 'bg-primary/30 text-primary-foreground font-medium border border-primary/40' : 'hover:bg-sidebar-accent text-sidebar-foreground'} ${isNormal ? 'text-gray-400' : ''}`}
    >
      <div className="mr-2 opacity-80">{getLayerIcon(layer.type)}</div>
      <span className="flex-1 truncate">{layer.name}</span>
      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 opacity-70 transition-opacity">
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
