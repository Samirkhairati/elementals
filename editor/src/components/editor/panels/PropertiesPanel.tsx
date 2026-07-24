import { Input } from '@/components/ui/input'
import { Layer } from '@/types/editor'

interface PropertiesPanelProps {
  layers: Layer[]
  activeLayerId: string | null
  updateLayers: (newLayers: Layer[]) => void
}

export function PropertiesPanel({ layers, activeLayerId, updateLayers }: PropertiesPanelProps) {
  if (!activeLayerId) {
    return <div className="my-auto">Select a layer to view properties</div>
  }

  const layer = layers.find(l => l.id === activeLayerId)
  if (!layer) return <div className="my-auto">Layer not found</div>

  return (
    <div className="w-full space-y-4 text-left font-mono">
      <div className="space-y-1">
        <label className="font-medium text-foreground">Name</label>
        <Input
          value={layer.name}
          onChange={e => updateLayers(layers.map(l => l.id === activeLayerId ? { ...l, name: e.target.value } : l))}
          className="h-8 text-xs font-mono"
        />
      </div>
      <div className="space-y-1">
        <label className="font-medium text-foreground">Z-Index (z)</label>
        <Input
          type="number"
          value={layer.z === undefined ? '' : layer.z}
          onChange={e => {
            const val = e.target.value === '' ? undefined : parseInt(e.target.value)
            updateLayers(layers.map(l => l.id === activeLayerId ? { ...l, z: val } : l))
          }}
          placeholder="e.g. 0"
          className="h-8 text-xs font-mono"
        />
      </div>
    </div>
  )
}
