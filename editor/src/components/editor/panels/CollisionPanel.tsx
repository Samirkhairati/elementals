import { Grid3x3, Pentagon, Plus, Spline, Trash2 } from 'lucide-react'
import { minPoints } from '../../../../../shared/collisionShapes'
import type { CollisionItem } from '../../../../../shared/collisionLayers'
import { collisionItemsOf, collisionShapeNodes } from '../../../../../shared/sceneTree'
import { lockedNode, sceneIndex } from '@/lib/sceneIndex'
import { polygonEditStore, usePolygonEdit, type CollisionBrush } from '@/lib/polygonEditStore'
import { useEditorSelector, type EditorContextValue } from '../layout/EditorContext'
import { Card, EdButton, Field, Segmented } from '../ui/controls'
import { ShapeEditorHelp } from './ShapeEditorHelp'

const selectCollision = (c: EditorContextValue) => ({
  nodes: c.activeMap?.nodes,
  activeLayerId: c.activeLayerId,
  addCollisionTiles: c.addCollisionTiles,
  editNode: c.editNode,
  deleteNodes: c.deleteNodes,
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
 * The right sidebar while a collision layer is active (see useDockviewLayout): the brush, new items and the picked item
 * (the items themselves, sets of painted tiles and shapes, are rows of the Scene panel). A click on the map paints the picked tiles item with the Tiles brush,
 * or draws and edits shapes with the Shape brush.
 */
export function CollisionPanel() {
  const { nodes, activeLayerId, addCollisionTiles, editNode, deleteNodes, selectedEntityId } = useEditorSelector(selectCollision)
  const { selectedShapeId, brush, drawing } = usePolygonEdit()
  const index = sceneIndex(nodes ?? [])
  const node = index.byId.get(activeLayerId ?? '')?.node
  const layer = node?.type === 'collision' ? node : null
  if (!layer) return <div className="ed-empty">Select a collision layer</div>

  const items = collisionItemsOf(layer)
  const picked = items.find((i) => i.id === selectedShapeId) ?? null
  const pickedShape = picked?.kind === 'shape' ? collisionShapeNodes(layer).find((s) => s.id === picked.id) ?? null : null
  const locked = lockedNode(index, layer.id)

  const addTiles = () => {
    const id = addCollisionTiles(layer.id)
    if (id) polygonEditStore.set({ selectedShapeId: id, brush: 'tiles' })
  }
  const addShape = () => polygonEditStore.set({ selectedShapeId: null, brush: 'shape' })
  const remove = (item: CollisionItem) => {
    deleteNodes([item.id])
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
      <Card
        caps
        title={<span title={`Collision · ${layer.name}`}>Collision · {layer.name}</span>}
        infoLabel="How collision layers work"
        info={
          <>
            Everything on a collision layer blocks movement in the game, shown or hidden. Its items are sets of painted
            tiles and single shapes. With the Tiles brush, painting and erasing work like on a tile layer (brush,
            rectangle, bucket, eraser) and new tiles go into the picked tiles item. With the Shape brush, clicks draw and
            edit shapes. A map can have several collision layers.
          </>
        }
        actions={
          <>
            <ShapeEditorHelp />
          </>
        }
        bodyClassName="flex flex-col gap-2"
      >
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
        {items.length === 0 && <div className="text-xs text-muted-foreground">No items yet: paint tiles or draw a shape on the map.</div>}
      </Card>
      {picked && (
        <Card caps icon={<CollisionItemIcon item={picked} />} title={picked.name} bodyClassName="flex flex-col gap-2" data-testid="collision-picked">
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
                  editNode(pickedShape.id, { closed: toClosed })
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
        </Card>
      )}
    </div>
  )
}
