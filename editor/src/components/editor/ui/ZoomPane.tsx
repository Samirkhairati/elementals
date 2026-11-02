import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { clampZoom, fitScale, stepZoom } from '@/lib/zoom'
import { ZoomControls } from './controls'

interface ZoomPaneProps {
  /** Natural size of the picture in pixels. */
  width: number
  height: number
  /** Draws the picture at `zoom` (a factor: 1 = actual size). Keep it pixelated and sized `width * zoom`. */
  children: (zoom: number) => React.ReactNode
  /** Extra controls left of the zoom controls (overlay pickers, grid toggles). */
  toolbar?: React.ReactNode | ((zoom: number) => React.ReactNode)
  /** Largest scale "fit" will pick for a small picture. */
  maxFit?: number
  /** Replaces the line under the picture; `false` leaves it out. */
  hint?: React.ReactNode | false
  /** Narrow controls, for side panels. */
  compact?: boolean
  className?: string
}

/**
 * A picture in a pan-and-zoom viewport, like the entity preview: the zoom slider, + / − (whole-number steps),
 * Fit and 1:1; Ctrl/Cmd + scroll (or a trackpad pinch) zooms around the pointer; drag to pan; plain scroll scrolls.
 * It starts fitted and follows the pane while it is. Give it a `key` to reset the view for another picture.
 */
export function ZoomPane({ width, height, children, toolbar, maxFit = 8, hint, compact, className }: ZoomPaneProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [userZoom, setUserZoom] = useState<number | null>(null) // null = fitted
  const fit = useMemo(() => fitScale(box.w - 2, box.h - 2, width, height, maxFit), [box, width, height, maxFit])
  const zoom = userZoom ?? fit
  // The point to keep still across a zoom change: content coordinates under a viewport point.
  const anchor = useRef<{ cx: number; cy: number; px: number; py: number } | null>(null)

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => setBox((b) => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const zoomAround = useCallback((next: number, px?: number, py?: number) => {
    const el = scroller.current
    const z = clampZoom(next)
    if (el) {
      const x = px ?? el.clientWidth / 2
      const y = py ?? el.clientHeight / 2
      const current = userZoom ?? fit
      anchor.current = { cx: (el.scrollLeft + x) / current, cy: (el.scrollTop + y) / current, px: x, py: y }
    }
    setUserZoom(z)
  }, [userZoom, fit])

  // After the picture is resized, scroll so the anchored point stays under the pointer.
  useLayoutEffect(() => {
    const el = scroller.current
    const a = anchor.current
    if (!el || !a) return
    anchor.current = null
    el.scrollLeft = a.cx * zoom - a.px
    el.scrollTop = a.cy * zoom - a.py
  }, [zoom])

  const latest = useRef({ zoomAround, zoom })
  latest.current = { zoomAround, zoom }
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      latest.current.zoomAround(latest.current.zoom * Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const [panning, setPanning] = useState(false)
  const beginPan = (e: React.MouseEvent) => {
    const el = scroller.current
    if (!el || (e.button !== 0 && e.button !== 1)) return
    e.preventDefault()
    let lx = e.clientX
    let ly = e.clientY
    setPanning(true)
    const move = (ev: MouseEvent) => {
      el.scrollLeft -= ev.clientX - lx
      el.scrollTop -= ev.clientY - ly
      lx = ev.clientX
      ly = ev.clientY
    }
    const up = () => {
      setPanning(false)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const overflows = width * zoom > box.w || height * zoom > box.h
  return (
    <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col gap-2', className)} data-testid="zoom-pane">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {typeof toolbar === 'function' ? toolbar(zoom) : toolbar}
        <ZoomControls
          className="ml-auto"
          compact={compact}
          zoom={zoom}
          fitted={userZoom === null}
          onZoomIn={() => zoomAround(stepZoom(zoom, 1))}
          onZoomOut={() => zoomAround(stepZoom(zoom, -1))}
          onZoomTo={(z) => zoomAround(z)}
          onActualSize={() => zoomAround(1)}
          onFit={() => setUserZoom(null)}
        />
      </div>
      {/* The viewport is sized by the layout alone (the scroller is absolutely positioned inside it): if the picture
          could stretch it, "fit" would be computed from a box that shrinks as the picture does, and the picture
          would creep down to its size frame by frame. */}
      <div className="relative min-h-[200px] flex-1">
        <div
          ref={scroller}
          data-testid="zoom-viewport"
          className={cn('ed-checker absolute inset-0 flex overflow-auto rounded border border-border', overflows && (panning ? 'cursor-grabbing' : 'cursor-grab'))}
          onMouseDown={beginPan}
        >
          <div className="m-auto shrink-0 select-none" style={{ width: width * zoom, height: height * zoom }}>
            {children(zoom)}
          </div>
        </div>
      </div>
      {hint !== false && <p className="ed-hint">{hint ?? 'Ctrl/⌘ + scroll or pinch to zoom, drag to move around.'}</p>}
    </div>
  )
}
