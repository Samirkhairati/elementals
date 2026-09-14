import React from 'react'
import { Plus, Sparkles, Move, Box, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Layer, EntityData, ComponentType } from '@/types/editor'
import { COMPONENT_REGISTRY } from '@/lib/componentRegistry'
import { ComponentCard } from './entity/ComponentCard'

interface PropertiesPanelProps {
  layers: Layer[]
  activeLayerId: string | null
  updateLayers: (newLayers: Layer[]) => void
  entities?: EntityData[]
  selectedEntityId?: string | null
  renameEntity?: (id: string, name: string) => void
  moveEntity?: (id: string, x: number, y: number) => void
  addComponent?: (entityId: string, type: ComponentType) => void
  removeComponent?: (entityId: string, type: ComponentType) => void
  updateComponentProp?: (entityId: string, type: ComponentType, key: string, value: any) => void
  deleteEntity?: (id: string) => void
}

export function PropertiesPanel({
  layers,
  activeLayerId,
  updateLayers,
  entities = [],
  selectedEntityId = null,
  renameEntity,
  moveEntity,
  addComponent,
  removeComponent,
  updateComponentProp,
  deleteEntity,
}: PropertiesPanelProps) {
  // Check if an entity is currently selected
  const selectedEntity = selectedEntityId
    ? entities.find(e => e.id === selectedEntityId)
    : null

  // ── Entity Inspector View ─────────────────────────────────────────────────
  if (selectedEntity) {
    const attachedComponentTypes = Object.keys(
      selectedEntity.components || {}
    ) as ComponentType[]

    // Determine available components to add
    const availableComponentTypes = (Object.keys(COMPONENT_REGISTRY) as ComponentType[]).filter(
      type => {
        const schema = COMPONENT_REGISTRY[type]
        if (!schema) return false
        if (schema.singleton && selectedEntity.components[type]) {
          return false
        }
        return true
      }
    )

    return (
      <div className="w-full space-y-4 text-left font-mono">
        {/* Entity Header Card */}
        <div className="p-3 rounded-md border border-border/70 bg-card/60 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Box className="w-4 h-4 text-primary" />
              <span>Entity Inspector</span>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]">
              {selectedEntity.id.slice(0, 8)}…
            </span>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Name</label>
            <Input
              value={selectedEntity.name}
              onChange={e => renameEntity?.(selectedEntity.id, e.target.value)}
              className="h-8 text-xs font-mono bg-background/50 border-input/60"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">X (px)</label>
              <Input
                type="number"
                step={16}
                value={selectedEntity.x}
                onChange={e =>
                  moveEntity?.(
                    selectedEntity.id,
                    Number(e.target.value) || 0,
                    selectedEntity.y
                  )
                }
                className="h-8 text-xs font-mono bg-background/50 border-input/60"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Y (px)</label>
              <Input
                type="number"
                step={16}
                value={selectedEntity.y}
                onChange={e =>
                  moveEntity?.(
                    selectedEntity.id,
                    selectedEntity.x,
                    Number(e.target.value) || 0
                  )
                }
                className="h-8 text-xs font-mono bg-background/50 border-input/60"
              />
            </div>
          </div>
        </div>

        {/* Attached Components List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-medium text-muted-foreground">Components</span>

            {/* Add Component Dropdown */}
            {availableComponentTypes.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px] font-mono gap-1 border-dashed"
                  >
                    <Plus className="w-3 h-3" />
                    Add Component
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 font-mono text-xs max-h-60 overflow-y-auto">
                  {availableComponentTypes.map(type => (
                    <DropdownMenuItem
                      key={type}
                      onClick={() => addComponent?.(selectedEntity.id, type)}
                      className="cursor-pointer"
                    >
                      {COMPONENT_REGISTRY[type].label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div className="space-y-2">
            {attachedComponentTypes.map(type => (
              <ComponentCard
                key={type}
                type={type}
                props={selectedEntity.components[type] || {}}
                onUpdateProp={(key, val) =>
                  updateComponentProp?.(selectedEntity.id, type, key, val)
                }
                onRemove={() => removeComponent?.(selectedEntity.id, type)}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Layer Properties View (Fallback) ──────────────────────────────────────
  if (activeLayerId) {
    const layer = layers.find(l => l.id === activeLayerId)
    if (layer) {
      return (
        <div className="w-full space-y-4 text-left font-mono">
          <div className="p-3 rounded-md border border-border/70 bg-card/60 space-y-3">
            <div className="text-xs font-semibold text-foreground">Layer Properties</div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Name</label>
              <Input
                value={layer.name}
                onChange={e =>
                  updateLayers(
                    layers.map(l =>
                      l.id === activeLayerId ? { ...l, name: e.target.value } : l
                    )
                  )
                }
                className="h-8 text-xs font-mono bg-background/50 border-input/60"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Z-Index (z)</label>
              <Input
                type="number"
                value={layer.z === undefined ? '' : layer.z}
                onChange={e => {
                  const val = e.target.value === '' ? undefined : parseInt(e.target.value)
                  updateLayers(
                    layers.map(l => (l.id === activeLayerId ? { ...l, z: val } : l))
                  )
                }}
                placeholder="e.g. 0"
                className="h-8 text-xs font-mono bg-background/50 border-input/60"
              />
            </div>
          </div>
        </div>
      )
    }
  }

  return (
    <div className="my-auto text-xs text-muted-foreground text-center select-none p-4">
      Select a layer or entity to view properties
    </div>
  )
}
