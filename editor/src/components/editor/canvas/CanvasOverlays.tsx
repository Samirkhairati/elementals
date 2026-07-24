import { ActiveTool, TileSelection, Pos } from '@/types/editor'

interface CanvasOverlaysProps {
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

export function CanvasOverlays({
  activeTool,
  tileSelection,
  canvasHover,
  canvasCopyStart,
  canvasCopyCurrent,
  rectStart,
  rectCurrent,
}: CanvasOverlaysProps) {
  const copyBox = getCanvasCopyBox(canvasCopyStart, canvasCopyCurrent)

  return (
    <>
      {/* Grid Overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-20"
        style={{
          backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.2) 1px, transparent 1px)',
          backgroundSize: '32px 32px'
        }}
      />

      {/* Brush hover highlight */}
      {canvasHover && !canvasCopyStart && activeTool === 'brush' && tileSelection && (
        <div
          className="absolute border border-yellow-400 bg-yellow-400/20 pointer-events-none z-40"
          style={{ left: canvasHover.x * 32, top: canvasHover.y * 32, width: tileSelection.width * 32, height: tileSelection.height * 32 }}
        ></div>
      )}

      {/* Eraser hover highlight */}
      {canvasHover && !canvasCopyStart && activeTool === 'eraser' && (
        <div
          className="absolute border border-red-500 bg-red-500/20 pointer-events-none z-40"
          style={{ left: canvasHover.x * 32, top: canvasHover.y * 32, width: 32, height: 32 }}
        ></div>
      )}

      {/* Canvas copy selection box */}
      {copyBox && (
        <div
          className="absolute border-2 border-primary bg-primary/30 pointer-events-none z-40"
          style={{ left: copyBox.minX * 32, top: copyBox.minY * 32, width: copyBox.width * 32, height: copyBox.height * 32 }}
        ></div>
      )}

      {/* Rectangle tool preview */}
      {!copyBox && activeTool === 'rectangle' && rectStart && rectCurrent && (() => {
        const minX = Math.min(rectStart.x, rectCurrent.x)
        const minY = Math.min(rectStart.y, rectCurrent.y)
        const maxX = Math.max(rectStart.x, rectCurrent.x)
        const maxY = Math.max(rectStart.y, rectCurrent.y)
        const width = maxX - minX + 1
        const height = maxY - minY + 1
        return (
          <div
            className="absolute border-2 border-green-500 bg-green-500/30 pointer-events-none z-40"
            style={{ left: minX * 32, top: minY * 32, width: width * 32, height: height * 32 }}
          ></div>
        )
      })()}
    </>
  )
}
