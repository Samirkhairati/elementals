// A sprite sheet with its frame grid on top: numbered frames, selectable frames and an optional draggable
// pivot. Used by the import dialog (live grid while the author types a frame size) and the Sprites panel.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ZoomControls } from '../ui/controls'
import { sheetGrid } from '../../../../../shared/engine/sprites'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 16
const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))

/** Zoom of a sheet view: follows `fit` until the user zooms (buttons, Ctrl/Cmd + scroll), and `reset` goes back to it. */
export function useSheetZoom(fit: number) {
  const [user, setUser] = useState<number | null>(null)
  const zoom = user ?? fit
  const set = useCallback((z: number) => setUser(clampZoom(z)), [])
  return {
    zoom,
    fitted: user === null,
    setZoom: set,
    zoomIn: () => set(zoom * 1.25),
    zoomOut: () => set(zoom / 1.25),
    reset: () => setUser(null),
  }
}

/** The zoom buttons for a `useSheetZoom` (readout, +/- and Fit). */
export function SheetZoomControls({ z, className }: { z: ReturnType<typeof useSheetZoom>; className?: string }) {
  return <ZoomControls className={className} zoom={z.zoom} fitted={z.fitted} onZoomIn={z.zoomIn} onZoomOut={z.zoomOut} onFit={z.reset} />
}

export interface SheetViewerProps {
  src: string
  imageWidth: number
  imageHeight: number
  frameWidth: number
  frameHeight: number
  margin?: number
  spacing?: number
  zoom: number
  /** Number the frames (skipped above 400 frames). */
  showNumbers?: boolean
  /** Frame indexes to highlight. */
  highlight?: number[]
  /** Called with the frame index under the pointer. */
  onFrameClick?: (index: number, e: React.MouseEvent) => void
  /** Pivot inside one frame (0..1), drawn on the highlighted/first frame; draggable when `onPivotChange` is set. */
  pivot?: { x: number; y: number }
  onPivotChange?: (x: number, y: number) => void
  /** Labels for each sheet row (e.g. a character's facing). */
  rowLabels?: string[]
  /** Override the column count (character sheets use framesPerDirection). */
  columns?: number
  maxHeight?: number
  /** Ctrl/Cmd + scroll (or a pinch) asks for this zoom. */
  onZoomChange?: (zoom: number) => void
}

export function frameIndexAt(
  x: number,
  y: number,
  p: { frameWidth: number; frameHeight: number; margin: number; spacing: number; columns: number; rows: number },
): number | null {
  const fx = x - p.margin
  const fy = y - p.margin
  if (fx < 0 || fy < 0) return null
  const col = Math.floor(fx / (p.frameWidth + p.spacing))
  const row = Math.floor(fy / (p.frameHeight + p.spacing))
  if (col >= p.columns || row >= p.rows) return null
  if (fx - col * (p.frameWidth + p.spacing) >= p.frameWidth) return null
  if (fy - row * (p.frameHeight + p.spacing) >= p.frameHeight) return null
  return row * p.columns + col
}

