import React, { useRef, useState } from 'react'
import { Group, Rect, Shape } from 'react-konva'
import type Konva from 'konva'
import type { EntityData } from '@/types/editor'
import { entityAreaLocal, normalizeCollider, translateRect, type ColliderPatch, type Rect as GeoRect } from '@/lib/entityVisuals'
import { HANDLES, areaToColliderProps, handlePoint, resizeArea, type Handle } from '@/lib/entityResize'
import { currentGrid } from '@/store/gridStore'
import { usePolygonEdit } from '@/lib/polygonEditStore'
import { setStageCursor } from '../canvasUtils'

const FRAME_STROKE = '#38bdf8'
/** Handle size on screen, whatever the zoom (px); the grab area is a little bigger. */
const HANDLE_PX = 9
const HANDLE_HIT_PX = 16

const CURSORS: Record<Handle, string> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' }

/** A square drawn at the same screen size at any zoom. */
const square = (px: number) => (context: Konva.Context, shape: Konva.Shape) => {
  const half = px / 2 / (shape.getStage()?.scaleX() || 1)
  context.beginPath()
  context.rect(-half, -half, half * 2, half * 2)
  context.closePath()
  context.fillStrokeShape(shape)
}
const drawHandle = square(HANDLE_PX)
const hitHandle = square(HANDLE_HIT_PX)

/**
 * The area of the selected entity (its collider box, or its tile without a collider) with eight handles: corners and edge
 * midpoints. Dragging a handle resizes the area with the opposite edge(s) fixed, snapped to the grid while the magnet is on;
 * letting go applies the new box as one change. The entity's anchor never moves. Not shown for a polygon collider.
 */
export function KonvaEntityResize({
  entity,
  snapToGrid,
  onResize,
}: {
  entity: EntityData | null
  snapToGrid: boolean
  onResize: (entityId: string, patch: ColliderPatch) => void
}) {
  const [draft, setDraft] = useState<GeoRect | null>(null)
  const start = useRef<GeoRect | null>(null)
  const last = useRef<GeoRect | null>(null)
  const { colliderEntityId } = usePolygonEdit()

  if (!entity || colliderEntityId) return null
  if (entity.components.Collider && normalizeCollider(entity.components.Collider).shape === 'polygon') return null

  const current = translateRect(entityAreaLocal(entity), entity.x, entity.y)
  const now = draft ?? current
  const anchor = { x: entity.x, y: entity.y }

  const follow = (handle: Handle, e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true
    const from = start.current ?? current
    const next = resizeArea(from, handle, { x: e.target.x(), y: e.target.y() }, snapToGrid, currentGrid())
    last.current = next
    setDraft(next)
    // the handle sits on the frame, not wherever the mouse is
    const at = handlePoint(next, handle)
    e.target.position(at)
  }

  return (
    <Group name="entity-resize">
      <Rect x={now.x} y={now.y} width={now.w} height={now.h} stroke={FRAME_STROKE} strokeWidth={1.5} strokeScaleEnabled={false} listening={false} />
      {HANDLES.map((handle) => {
        const at = handlePoint(now, handle)
        return (
          <Shape
            key={handle}
            name="entity-resize-handle"
            x={at.x}
            y={at.y}
            draggable
            fill="#ffffff"
            stroke={FRAME_STROKE}
            strokeWidth={1.5}
            strokeScaleEnabled={false}
            sceneFunc={drawHandle}
            hitFunc={hitHandle}
            onMouseDown={(e) => {
              e.cancelBubble = true
            }}
            onMouseEnter={(e) => setStageCursor(e.target.getStage(), CURSORS[handle])}
            onMouseLeave={(e) => setStageCursor(e.target.getStage(), '')}
            onDragStart={(e) => {
              e.cancelBubble = true
              start.current = current
              last.current = null
            }}
            onDragMove={(e) => follow(handle, e)}
            onDragEnd={(e) => {
              e.cancelBubble = true
              const from = start.current ?? current
              const done = last.current
              start.current = null
              last.current = null
              setDraft(null)
              if (done && (done.x !== from.x || done.y !== from.y || done.w !== from.w || done.h !== from.h)) onResize(entity.id, areaToColliderProps(done, anchor))
            }}
          />
        )
      })}
    </Group>
  )
}
