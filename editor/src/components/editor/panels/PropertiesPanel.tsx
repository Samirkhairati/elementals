// The Properties panel (dock panel `inspector`, the top of the right sidebar): everything about the selected node. One
// layout for every node, like Godot's inspector: the node (name, type, visible, locked), its tag, its transform (anchor,
// rotation, origin), how it draws (z, opacity), then what only some nodes have (an entity's components). A Look node
// shows the look editor instead; the map's look while its Look row in the Scene panel is open.

import React, { useEffect } from 'react'
import { Link2, Link2Off, Lock, LockOpen, Plus } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EntityData, ComponentType, type PropBag } from '@/types/editor'
import { NODE_TYPES, isBranch, isLayerNode, nodeAnchor, type SceneNode, type WalkEntry } from '../../../../../shared/sceneTree'
import { entityOf, sceneIndex } from '@/lib/sceneIndex'
import { COMPONENT_REGISTRY } from '@/lib/componentRegistry'
import { COMPONENT_TYPES } from '../../../../../shared/engine/components'
import { entityIconName, summarizeEntity } from '@/lib/entityVisuals'
import { OVERLAY_COLORS } from '@/hooks/editor/canvas/canvasView'
import { getLookView, setLookView, useLookView, type LookSubjectRef } from '@/lib/look/lookView'
import { ComponentCard } from './entity/ComponentCard'
import { Badge, Card, EdButton, EyeButton, Field, IconButton, NumberField, TextField, Toggle } from '../ui/controls'
import { accentVar, NamedIcon } from '../ui/icons'
import { Slider } from '../ui/fields'
import { SpriteThumb } from '../sprites/SpriteThumb'
import { NodeTypeIcon } from './SceneTree'
import { LookPanel } from '../look/LookPanel'
import { useEditorSelector, type EditorContextValue } from '../layout/EditorContext'

const NO_NODES: SceneNode[] = []

const selectProperties = (c: EditorContextValue) => ({
  nodes: c.activeMap?.nodes ?? NO_NODES,
  hasMap: !!c.activeMap,
  primaryId: c.selectionView.primaryId,
  spriteAssets: c.spriteAssets,
  editNode: c.editNode,
  placeNodeAt: c.placeNodeAt,
  rotateNodeTo: c.rotateNodeTo,
  setNodeTagOf: c.setNodeTagOf,
  toggleNodeVisibility: c.toggleNodeVisibility,
  toggleNodeLock: c.toggleNodeLock,
  entities: c.entities,
  addComponent: c.handleAddComponent,
  removeComponent: c.handleRemoveComponent,
  updateComponentProp: c.handleUpdateComponentProp,
  updateComponentProps: c.handleUpdateComponentProps,
})

/** Entities show their sprite when they have one, else the icon that fits what they are. */
function EntityGlyph({ entity }: { entity: EntityData }) {
  const assets = useEditorSelector((c: EditorContextValue) => c.spriteAssets)
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
    return schema && type !== 'Tag' && !(schema.singleton && entity.components[type])
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
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="font-normal normal-case tracking-normal">Components give a node abilities</DropdownMenuLabel>
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

/** The owner a selected Look node grades: a picture, or a layer / Node. */
function lookSubjectOf(entry: WalkEntry): LookSubjectRef | null {
  const owner = entry.ancestors[entry.ancestors.length - 1]
  if (!owner) return null
  if (owner.type === 'picture') {
    const host = entry.ancestors[entry.ancestors.length - 2]
    return host ? { kind: 'picture', layerId: host.id, imageId: owner.id } : null
  }
  return { kind: 'layer', layerId: owner.id }
}

// The 3×3 origin picker of a sprite: where on the picture its anchor sits.
const ORIGINS: readonly [number, number][] = [
  [0, 0], [0.5, 0], [1, 0],
  [0, 0.5], [0.5, 0.5], [1, 0.5],
  [0, 1], [0.5, 1], [1, 1],
]

function OriginPicker({ x, y, disabled, onPick }: { x: number; y: number; disabled?: boolean; onPick: (x: number, y: number) => void }) {
  return (
    <div className="grid w-[52px] shrink-0 grid-cols-3 gap-0.5" role="radiogroup" aria-label="Origin">
      {ORIGINS.map(([ox, oy]) => {
        const on = ox === x && oy === y
        return (
          <button
            key={`${ox},${oy}`}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`Origin ${ox}, ${oy}`}
            title={`Anchor at ${ox * 100}% across, ${oy * 100}% down`}
            disabled={disabled}
            onClick={() => onPick(ox, oy)}
            className="flex h-4 items-center justify-center rounded-sm border border-border bg-background/40 hover:border-primary/60 aria-checked:border-primary aria-checked:bg-primary/25"
          >
            <span className={on ? 'size-1.5 rounded-full bg-primary' : 'size-1 rounded-full bg-muted-foreground/50'} />
          </button>
        )
      })}
    </div>
  )
}

