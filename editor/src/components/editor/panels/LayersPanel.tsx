import { Eye, EyeOff, Lock, Unlock, Box, ImageIcon, CheckSquare, Hexagon } from 'lucide-react'
import { Layer, LayerType } from '@/types/editor'

function getLayerIcon(type: LayerType) {
  switch (type) {
    case 'tile': return <ImageIcon className="w-4 h-4 text-blue-400" />
    case 'collision': return <Hexagon className="w-4 h-4 text-red-400" />
    case 'terrain': return <CheckSquare className="w-4 h-4 text-green-400" />
    case 'objects': return <Box className="w-4 h-4 text-orange-400" />
  }
}

interface LayersPanelProps {
  layers: Layer[]
  activeLayerId: string | null
  setActiveLayerId: (id: string) => void
  toggleLayerVisibility: (id: string) => void
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

  return (
    <div className="space-y-1">
      {layers.map(layer => (
        <div
          key={layer.id}
          onClick={() => setActiveLayerId(layer.id)}
          className={`flex items-center group py-1.5 px-2 rounded-md cursor-pointer transition-colors ${activeLayerId === layer.id ? 'bg-primary/30 text-primary-foreground font-medium border border-primary/40' : 'hover:bg-sidebar-accent text-sidebar-foreground'}`}
        >
          <div className="mr-2 opacity-80">{getLayerIcon(layer.type)}</div>
          <span className="flex-1 truncate">{layer.name}</span>
          <div className="hidden group-hover:flex items-center gap-1 opacity-70">
            <button onClick={(e) => { e.stopPropagation(); toggleLayerLock(layer.id) }} className="p-1 hover:bg-black/10 rounded">
              {layer.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id) }} className="p-1 hover:bg-black/10 rounded">
              {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
