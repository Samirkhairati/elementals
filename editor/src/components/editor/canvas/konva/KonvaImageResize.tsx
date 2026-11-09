import React, { useRef, useState } from 'react'
import { Group, Rect, Shape } from 'react-konva'
import type Konva from 'konva'
import type { ImageItem } from '@/types/editor'
import type { SpriteAssetInfo } from '../../../../../../shared/engine/types'
import { flippedItemBounds } from '@/lib/imageItems'
import { CORNERS, cornerAt, resizeFromCorner, scaleBounds, type Corner } from '@/lib/imageResize'
import type { ImageDrag } from './imageDrag'
import { setStageCursor } from '../canvasUtils'

const FRAME_STROKE = '#38bdf8'
/** Handle size on screen, whatever the zoom (px); the grab area is a little bigger. */
const HANDLE_PX = 9
const HANDLE_HIT_PX = 16

type Change = { scale: number; x: number; y: number }

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
 * The frame and four corner handles of the picture being resized (the Images panel's Resize button turns them on). Dragging a
 * corner scales the picture (one factor, the shape is kept) with the opposite corner fixed; the layer draws it at the new size
 * while the handle moves, and letting go applies it as one change.
 */
export function KonvaImageResize({
  item,
  assets,
  onResize,
  dragRef,
}: {
  item: ImageItem
  assets: Record<string, SpriteAssetInfo>
  onResize: (change: Change) => void
  dragRef?: React.MutableRefObject<ImageDrag | null>
}) {
  const [draft, setDraft] = useState<Change | null>(null)
  const last = useRef<Change | null>(null)
  const unit = flippedItemBounds({ ...item, scale: 1 }, assets)
  const now = draft ?? { scale: item.scale ?? 1, x: item.x, y: item.y }
  const bounds = scaleBounds(unit, now.scale)

  const follow = (corner: Corner, e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true
    const next = resizeFromCorner(unit, item, item.scale ?? 1, corner, { x: e.target.x(), y: e.target.y() })
    last.current = next
    setDraft(next)
    if (dragRef) dragRef.current = { id: item.id, ...next }
    // the handle sits on the frame's corner, not wherever the mouse is
    e.target.position(cornerAt(scaleBounds(unit, next.scale), next, corner))
  }

  return (
    <Group name="image-resize">
      <Rect
        x={now.x + bounds.x}
        y={now.y + bounds.y}
        width={bounds.w}
        height={bounds.h}
        stroke={FRAME_STROKE}
        strokeWidth={1.5}
        strokeScaleEnabled={false}
        listening={false}
      />
      {CORNERS.map((corner) => {
        const at = cornerAt(bounds, now, corner)
        const cursor = corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize'
        return (
          <Shape
            key={corner}
            name="resize-handle"
            corner={corner}
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
            onMouseEnter={(e) => setStageCursor(e.target.getStage(), cursor)}
            onMouseLeave={(e) => setStageCursor(e.target.getStage(), '')}
            onDragStart={(e) => {
              e.cancelBubble = true
              last.current = null
            }}
            onDragMove={(e) => follow(corner, e)}
            onDragEnd={(e) => {
              e.cancelBubble = true
              const done = last.current
              last.current = null
              if (dragRef) dragRef.current = null
              setDraft(null)
              if (done && (done.scale !== (item.scale ?? 1) || done.x !== item.x || done.y !== item.y)) onResize(done)
            }}
          />
        )
      })}
    </Group>
  )
}