function TagField({ node, setTag, disabled }: { node: SceneNode; setTag: (patch: { tag?: string; color?: string }) => void; disabled?: boolean }) {
  const tag = node.type === 'entity' ? (node.components?.Tag as { tag?: string; color?: string } | undefined) : undefined
  return (
    <>
      <Field label="Tag" info="A free label to find the node by (npc, chest, warp...). Giving a plain Node a tag makes it an entity of the game, so events can refer to it.">
        <TextField value={tag?.tag ?? ''} placeholder="e.g. npc, chest, warp" aria-label="Tag" disabled={disabled} onCommit={(v) => setTag({ tag: v.trim() })} />
      </Field>
      {node.type === 'entity' && (
        <Field label="Colour" info="Tint of its Area and StaticBody shapes on the map">
          <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Tag colour">
            {OVERLAY_COLORS.map((c) => (
              <button
                key={c.id || 'white'}
                type="button"
                role="radio"
                aria-checked={(tag?.color ?? '') === c.id}
                aria-label={c.label}
                title={c.label}
                disabled={disabled}
                onClick={() => setTag({ color: c.id })}
                className="h-4 w-4 rounded-full border border-black/40 aria-checked:ring-2 aria-checked:ring-primary aria-checked:ring-offset-1 aria-checked:ring-offset-background"
                style={{ background: `rgb(${c.rgb})` }}
              />
            ))}
          </div>
        </Field>
      )}
    </>
  )
}

