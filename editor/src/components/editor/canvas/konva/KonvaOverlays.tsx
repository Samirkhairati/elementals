import React from 'react'
import { Group, Rect, Shape } from 'react-konva'
import { ActiveTool, TileSelection, Pos, MapData } from '@/types/editor'

interface KonvaOverlaysProps {
  activeMap: MapData
  activeTool: ActiveTool
  tileSelection: TileSelection | null
  canvasHover: Pos | null
  canvasCopyStart: Pos | null
  canvasCopyCurrent: Pos | null
  rectStart: Pos | null
  rectCurrent: Pos | null
}

function getCanvasCopyBox(start: Pos | null, current: Pos | null) {
  if (!start || !current) return null
  const minX = Math.min(start.x, current.x)
  const minY = Math.min(start.y, current.y)
  const maxX = Math.max(start.x, current.x)
  const maxY = Math.max(start.y, current.y)
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

export const KonvaOverlays = React.memo(function KonvaOverlays({
  activeMap,
  activeTool,
  tileSelection,
  canvasHover,
  canvasCopyStart,
  canvasCopyCurrent,
  rectStart,
  rectCurrent,
}: KonvaOverlaysProps) {
  const copyBox = getCanvasCopyBox(canvasCopyStart, canvasCopyCurrent)

  const rectBox =
    !copyBox && activeTool === 'rectangle' && rectStart && rectCurrent
      ? (() => {
          const minX = Math.min(rectStart.x, rectCurrent.x)
          const minY = Math.min(rectStart.y, rectCurrent.y)
          const maxX = Math.max(rectStart.x, rectCurrent.x)
          const maxY = Math.max(rectStart.y, rectCurrent.y)
          return {
            x: minX * 32,
            y: minY * 32,
            width: (maxX - minX + 1) * 32,
            height: (maxY - minY + 1) * 32,
          }
        })()
      : null

  const mapWidthPx = activeMap.width * 32
  const mapHeightPx = activeMap.height * 32

  return (
    <Group listening={false}>
      {/* 32px Grid Overlay */}
      <Shape
        listening={false}
        sceneFunc={(context, shape) => {
          const ctx = context._context as CanvasRenderingContext2D
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)'
          ctx.lineWidth = 1
          ctx.beginPath()

          // Vertical grid lines
          for (let x = 0; x <= mapWidthPx; x += 32) {
            ctx.moveTo(x + 0.5, 0)
            ctx.lineTo(x + 0.5, mapHeightPx)
          }

          // Horizontal grid lines
          for (let y = 0; y <= mapHeightPx; y += 32) {
            ctx.moveTo(0, y + 0.5)
            ctx.lineTo(mapWidthPx, y + 0.5)
          }

          ctx.stroke()
        }}
      />

      {/* Brush hover highlight */}
      {canvasHover && !canvasCopyStart && activeTool === 'brush' && tileSelection && (
        <Rect
          x={canvasHover.x * 32}
          y={canvasHover.y * 32}
          width={tileSelection.width * 32}
          height={tileSelection.height * 32}
          fill="rgba(250, 204, 21, 0.2)"
          stroke="#facc15"
          strokeWidth={1}
          listening={false}
        />
      )}

      {/* Eraser hover highlight */}
      {canvasHover && !canvasCopyStart && activeTool === 'eraser' && (
        <Rect
          x={canvasHover.x * 32}
          y={canvasHover.y * 32}
          width={32}
          height={32}
          fill="rgba(239, 68, 68, 0.2)"
          stroke="#ef4444"
          strokeWidth={1}
          listening={false}
        />
      )}

      {/* Canvas copy selection box */}
      {copyBox && (
        <Rect
          x={copyBox.minX * 32}
          y={copyBox.minY * 32}
          width={copyBox.width * 32}
          height={copyBox.height * 32}
          fill="rgba(59, 130, 246, 0.3)"
          stroke="#3b82f6"
          strokeWidth={2}
          listening={false}
        />
      )}

      {/* Rectangle fill tool preview box */}
      {rectBox && (
        <Rect
          x={rectBox.x}
          y={rectBox.y}
          width={rectBox.width}
          height={rectBox.height}
          fill="rgba(34, 197, 94, 0.3)"
          stroke="#22c55e"
          strokeWidth={2}
          listening={false}
        />
      )}
    </Group>
  )
})