export function SheetViewer({
  src,
  imageWidth,
  imageHeight,
  frameWidth,
  frameHeight,
  margin = 0,
  spacing = 0,
  zoom,
  showNumbers = true,
  highlight = [],
  onFrameClick,
  pivot,
  onPivotChange,
  rowLabels,
  columns: columnsOverride,
  maxHeight = 320,
  onZoomChange,
}: SheetViewerProps) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !onZoomChange) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      onZoomChange(zoomRef.current * Math.exp(-e.deltaY * 0.01))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onZoomChange])
  const grid = useMemo(
    () => sheetGrid({ frameWidth: Math.max(1, frameWidth), frameHeight: Math.max(1, frameHeight), margin, spacing }, imageWidth, imageHeight),
    [frameWidth, frameHeight, margin, spacing, imageWidth, imageHeight],
  )
  const columns = columnsOverride ?? grid.columns
  const rows = grid.rows
  const total = columns * rows
  const highlightSet = useMemo(() => new Set(highlight), [highlight])

  const pathD = useMemo(() => {
    if (frameWidth < 1 || frameHeight < 1 || total > 4096) return ''
    const parts: string[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const x = margin + c * (frameWidth + spacing)
        const y = margin + r * (frameHeight + spacing)
        parts.push(`M${x * zoom + 0.5} ${y * zoom + 0.5}h${frameWidth * zoom - 1}v${frameHeight * zoom - 1}h${-(frameWidth * zoom - 1)}z`)
      }
    }
    return parts.join('')
  }, [columns, rows, frameWidth, frameHeight, margin, spacing, zoom, total])

  const local = (e: { clientX: number; clientY: number }) => {
    const box = surfaceRef.current?.getBoundingClientRect()
    return { x: (e.clientX - (box?.left ?? 0)) / zoom, y: (e.clientY - (box?.top ?? 0)) / zoom }
  }

  const handleClick = (e: React.MouseEvent) => {
    if (!onFrameClick) return
    const p = local(e)
    const index = frameIndexAt(p.x, p.y, { frameWidth, frameHeight, margin, spacing, columns, rows })
    if (index !== null) onFrameClick(index, e)
  }

  const beginPivotDrag = (e: React.MouseEvent) => {
    if (!onPivotChange || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const apply = (ev: { clientX: number; clientY: number; shiftKey?: boolean }) => {
      const p = local(ev)
      // Pivot is relative to the first frame (frame 0), snapped to whole pixels of the frame.
      const fx = Math.min(frameWidth, Math.max(0, Math.round(p.x - margin)))
      const fy = Math.min(frameHeight, Math.max(0, Math.round(p.y - margin)))
      onPivotChange(fx / frameWidth, fy / frameHeight)
    }
    const move = (ev: MouseEvent) => apply(ev)
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    apply(e)
  }

  const w = imageWidth * zoom
  const h = imageHeight * zoom
  const numbered = showNumbers && total <= 400 && frameWidth * zoom >= 14

  return (
    <div ref={scrollRef} className="ed-checker overflow-auto rounded-md border border-border" style={{ maxHeight }} data-testid="sheet-viewer">
      <div ref={surfaceRef} className="relative" style={{ width: w, height: h }} onClick={handleClick}>
        <img src={src} alt="" draggable={false} className="ed-pixelated absolute left-0 top-0 max-w-none" style={{ width: w, height: h }} />
        <svg className="absolute left-0 top-0" width={w} height={h} shapeRendering="crispEdges">
          {pathD && <path d={pathD} fill="none" stroke="hsl(var(--accent-blue) / 0.75)" strokeWidth={1} pointerEvents="none" />}
          {pathD &&
            Array.from(highlightSet).map((i) => {
              if (i < 0 || i >= total) return null
              const c = i % columns
              const r = Math.floor(i / columns)
              return (
                <rect
                  key={`h${i}`}
                  x={(margin + c * (frameWidth + spacing)) * zoom}
                  y={(margin + r * (frameHeight + spacing)) * zoom}
                  width={frameWidth * zoom}
                  height={frameHeight * zoom}
                  fill="hsl(var(--accent-amber) / 0.28)"
                  stroke="hsl(var(--accent-amber))"
                  strokeWidth={2}
                  pointerEvents="none"
                />
              )
            })}
          {numbered &&
            Array.from({ length: total }, (_, i) => {
              const c = i % columns
              const r = Math.floor(i / columns)
              return (
                <text
                  key={`n${i}`}
                  x={(margin + c * (frameWidth + spacing)) * zoom + 3}
                  y={(margin + r * (frameHeight + spacing)) * zoom + 11}
                  fontSize={10}
                  fill="white"
                  stroke="black"
                  strokeWidth={2.5}
                  paintOrder="stroke"
                  pointerEvents="none"
                >
                  {i}
                </text>
              )
            })}
          {rowLabels &&
            rowLabels.map((label, r) => (
              <text
                key={`l${label}`}
                x={w - 4}
                y={(margin + r * (frameHeight + spacing)) * zoom + 12}
                textAnchor="end"
                fontSize={10}
                fill="white"
                stroke="black"
                strokeWidth={2.5}
                paintOrder="stroke"
                pointerEvents="none"
              >
                {label}
              </text>
            ))}
          {pivot && frameWidth > 0 && (
            <g>
              <circle
                data-testid="pivot-handle"
                cx={(margin + pivot.x * frameWidth) * zoom}
                cy={(margin + pivot.y * frameHeight) * zoom}
                r={5}
                fill="hsl(var(--accent-violet) / 0.4)"
                stroke="hsl(var(--accent-violet))"
                strokeWidth={2}
                style={{ cursor: onPivotChange ? 'move' : 'default' }}
                onMouseDown={beginPivotDrag}
              />
            </g>
          )}
        </svg>
      </div>
    </div>
  )
}
