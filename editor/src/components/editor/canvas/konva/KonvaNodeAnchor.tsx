// The anchor of the active plain Node (a `group`) on the canvas, like Godot's origin handle: a cross to grab and drag.
// Dragging moves the Node and everything inside it (Alt: only the anchor, the children stay where they are), snapped to
// the tile anchor with the magnet on. Entities draw their own anchors (KonvaEntities); sprites are moved by their handles.

import React from 'react'
import { Group, Shape } from 'react-konva'
import type { GroupNode } from '../../../../../../shared/sceneTree'
import { TILE_RECT_LOCAL } from '@/lib/entityVisuals'
import { snapEntityAnchor } from '@/lib/entitySnap'
import { setStageCursor } from '../canvasUtils'
import { drawAnchorCross, drawLabel } from './entityDraw'

interface KonvaNodeAnchorProps {
  node: GroupNode | null
  snapToGrid: boolean
  locked: boolean
  moveNode: (id: string, x: number, y: number, carry: boolean) => void
}

export const KonvaNodeAnchor = React.memo(function KonvaNodeAnchor({ node, snapToGrid, locked, moveNode }: KonvaNodeAnchorProps) {
  if (!node) return null
  const x = node.x ?? 0
  const y = node.y ?? 0
  const snap = (px: number, py: number) => snapEntityAnchor(TILE_RECT_LOCAL, px, py, snapToGrid)
  return (
    <Group
      x={x}
      y={y}
      draggable={!locked}
      onDragStart={(e) => {
        e.cancelBubble = true
        setStageCursor(e.target.getStage(), 'grabbing')
      }}
      onDragMove={(e) => {
        e.cancelBubble = true
        const p = snap(e.target.x(), e.target.y())
        e.target.position(p)
      }}
      onDragEnd={(e) => {
        e.cancelBubble = true
        const p = snap(e.target.x(), e.target.y())
        e.target.position(p)
        setStageCursor(e.target.getStage(), 'move')
        if (p.x !== x || p.y !== y) moveNode(node.id, p.x, p.y, !e.evt.altKey)
      }}
      onMouseEnter={(e) => setStageCursor(e.target.getStage(), locked ? 'not-allowed' : 'move')}
      onMouseLeave={(e) => setStageCursor(e.target.getStage(), '')}
      onMouseDown={(e) => {
        if (e.evt.button === 0) e.cancelBubble = true
      }}
    >
      {/* the cross and the name; the grab area is a circle of about 10 screen px whatever the zoom */}
      <Shape
        name="node-anchor"
        perfectDrawEnabled={false}
        sceneFunc={(context, shape) => {
          const ctx = context._context as CanvasRenderingContext2D
          const s = shape.getStage()?.scaleX() || 1
          drawAnchorCross(ctx, 0, 0, s, true)
          drawLabel(ctx, node.name, 0, -10 / s, s, 'selected')
        }}
        hitFunc={(context, shape) => {
          const s = shape.getStage()?.scaleX() || 1
          context.beginPath()
          context.arc(0, 0, 10 / s, 0, Math.PI * 2)
          context.closePath()
          context.fillStrokeShape(shape)
        }}
        fill="#000"
      />
    </Group>
  )
})
