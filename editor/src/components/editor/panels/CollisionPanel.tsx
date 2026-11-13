import { useState } from 'react'
import { Edit2, Grid3x3, Pentagon, Plus, Spline, Trash2 } from 'lucide-react'
import type { Layer } from '@/types/editor'
import { minPoints } from '../../../../../shared/collisionShapes'
import { collisionItems, nextTileGroupName, removeCollisionItem, renameCollisionItem, type CollisionItem } from '../../../../../shared/collisionLayers'
import { polygonEditStore, usePolygonEdit, type CollisionBrush } from '@/lib/polygonEditStore'
import { useEditorSelector, type EditorContextValue } from '../layout/EditorContext'
import { Badge, EdButton, Field, InfoTip, Segmented } from '../ui/controls'
import { RenameInput } from '../ui/RenameInput'
import { ShapeEditorHelp } from './ShapeEditorHelp'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'

const selectCollision = (c: EditorContextValue) => ({
  layers: c.layers,
  activeLayerId: c.activeLayerId,
  updateLayers: c.updateLayers,
  selectedEntityId: c.selectedEntityId,
})

/** The icon of an item: painted tiles, a closed polygon or an open line. */
export function CollisionItemIcon({ item, className }: { item: Pick<CollisionItem, 'kind'> & { closed?: boolean }; className?: string }) {
  if (item.kind === 'tiles') return <Grid3x3 className={className ?? 'text-red-400'} />
  return item.closed ? <Pentagon className={className ?? 'text-red-400'} /> : <Spline className={className ?? 'text-red-400'} />
}

/** Picks an item of the list: its brush comes with it (a tiles item paints, a shape is edited on the map). */
export function pickCollisionItem(item: CollisionItem | null): void {
  if (!item) polygonEditStore.set({ selectedShapeId: null })
  else polygonEditStore.set({ selectedShapeId: item.id, brush: item.kind === 'tiles' ? 'tiles' : 'shape' })
}

/**
 * The right sidebar while a collision layer is active (see useDockviewLayout): the layer's items (sets of painted tiles
 * and shapes), the brush, and the picked shape. A click on the map paints the picked tiles item with the Tiles brush,
 * or draws and edits shapes with the Shape brush.
 */
