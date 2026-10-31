import React from 'react'
import { ArrowLeft, Plus } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Layer, EntityData, ComponentType, type PropBag } from '@/types/editor'
import { COMPONENT_REGISTRY } from '@/lib/componentRegistry'
import { COMPONENT_TYPES } from '../../../../../shared/engine/components'
import { entityIconName, pxToTile, summarizeEntity, tileToPxClamped } from '@/lib/entityVisuals'
import { ComponentCard } from './entity/ComponentCard'
import { Badge, EdButton, Field, NumberField, ReadoutField, TextField } from '../ui/controls'
import { accentVar, NamedIcon } from '../ui/icons'
import { SpriteThumb } from '../sprites/SpriteThumb'
import { useEditorSelector, type EditorContextValue } from '../layout/EditorContext'

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
  updateComponentProp?: (entityId: string, type: ComponentType, key: string, value: unknown) => void
  updateComponentProps?: (entityId: string, type: ComponentType, patch: PropBag) => void
  deleteEntity?: (id: string) => void
  /** Leave the entity inspector (clears the selection, which brings the other sidebar panels back). */
  onBack?: () => void
}

const selectSpriteAssets = (c: EditorContextValue) => c.spriteAssets
const selectMapSize = (c: EditorContextValue) => ({ cols: c.activeMap?.width, rows: c.activeMap?.height })

/** Entities show their sprite when they have one, else the icon that fits what they are. */
function EntityGlyph({ entity }: { entity: EntityData }) {
  const assets = useEditorSelector(selectSpriteAssets)
  const asset = entity.components.Sprite?.asset ? assets?.[entity.components.Sprite.asset] : undefined
  return (
    <div className="ed-checker flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border">
      {asset ? <SpriteThumb asset={asset} size={32} /> : <NamedIcon name={entityIconName(entity)} className="h-4 w-4 text-muted-foreground" />}
    </div>
  )
}

