import { useState, useRef, useEffect, useCallback } from 'react'
import Konva from 'konva'
import { MapData } from '@/types/editor'
import {
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  centerOnWorld,
  fitView,
  zoomAbout,
  type CanvasView,
} from './viewMath'

export interface TileCoords {
  x: number
  y: number
  rawX: number
  rawY: number
  isInside: boolean
}

interface UseCanvasViewportOptions {
  activeMap: MapData | null
}

export function useCanvasViewport({ activeMap }: UseCanvasViewportOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<Konva.Stage | null>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  const isPanningRef = useRef(false)
  const lastPanPosRef = useRef({ x: 0, y: 0 })
  const activeMapRef = useRef(activeMap)
  useEffect(() => { activeMapRef.current = activeMap }, [activeMap])

  // ── View store ───────────────────────────────────────────────────────────
  // The stage is driven imperatively (no React state per pan/zoom frame). The zoom bar and the minimap read its
  // scale/position through this tiny external store, so only they re-render while the view moves.
  const viewRef = useRef<CanvasView>({ scale: 1, x: 0, y: 0 })
  const listenersRef = useRef(new Set<() => void>())
  const viewStore = useRef({
    subscribe: (l: () => void) => {
      listenersRef.current.add(l)
      return () => {
        listenersRef.current.delete(l)
      }
    },
    getSnapshot: () => viewRef.current,
  }).current

  const syncView = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    const next: CanvasView = { scale: stage.scaleX(), x: stage.x(), y: stage.y() }
    const cur = viewRef.current
    if (next.scale === cur.scale && next.x === cur.x && next.y === cur.y) return
    viewRef.current = next
    listenersRef.current.forEach(l => l())
  }, [])

  const hasStage = !!activeMap
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const events = 'xChange.viewStore yChange.viewStore scaleXChange.viewStore scaleYChange.viewStore'
    stage.on(events, syncView)
    syncView()
    return () => {
      stage.off(events)
    }
  }, [hasStage, syncView])

  const applyView = useCallback((view: CanvasView) => {
    const stage = stageRef.current
    if (!stage) return
    stage.scale({ x: view.scale, y: view.scale })
    stage.position({ x: view.x, y: view.y })
    stage.batchDraw()
    syncView()
  }, [syncView])

  const currentView = useCallback((): CanvasView => {
    const stage = stageRef.current
    return stage ? { scale: stage.scaleX(), x: stage.x(), y: stage.y() } : viewRef.current
  }, [])

  // ── Auto-center Map Calculations ─────────────────────────────────────────
  /** Reset: the whole map, centred. */
  const centerMap = useCallback(() => {
    const map = activeMapRef.current
    if (!stageRef.current || !map || dimensions.width <= 0 || dimensions.height <= 0) return
    applyView(fitView(dimensions, map.width, map.height))
  }, [dimensions, applyView])

  /** Zoom to an absolute scale around the middle of the viewport. */
  const zoomTo = useCallback((scale: number) => {
    if (dimensions.width <= 0) return
    applyView(zoomAbout(currentView(), scale, dimensions.width / 2, dimensions.height / 2))
  }, [dimensions, applyView, currentView])

  const zoomBy = useCallback((factor: number) => {
    zoomTo(currentView().scale * factor)
  }, [zoomTo, currentView])

  /** Scroll so that world point (wx, wy) is in the middle of the viewport. */
  const panToWorld = useCallback((wx: number, wy: number) => {
    if (dimensions.width <= 0) return
    applyView(centerOnWorld(currentView(), dimensions, wx, wy))
  }, [dimensions, applyView, currentView])

  // ── Resize Observer for Stage Dimensions ─────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const updateSize = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        const w = Math.floor(rect.width)
        const h = Math.floor(rect.height)
        setDimensions(prev => (prev.width === w && prev.height === h ? prev : { width: w, height: h }))
      }
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // ── Auto-center Active Map on Initial Load or Switch ─────────────────────
  const centeredMapKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!activeMap || !stageRef.current) return
    const mapKey = `${activeMap.folderPath || ''}/${activeMap.fileName}`
    if (dimensions.width > 0 && dimensions.height > 0) {
      if (centeredMapKeyRef.current !== mapKey) {
        centeredMapKeyRef.current = mapKey
        centerMap()
      }
    }
  }, [activeMap, dimensions, centerMap])

  const isZoomingRef = useRef(false)
  const zoomTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => {
      if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current)
    }
  }, [])

  // ── Trackpad Pan & Cursor-Centered Exponential Zoom ──────────────────────
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return

    // Ctrl/Cmd is set on pinch-to-zoom gestures (macOS) and Ctrl/Cmd + mouse wheel
    if (e.evt.ctrlKey || e.evt.metaKey) {
      const oldScale = stage.scaleX()
      const pointer = stage.getPointerPosition()
      if (!pointer) return

      const clampedDelta = Math.max(-120, Math.min(120, e.evt.deltaY))
      const sensitivity = 0.003
      const factor = Math.exp(-clampedDelta * sensitivity)
      const newScale = Math.min(Math.max(MIN_CANVAS_ZOOM, oldScale * factor), MAX_CANVAS_ZOOM)

      const mousePointToX = (pointer.x - stage.x()) / oldScale
      const mousePointToY = (pointer.y - stage.y()) / oldScale

      const newPosX = pointer.x - mousePointToX * newScale
      const newPosY = pointer.y - mousePointToY * newScale

      isZoomingRef.current = true
      stage.scale({ x: newScale, y: newScale })
      stage.position({ x: newPosX, y: newPosY })
      stage.batchDraw()

      if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current)
      zoomTimeoutRef.current = setTimeout(() => {
        isZoomingRef.current = false
      }, 100)
    } else {
      // Direct 1:1 Pixel Panning with Trackpad 2-finger scroll or Mouse Wheel
      const currentPos = stage.position()
      stage.position({
        x: currentPos.x - e.evt.deltaX,
        y: currentPos.y - e.evt.deltaY,
      })
      stage.batchDraw()
    }
  }, [])

  // ── Panning Handlers ─────────────────────────────────────────────────────
  const startPan = useCallback((clientX: number, clientY: number) => {
    isPanningRef.current = true
    lastPanPosRef.current.x = clientX
    lastPanPosRef.current.y = clientY
  }, [])

  const movePan = useCallback((clientX: number, clientY: number) => {
    if (!isPanningRef.current || !stageRef.current) return
    const stage = stageRef.current
    const dx = clientX - lastPanPosRef.current.x
    const dy = clientY - lastPanPosRef.current.y
    lastPanPosRef.current.x = clientX
    lastPanPosRef.current.y = clientY
    stage.position({ x: stage.x() + dx, y: stage.y() + dy })
    stage.batchDraw()
  }, [])

  const endPan = useCallback(() => {
    isPanningRef.current = false
  }, [])

  // ── Coordinate Translation: Pointer -> Grid Tile ─────────────────────────
  const getTileCoordsFromPointer = useCallback((): TileCoords | null => {
    const stage = stageRef.current
    const map = activeMapRef.current
    if (!stage || !map) return null
    const pointer = stage.getPointerPosition()
    if (!pointer) return null

    const scaleX = stage.scaleX() || 1
    const scaleY = stage.scaleY() || 1
    const localX = (pointer.x - stage.x()) / scaleX
    const localY = (pointer.y - stage.y()) / scaleY

    const rawX = Math.floor(localX / 32)
    const rawY = Math.floor(localY / 32)
    const clampedX = Math.max(0, Math.min(map.width - 1, rawX))
    const clampedY = Math.max(0, Math.min(map.height - 1, rawY))
    const isInside = rawX >= 0 && rawX < map.width && rawY >= 0 && rawY < map.height

    return { x: clampedX, y: clampedY, rawX, rawY, isInside }
  }, [])

  return {
    containerRef,
    stageRef,
    dimensions,
    isPanningRef,
    isZoomingRef,
    handleWheel,
    startPan,
    movePan,
    endPan,
    getTileCoordsFromPointer,
    centerMap,
    viewStore,
    zoomTo,
    zoomBy,
    panToWorld,
  }
}