export function CollisionPanel() {
  const { layers, activeLayerId, updateLayers, selectedEntityId } = useEditorSelector(selectCollision)
  const { selectedShapeId, brush, drawing } = usePolygonEdit()
  const [renaming, setRenaming] = useState<string | null>(null)
  const layer = layers.find((l) => l.id === activeLayerId)
  if (!layer || layer.type !== 'collision') return <div className="ed-empty">Select a collision layer</div>

  const items = collisionItems(layer)
  const picked = items.find((i) => i.id === selectedShapeId) ?? null
  const pickedShape = picked?.kind === 'shape' ? layer.shapes?.find((s) => s.id === picked.id) ?? null : null
  const locked = layer.locked
  const setLayer = (next: Layer) => updateLayers(layers.map((l) => (l.id === layer.id ? next : l)))

  const addTiles = () => {
    const group = { id: crypto.randomUUID(), name: nextTileGroupName(layer) }
    setLayer({ ...layer, tileGroups: [...(layer.tileGroups ?? []), group] })
    polygonEditStore.set({ selectedShapeId: group.id, brush: 'tiles' })
  }
  const addShape = () => polygonEditStore.set({ selectedShapeId: null, brush: 'shape' })
  const remove = (item: CollisionItem) => {
    setLayer(removeCollisionItem(layer, item.id))
    if (selectedShapeId === item.id) polygonEditStore.set({ selectedShapeId: null })
  }
  const setBrush = (next: CollisionBrush) => {
    // A brush of the other kind lets go of the picked item (a tiles item cannot be drawn with the shape brush, and back).
    if (picked && (picked.kind === 'tiles') !== (next === 'tiles')) polygonEditStore.set({ selectedShapeId: null, brush: next })
    else polygonEditStore.set({ brush: next })
  }

  const status =
    selectedEntityId !== null
      ? 'An entity is selected: click an empty spot of the map (or press Esc) to edit this layer.'
      : brush === 'tiles'
        ? picked?.kind === 'tiles'
          ? `Painting into ${picked.name}`
          : 'Painting makes a new tiles item'
        : drawing
          ? 'Drawing a shape…'
          : 'Click on the map to draw a shape'

  return (
    <div className="flex w-full flex-col gap-3 text-left" data-testid="collision-panel">
      <section className="ed-card">
        <div className="ed-card-head">
          <span className="ed-section-title min-w-0 flex-1 truncate" title={`Collision · ${layer.name}`}>Collision · {layer.name}</span>
          <InfoTip label="How collision layers work">
            Everything on a collision layer blocks movement in the game, shown or hidden. Its items are sets of painted
            tiles and single shapes. With the Tiles brush, painting and erasing work like on a tile layer (brush,
            rectangle, bucket, eraser) and new tiles go into the picked tiles item. With the Shape brush, clicks draw and
            edit shapes. A map can have several collision layers.
          </InfoTip>
          <ShapeEditorHelp />
          <Badge>{items.length}</Badge>
        </div>
        <div className="ed-card-body flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Segmented<CollisionBrush>
              aria-label="Collision brush"
              value={brush}
              onChange={setBrush}
              options={[
                { value: 'tiles', label: 'Tiles', icon: <Grid3x3 />, title: 'Paint collision tiles (the tile cursor)' },
                { value: 'shape', label: 'Shape', icon: <Pentagon />, title: 'Draw polygons and lines (the crosshair)' },
              ]}
            />
            <div className="flex-1" />
            <EdButton size="sm" disabled={locked} onClick={addTiles} title="A new set of painted tiles: paint on the map to fill it" aria-label="New tiles item">
              <Plus /> Tiles
            </EdButton>
            <EdButton size="sm" disabled={locked} onClick={addShape} title="Draw a new polygon or line on the map" aria-label="New shape">
              <Plus /> Shape
            </EdButton>
          </div>
          <div className="text-xs text-muted-foreground" data-testid="collision-status">
            {status}
            {locked && ' · locked'}
          </div>
          {items.length === 0 ? (
            <p className="ed-hint">No items yet: paint tiles or draw a shape on the map.</p>
          ) : (
            <div className="flex flex-col gap-0.5" data-testid="collision-items">
              {items.map((item) => (
                <ContextMenu key={item.id}>
                  <ContextMenuTrigger asChild>
                    <div
                      className="ed-row"
                      data-testid="collision-item"
                      data-selected={item.id === selectedShapeId ? 'true' : undefined}
                      onClick={() => pickCollisionItem(item.id === selectedShapeId ? null : item)}
                      onDoubleClick={() => !locked && setRenaming(item.id)}
                    >
                      <CollisionItemIcon item={item} />
                      {renaming === item.id ? (
                        <RenameInput initial={item.name} label="Item name" onRename={(name) => setLayer(renameCollisionItem(layer, item.id, name))} onClose={() => setRenaming(null)} />
                      ) : (
                        <span className="ed-row-label" title={item.name}>{item.name}</span>
                      )}
                      <span className="ed-badge" data-tone="count" title={item.kind === 'tiles' ? 'Painted tiles' : 'Points'}>
                        {item.count}
                        {item.kind === 'tiles' ? ' tiles' : ' pts'}
                      </span>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-44" onCloseAutoFocus={(e) => e.preventDefault()}>
                    <ContextMenuItem disabled={locked} onClick={() => setRenaming(item.id)}>
                      <Edit2 className="mr-2 h-3.5 w-3.5" />
                      Rename
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem disabled={locked} onClick={() => remove(item)} className="text-red-400 focus:bg-red-500/10 focus:text-red-400">
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      {item.kind === 'tiles' ? 'Delete tiles item' : 'Delete shape'}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </div>
          )}
        </div>
      </section>
      {picked && (
        <section className="ed-card" data-testid="collision-picked">
          <div className="ed-card-head">
            <CollisionItemIcon item={picked} />
            <span className="ed-section-title min-w-0 flex-1 truncate">{picked.name}</span>
          </div>
          <div className="ed-card-body flex flex-col gap-2">
            {pickedShape && (
              <Field label="Shape">
                <Segmented<'closed' | 'open'>
                  aria-label="Shape kind"
                  value={pickedShape.closed ? 'closed' : 'open'}
                  options={[
                    { value: 'closed', label: 'Closed' },
                    { value: 'open', label: 'Open line' },
                  ]}
                  onChange={(v) => {
                    const toClosed = v === 'closed'
                    if (locked || (toClosed && pickedShape.points.length < minPoints(true))) return
                    setLayer({ ...layer, shapes: (layer.shapes ?? []).map((s) => (s.id === pickedShape.id ? { ...s, closed: toClosed } : s)) })
                  }}
                />
              </Field>
            )}
            <div className="text-xs text-muted-foreground" data-testid="collision-picked-count">
              {picked.kind === 'tiles' ? `${picked.count} tiles` : `${picked.count} points`}
            </div>
            <EdButton variant="danger" disabled={locked} onClick={() => remove(picked)}>
              <Trash2 /> {picked.kind === 'tiles' ? 'Delete tiles item' : 'Delete shape'}
            </EdButton>
          </div>
        </section>
      )}
    </div>
  )
}
