// Pan and zoom for a small preview pane that shows its content through a CSS transform (the tileset preview, the
// active selection): the wheel pans, Ctrl/Cmd + wheel zooms, a middle-button drag pans.

import { useState } from 'react'
import { trackWindowPan } from '@/lib/windowDrag'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 5
/** Zoom change per wheel pixel (exponential, so every notch scales by the same factor). */
const WHEEL_ZOOM = 0.003

/** The zoom after a wheel movement of `deltaY`, kept within the pane's range. */
export function wheelZoom(zoom: number, deltaY: number): number {
  return Math.min(Math.max(MIN_ZOOM, zoom * Math.exp(-deltaY * WHEEL_ZOOM)), MAX_ZOOM)
}

export function usePanZoom() {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) setZoom((z) => wheelZoom(z, e.deltaY))
    else setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
  }

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 1) return
    setIsPanning(true)
    trackWindowPan(e, (dx, dy) => setPan((p) => ({ x: p.x + dx, y: p.y + dy })), { endButton: 1, onEnd: () => setIsPanning(false) })
  }

  /** The CSS transform of the content (zoomed around its centre). */
  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`

  return { zoom, pan, isPanning, transform, onWheel, onMouseDown }
}
