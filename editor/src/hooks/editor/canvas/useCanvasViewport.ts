import { useState, useRef, useEffect, useCallback } from 'react'
import Konva from 'konva'
import { MapData } from '@/types/editor'

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

  // ── Auto-center Map Calculations ─────────────────────────────────────────
  const centerMap = useCallback(() => {
    const stage = stageRef.current
    const map = activeMapRef.current
    if (!stage || !map || dimensions.width <= 0 || dimensions.height <= 0) return

    const mapW = map.width * 32
    const mapH = map.height * 32
    const initialScale = Math.min(
      1,
      Math.max(0.2, Math.min((dimensions.width * 0.8) / mapW, (dimensions.height * 0.8) / mapH))
    )
    const posX = Math.round((dimensions.width - mapW * initialScale) / 2)
    const posY = Math.round((dimensions.height - mapH * initialScale) / 2)

    stage.scale({ x: initialScale, y: initialScale })
    stage.position({ x: posX, y: posY })
    stage.batchDraw()
  }, [dimensions])

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
      const newScale = Math.min(Math.max(0.15, oldScale * factor), 5)

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
  }
}