function AddComponentMenu({ entity, addComponent }: { entity: EntityData; addComponent?: (entityId: string, type: ComponentType) => void }) {
  const available = COMPONENT_TYPES.filter((type) => {
    const schema = COMPONENT_REGISTRY[type]
    return schema && !(schema.singleton && entity.components[type])
  })
  if (available.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <EdButton size="sm" variant="dashed" aria-label="Add component">
          <Plus />
          Add component
        </EdButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-1">
        <DropdownMenuLabel className="px-2 py-1 text-ed-label font-normal text-muted-foreground">Components give an entity abilities</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {available.map((type) => {
          const schema = COMPONENT_REGISTRY[type]
          return (
            <DropdownMenuItem key={type} onClick={() => addComponent?.(entity.id, type)} className="flex items-start gap-2 px-2 py-2" aria-label={`Add ${schema.label}`}>
              <span
                className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                style={{ background: `hsl(${accentVar(schema.accent)} / 0.16)`, color: `hsl(${accentVar(schema.accent)})` }}
              >
                <NamedIcon name={schema.icon} className="ed-icon" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-ed-body text-foreground">{schema.label}</span>
                <span className="block text-ed-label leading-4 text-muted-foreground">{schema.description}</span>
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
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
  updateComponentProps,
  onBack,
}: PropertiesPanelProps) {
  const map = useEditorSelector(selectMapSize)
  const selectedEntity = selectedEntityId ? entities.find((e) => e.id === selectedEntityId) : null

  // ── Entity Inspector View ─────────────────────────────────────────────────
  if (selectedEntity) {
    const attachedTypes = COMPONENT_TYPES.filter((t) => selectedEntity.components?.[t])
    const summary = summarizeEntity(selectedEntity)
    const tile = pxToTile(selectedEntity.x, selectedEntity.y)

    return (
      <div className="flex w-full flex-col gap-3 text-left" data-testid="entity-inspector">
        {onBack && (
          <button type="button" onClick={onBack} className="ed-btn self-start" data-size="sm" aria-label="Back to layers">
            <ArrowLeft />
            Back to layers
          </button>
        )}

        {/* Entity header */}
        <section className="ed-card">
          <div className="flex items-center gap-3 p-3">
            <EntityGlyph entity={selectedEntity} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <TextField value={selectedEntity.name} onCommit={(name) => name.trim() && renameEntity?.(selectedEntity.id, name)} aria-label="Entity name" />
              <div className="flex flex-wrap items-center gap-1">
                {summary.hasEvent && <Badge tone="event">Event</Badge>}
                {summary.controller && summary.controller !== 'none' && <Badge tone="move">{summary.controller}</Badge>}
                {summary.solid === true && <Badge tone="solid">solid</Badge>}
                {summary.solid === false && <Badge tone="trigger">trigger</Badge>}
                <span className="truncate text-[10px] text-muted-foreground" title={selectedEntity.id}>
                  {selectedEntity.id.slice(0, 8)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 border-t border-border/40 bg-background/30 p-3">
            <Field label="Tile" info="Column and row of the tile the entity stands on.">
              <div className="flex w-full items-center gap-2">
                <NumberField
                  value={tile.col}
                  min={0}
                  max={map.cols ? map.cols - 1 : undefined}
                  unit="col"
                  aria-label="Tile column"
                  onCommit={(col) => {
                    const p = tileToPxClamped(col, tile.row, map.cols, map.rows)
                    moveEntity?.(selectedEntity.id, p.x, p.y)
                  }}
                />
                <NumberField
                  value={tile.row}
                  min={0}
                  max={map.rows ? map.rows - 1 : undefined}
                  unit="row"
                  aria-label="Tile row"
                  onCommit={(row) => {
                    const p = tileToPxClamped(tile.col, row, map.cols, map.rows)
                    moveEntity?.(selectedEntity.id, p.x, p.y)
                  }}
                />
              </div>
            </Field>
            <ReadoutField label="Anchor" info="Where the entity stands, in pixels: the bottom-centre of its tile. It follows from Tile and is not edited directly." testId="pixel-readout">
              {selectedEntity.x}, {selectedEntity.y} px
            </ReadoutField>
          </div>
        </section>

        {/* Components */}
        <div className="flex flex-col gap-2">
          <div className="flex h-row items-center justify-between">
            <span className="ed-section-title">Components</span>
            <AddComponentMenu entity={selectedEntity} addComponent={addComponent} />
          </div>

          {attachedTypes.map((type) => (
            <ComponentCard
              key={type}
              type={type}
              props={selectedEntity.components[type] || {}}
              entityId={selectedEntity.id}
              components={selectedEntity.components as Record<string, PropBag>}
              onUpdateProp={(key, val) => updateComponentProp?.(selectedEntity.id, type, key, val)}
              onUpdateProps={(patch) => updateComponentProps?.(selectedEntity.id, type, patch)}
              onRemove={() => removeComponent?.(selectedEntity.id, type)}
            />
          ))}
        </div>
      </div>
    )
  }

  // ── Layer Properties View (Fallback) ──────────────────────────────────────
  if (activeLayerId) {
    const layer = layers.find((l) => l.id === activeLayerId)
    if (layer) {
      return (
        <div className="flex w-full flex-col gap-3 text-left">
          <section className="ed-card">
            <div className="ed-card-head">
              <span className="ed-section-title flex-1">Layer</span>
            </div>
            <div className="ed-card-body">
              <Field label="Name">
                <TextField value={layer.name} onCommit={(name) => updateLayers(layers.map((l) => (l.id === activeLayerId ? { ...l, name } : l)))} aria-label="Layer name" />
              </Field>
              <Field label="Z-index" hint="Draw order of the layer">
                <NumberField
                  value={layer.z ?? 0}
                  aria-label="Layer z-index"
                  onCommit={(z) => updateLayers(layers.map((l) => (l.id === activeLayerId ? { ...l, z } : l)))}
                />
              </Field>
            </div>
          </section>
        </div>
      )
    }
  }

  return <div className="ed-empty select-none">Select a layer or an entity to see its properties</div>
}
