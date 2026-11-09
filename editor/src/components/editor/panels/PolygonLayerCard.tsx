import { Trash2 } from 'lucide-react'
import type { Layer } from '@/types/editor'
import { minPoints } from '../../../../../shared/collisionShapes'
import { polygonEditStore, usePolygonEdit } from '@/lib/polygonEditStore'
import { EdButton, Field, InfoTip, Segmented } from '../ui/controls'

/** Controls of the canvas shape editor, for the info tips of polygon layers and polygon colliders. */
export function ShapeEditorHelp() {
  return (
    <InfoTip label="How to draw collision shapes">
      Click on the map to place points; hold Shift to keep the new edge horizontal or vertical. Click the first point to
      close the shape (a solid area), or double-click, press Enter or right-click to finish an open line (a wall that
      cannot be crossed). Backspace removes the last point, Esc cancels. Drag a point or a shape to move it (Shift keeps
      it on one axis), double-click an edge to add a point, Alt+click a point to remove it, Delete removes the picked
      shape. Lines show while a point lines up with another collider's points; nothing snaps. The game blocks movement
      with these shapes whether the layer is shown in the editor or not.
    </InfoTip>
  )
}

/** The Properties card of a polygon collision layer: its shapes and the picked one. */
export function PolygonLayerCard({ layer, layers, updateLayers }: { layer: Layer; layers: Layer[]; updateLayers: (layers: Layer[]) => void }) {
  const { selectedShapeId, drawing } = usePolygonEdit()
  const shapes = layer.shapes ?? []
  const picked = shapes.find((s) => s.id === selectedShapeId) ?? null
  const setShapes = (next: Layer['shapes']) => updateLayers(layers.map((l) => (l.id === layer.id ? { ...l, shapes: next } : l)))
  const closed = shapes.filter((s) => s.closed).length

  return (
    <section className="ed-card">
      <div className="ed-card-head">
        <span className="ed-section-title flex-1">Collision shapes</span>
        <ShapeEditorHelp />
      </div>
      <div className="ed-card-body">
        <div className="text-xs text-muted-foreground" data-testid="shape-count">
          {shapes.length === 0 ? 'No shapes yet: click on the map to start one.' : `${closed} closed, ${shapes.length - closed} open`}
          {drawing && ' · drawing…'}
          {layer.locked && ' · locked'}
        </div>
        {picked && (
          <>
            <Field label="Shape">
              <Segmented<'closed' | 'open'>
                aria-label="Shape kind"
                value={picked.closed ? 'closed' : 'open'}
                options={[
                  { value: 'closed', label: 'Closed' },
                  { value: 'open', label: 'Open line' },
                ]}
                onChange={(v) => {
                  const toClosed = v === 'closed'
                  if (toClosed && picked.points.length < minPoints(true)) return
                  setShapes(shapes.map((s) => (s.id === picked.id ? { ...s, closed: toClosed } : s)))
                }}
              />
            </Field>
            <div className="text-xs text-muted-foreground" data-testid="shape-points">{picked.points.length} points</div>
            <EdButton
              variant="danger"
              disabled={layer.locked}
              onClick={() => {
                setShapes(shapes.filter((s) => s.id !== picked.id))
                polygonEditStore.set({ selectedShapeId: null })
              }}
            >
              <Trash2 /> Delete shape
            </EdButton>
          </>
        )}
      </div>
    </section>
  )
}