export function PropertiesPanel() {
  const ctx = useEditorSelector(selectProperties)
  const lookView = useLookView()
  const [carry, setCarry] = React.useState(true)

  // Picking a node closes the map's look.
  useEffect(() => {
    if (ctx.primaryId && getLookView().pinned?.kind === 'map') setLookView({ pinned: null })
  }, [ctx.primaryId])

  if (!ctx.hasMap) return <div className="ed-empty select-none">No map open</div>

  const index = sceneIndex(ctx.nodes)
  const entry = ctx.primaryId ? index.byId.get(ctx.primaryId) : undefined

  if (!entry) {
    if (lookView.pinned?.kind === 'map') return <LookPanel subject={{ kind: 'map' }} />
    return <div className="ed-empty select-none">Select a node in the Scene panel or on the map to see its properties</div>
  }

  if (entry.node.type === 'look') {
    const subject = lookSubjectOf(entry)
    if (subject) return <LookPanel subject={subject} />
  }

  // A component node (AnimatedSprite, Area...) or its shape shows the node it belongs to, with its components.
  const owner = entityOf(index, entry.node.id)
  const node: SceneNode = owner && owner.id !== entry.node.id ? owner : entry.node
  const nodeEntry = index.byId.get(node.id)!
  const locked = node.locked === true || nodeEntry.ancestors.some((a) => a.locked === true)
  const kind = NODE_TYPES[node.type]
  const anchor = nodeAnchor(node)
  const entity = node.type === 'entity' ? ctx.entities.find((e) => e.id === node.id) : undefined
  const picture = node.type === 'picture' ? node : undefined
  const rotatable = node.type === 'group' || node.type === 'entity' || node.type === 'picture'
  const rotation = rotatable ? ((node as { rotation?: number }).rotation ?? 0) : 0
  const hasLayerZ = isLayerNode(node) && node.type !== 'collision'

  return (
    <div className="flex w-full flex-col gap-3 text-left" data-testid="node-inspector">
      {/* the node */}
      <section className="ed-card">
        <div className="flex items-center gap-2.5 p-3">
          {entity ? (
            <EntityGlyph entity={entity} />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background/40 [&>svg]:size-4">
              <NodeTypeIcon type={node.type} />
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <TextField value={node.name} disabled={locked} onCommit={(name) => name.trim() && ctx.editNode(node.id, { name: name.trim() })} aria-label="Node name" />
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-ed-label text-muted-foreground" title={kind.description}>
                {kind.label}
              </span>
              {entity && <EntityBadges entity={entity} />}
              <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground/70" title={node.id}>
                {node.id.slice(0, 8)}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-0.5">
            <EyeButton name={node.name || kind.label} visible={node.visible !== false} onToggle={() => ctx.toggleNodeVisibility(node.id)} />
            <IconButton aria-label={node.locked ? 'Unlock' : 'Lock'} title={node.locked ? 'Locked: click to unlock' : 'Lock it so the map cannot change it'} active={node.locked === true} onClick={() => ctx.toggleNodeLock(node.id)}>
              {node.locked ? <Lock /> : <LockOpen />}
            </IconButton>
          </div>
        </div>
        {isBranch(node) && (
          <div className="flex flex-col gap-2 border-t border-border/40 bg-background/30 p-3">
            <TagField node={node} disabled={locked} setTag={(patch) => ctx.setNodeTagOf(node.id, patch)} />
          </div>
        )}
      </section>

      {/* transform */}
      {anchor && (
        <Card
          caps
          title="Transform"
          info={
            picture
              ? 'Position: where the sprite\'s anchor stands, in map pixels. Origin: where on the picture the anchor sits (bottom centre by default); the picture turns around it.'
              : 'Position: the node\'s anchor, in map pixels. Moving or turning a node carries everything inside it along, like Godot. Unlink to move only the anchor (its origin) and leave the children where they are; Alt-drag on the map does the same.'
          }
          actions={
            !picture ? (
              <IconButton
                aria-label={carry ? 'Children follow' : 'Anchor only'}
                aria-pressed={!carry}
                title={carry ? 'Children follow the node (click to move only its anchor)' : 'Only the anchor moves: the children stay (click to move them along again)'}
                active={!carry}
                onClick={() => setCarry((c) => !c)}
              >
                {carry ? <Link2 /> : <Link2Off />}
              </IconButton>
            ) : undefined
          }
        >
          <Field label={!picture && !carry ? 'Origin' : 'Position'}>
            <div className="grid w-full grid-cols-2 gap-1">
              <NumberField value={anchor.x} unit="x" disabled={locked} aria-label="Position X" onCommit={(x) => ctx.placeNodeAt(node.id, x, anchor.y, carry)} />
              <NumberField value={anchor.y} unit="y" disabled={locked} aria-label="Position Y" onCommit={(y) => ctx.placeNodeAt(node.id, anchor.x, y, carry)} />
            </div>
          </Field>
          {rotatable && (
            <Field label="Rotation" info={picture ? 'Degrees, clockwise, around the origin' : 'Degrees, clockwise, around the anchor: turns its AnimatedSprite and the sprites and nodes inside it'}>
              <div className="flex w-full items-center gap-2">
                <Slider
                  aria-label="Rotation slider"
                  className="min-w-0"
                  min={-180}
                  max={180}
                  step={1}
                  origin={0}
                  value={Math.max(-180, Math.min(180, rotation))}
                  disabled={locked}
                  onChange={() => {}}
                  onRelease={(r) => ctx.rotateNodeTo(node.id, r, carry)}
                />
                <NumberField value={rotation} min={-360} max={360} unit="°" size="sm" disabled={locked} aria-label="Rotation" onCommit={(r) => ctx.rotateNodeTo(node.id, r, carry)} />
              </div>
            </Field>
          )}
          {picture && (
            <>
              <Field label="Origin" info="Where on the picture its anchor sits, as fractions of its size: 0.5, 1 is the bottom centre">
                <div className="flex w-full items-center gap-2">
                  <OriginPicker x={picture.originX ?? 0.5} y={picture.originY ?? 1} disabled={locked} onPick={(ox, oy) => ctx.editNode(picture.id, { originX: ox === 0.5 ? undefined : ox, originY: oy === 1 ? undefined : oy })} />
                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-1">
                    <NumberField value={picture.originX ?? 0.5} min={0} max={1} step={0.05} unit="x" disabled={locked} aria-label="Origin X" onCommit={(ox) => ctx.editNode(picture.id, { originX: ox === 0.5 ? undefined : ox })} />
                    <NumberField value={picture.originY ?? 1} min={0} max={1} step={0.05} unit="y" disabled={locked} aria-label="Origin Y" onCommit={(oy) => ctx.editNode(picture.id, { originY: oy === 1 ? undefined : oy })} />
                  </div>
                </div>
              </Field>
              <Field label="Flip">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-ed-label">
                    <Toggle checked={!!picture.flipX} disabled={locked} aria-label="Flip horizontally" onChange={(flipX) => ctx.editNode(picture.id, { flipX: flipX || undefined })} /> X
                  </label>
                  <label className="flex items-center gap-1.5 text-ed-label">
                    <Toggle checked={!!picture.flipY} disabled={locked} aria-label="Flip vertically" onChange={(flipY) => ctx.editNode(picture.id, { flipY: flipY || undefined })} /> Y
                  </label>
                </div>
              </Field>
            </>
          )}
        </Card>
      )}

      {/* drawing */}
      {(isBranch(node) || picture || hasLayerZ) && (
        <Card caps title="Drawing">
          {hasLayerZ && (
            <Field label="Z-index" info="Draw order of the layer in the game: higher draws on top, equal keeps the list order">
              <NumberField value={(node as { z?: number }).z ?? 0} integer disabled={locked} aria-label="Layer z-index" onCommit={(z) => ctx.editNode(node.id, { z })} />
            </Field>
          )}
          {picture && (
            <>
              <Field label="Z-index" info="Draw order among the sprites next to it; higher draws on top">
                <NumberField value={picture.z ?? 0} integer disabled={locked} aria-label="Sprite z-index" onCommit={(z) => ctx.editNode(picture.id, { z })} />
              </Field>
              <Field label="Opacity">
                <NumberField value={picture.opacity ?? 1} min={0} max={1} step={0.05} disabled={locked} aria-label="Sprite opacity" onCommit={(o) => ctx.editNode(picture.id, { opacity: o === 1 ? undefined : o })} />
              </Field>
            </>
          )}
          {entity && (
            <Field label="Depth" info="Game depth of its AnimatedSprite among the characters: higher draws on top; equal depths sort by y">
              <NumberField
                value={typeof entity.components.Transform?.depth === 'number' ? entity.components.Transform.depth : 10}
                integer
                disabled={locked}
                aria-label="Depth"
                onCommit={(d) => ctx.updateComponentProp(entity.id, 'Transform', 'depth', d)}
              />
            </Field>
          )}
          {isBranch(node) && (
            <>
              <Field label="Z-index" info="Game depth of the sprites inside that have no nearer z: higher draws on top">
                <NumberField value={node.z ?? 0} integer disabled={locked} aria-label="Node z-index" onCommit={(z) => ctx.editNode(node.id, { z })} />
              </Field>
              <Field label="Opacity" info="Multiplies the opacity of the sprites inside (1 = opaque)">
                <NumberField value={node.opacity ?? 1} min={0} max={1} step={0.05} disabled={locked} aria-label="Node opacity" onCommit={(o) => ctx.editNode(node.id, { opacity: o === 1 ? undefined : o })} />
              </Field>
              <Field label="Pick as one" info="A click on one of its sprites on the map picks all of them (select this node in the Scene panel to pick single ones)">
                <Toggle aria-label="Pick sprites as one" checked={node.pickAsOne === true} onChange={(on) => ctx.editNode(node.id, { pickAsOne: on ? true : undefined })} />
              </Field>
            </>
          )}
        </Card>
      )}

      {/* components */}
      {entity && (
        <div className="flex flex-col gap-2">
          <div className="flex h-row items-center justify-between">
            <span className="ed-section-title">Components</span>
            <AddComponentMenu entity={entity} addComponent={ctx.addComponent} />
          </div>
          {/* Transform and Tag are the node's own fields above */}
          {COMPONENT_TYPES.filter((t) => t !== 'Tag' && t !== 'Transform' && entity.components?.[t]).map((type) => (
            <ComponentCard
              key={type}
              type={type}
              props={entity.components[type] || {}}
              entityId={entity.id}
              components={entity.components as Record<string, PropBag>}
              onUpdateProp={(key, val) => ctx.updateComponentProp(entity.id, type, key, val)}
              onUpdateProps={(patch) => ctx.updateComponentProps(entity.id, type, patch)}
              onRemove={() => ctx.removeComponent(entity.id, type)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EntityBadges({ entity }: { entity: EntityData }) {
  const summary = summarizeEntity(entity)
  return (
    <>
      {summary.hasEvent && <Badge tone="event">Event</Badge>}
      {summary.controller && summary.controller !== 'none' && <Badge tone="move">{summary.controller}</Badge>}
      {entity.components.Collider && summary.solid === true && <Badge tone="solid">solid</Badge>}
      {entity.components.Collider && summary.solid === false && <Badge tone="trigger">trigger</Badge>}
    </>
  )
}
