import { useState, useRef, useEffect, useCallback } from 'react'
import Konva from 'konva'
import {
  Layer,
  MapData,
  TileSelection,
  ActiveTool,
  PaintMode,
  CopiedTile,
  Pos,
} from '@/types/editor'
import { getBoundingBox } from '@/components/editor/canvas/canvasUtils'
import { TileCoords } from './useCanvasViewport'

interface UseCanvasInteractionProps {
  activeMap: MapData | null
  layers: Layer[]
  activeTool: ActiveTool
  paintMode: PaintMode
  activeLayerId: string | null
  isPainting: boolean
  setIsPainting: (v: boolean) => void
  setPaintStartPos: (v: Pos | null) => void
  setTileSelection: (s: TileSelection | null) => void
  handlePaint: (x: number, y: number) => void
  handlePaintBucket: (x: number, y: number) => void
  handleRectangleFill: (start: Pos, end: Pos) => void
  handleCommit: () => void
  getTileCoordsFromPointer: () => TileCoords | null
  isPanningRef: React.MutableRefObject<boolean>
  startPan: (clientX: number, clientY: number) => void
  movePan: (clientX: number, clientY: number) => void
  endPan: () => void
}

export function useCanvasInteraction({
  activeMap,
  layers,
  activeTool,
  paintMode,
  activeLayerId,
  isPainting,
  setIsPainting,
  setPaintStartPos,
  setTileSelection,
  handlePaint,
  handlePaintBucket,
  handleRectangleFill,
  handleCommit,
  getTileCoordsFromPointer,
  isPanningRef,
  startPan,
  movePan,
  endPan,
}: UseCanvasInteractionProps) {
  const [canvasHover, setCanvasHover] = useState<Pos | null>(null)
  const [canvasCopyStart, setCanvasCopyStart] = useState<Pos | null>(null)
  const [canvasCopyCurrent, setCanvasCopyCurrent] = useState<Pos | null>(null)
  const [rectStart, setRectStart] = useState<Pos | null>(null)
  const [rectCurrent, setRectCurrent] = useState<Pos | null>(null)

  // ── Sync Refs for Listeners ──────────────────────────────────────────────
  const isPaintingRef = useRef(isPainting)
  useEffect(() => { isPaintingRef.current = isPainting }, [isPainting])

  const rectStartRef = useRef(rectStart)
  useEffect(() => { rectStartRef.current = rectStart }, [rectStart])

  const rectCurrentRef = useRef(rectCurrent)
  useEffect(() => { rectCurrentRef.current = rectCurrent }, [rectCurrent])

  const canvasCopyStartRef = useRef(canvasCopyStart)
  useEffect(() => { canvasCopyStartRef.current = canvasCopyStart }, [canvasCopyStart])

  const canvasCopyCurrentRef = useRef(canvasCopyCurrent)
  useEffect(() => { canvasCopyCurrentRef.current = canvasCopyCurrent }, [canvasCopyCurrent])

  const activeToolRef = useRef(activeTool)
  useEffect(() => { activeToolRef.current = activeTool }, [activeTool])

  const layersRef = useRef(layers)
  useEffect(() => { layersRef.current = layers }, [layers])

  const activeLayerIdRef = useRef(activeLayerId)
  useEffect(() => { activeLayerIdRef.current = activeLayerId }, [activeLayerId])

  const activeMapRef = useRef(activeMap)
  useEffect(() => { activeMapRef.current = activeMap }, [activeMap])

  // ── Canvas Copy / Sampler Commit ─────────────────────────────────────────
  const commitCanvasCopy = useCallback(() => {
    const map = activeMapRef.current
    const layerId = activeLayerIdRef.current
    if (!map || !layerId) return

    const box = getBoundingBox(canvasCopyStartRef.current, canvasCopyCurrentRef.current)
    if (box) {
      const layer = layersRef.current.find(l => l.id === layerId)
      const currentData = layer?.data || {}
      const tiles: (CopiedTile | null)[] = []

      for (let dy = 0; dy < box.height; dy++) {
        for (let dx = 0; dx < box.width; dx++) {
          const targetX = box.minX + dx
          const targetY = box.minY + dy
          const tileIndex = targetY * map.width + targetX
          const existing = currentData[tileIndex]
          tiles.push(existing ? { tilesetId: existing.tilesetId, x: existing.x, y: existing.y } : null)
        }
      }
      setTileSelection({ width: box.width, height: box.height, tiles })
    }

    setCanvasCopyStart(null)
    setCanvasCopyCurrent(null)
  }, [setTileSelection])

  // ── Stage Mouse Down ─────────────────────────────────────────────────────
  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Middle-click pan start
      if (e.evt.button === 1) {
        startPan(e.evt.clientX, e.evt.clientY)
        return
      }

      const coords = getTileCoordsFromPointer()
      if (!coords) return
      const { x, y, isInside } = coords

      // Right-click tile copy sampler start
      if (e.evt.button === 2) {
        setCanvasCopyStart({ x, y })
        setCanvasCopyCurrent({ x, y })
        return
      }

      // Left-click tools
      if (e.evt.button === 0) {
        if (activeToolRef.current === 'bucket') {
          if (isInside) handlePaintBucket(x, y)
          return
        }

        if (activeToolRef.current === 'rectangle') {
          if (isInside) {
            setRectStart({ x, y })
            setRectCurrent({ x, y })
            if (paintMode === 'continuous' || paintMode === 'discontinuous') {
              setPaintStartPos({ x, y })
            }
          }
          return
        }

        // Brush / Eraser tool
        if (isInside) {
          setIsPainting(true)
          if (paintMode === 'continuous' || paintMode === 'discontinuous') {
            setPaintStartPos({ x, y })
          }
          handlePaint(x, y)
        }
      }
    },
    [getTileCoordsFromPointer, startPan, handlePaintBucket, handlePaint, setIsPainting, setPaintStartPos, paintMode]
  )

  // ── Stage Mouse Move ─────────────────────────────────────────────────────
  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (isPanningRef.current) {
        movePan(e.evt.clientX, e.evt.clientY)
        return
      }

      const coords = getTileCoordsFromPointer()
      if (!coords) return

      // Hover state
      if (coords.isInside) {
        setCanvasHover(prev => (prev?.x === coords.x && prev?.y === coords.y ? prev : { x: coords.x, y: coords.y }))
      } else if (!isPaintingRef.current && !rectStartRef.current && !canvasCopyStartRef.current) {
        setCanvasHover(null)
      }

      // Canvas copy sampler drag
      if (canvasCopyStartRef.current) {
        setCanvasCopyCurrent({ x: coords.x, y: coords.y })
        return
      }

      // Rectangle fill preview drag
      if (activeToolRef.current === 'rectangle' && rectStartRef.current) {
        setRectCurrent({ x: coords.x, y: coords.y })
        return
      }

      // Brush / Eraser painting drag
      if (isPaintingRef.current && coords.isInside) {
        handlePaint(coords.x, coords.y)
      }
    },
    [getTileCoordsFromPointer, isPanningRef, movePan, handlePaint]
  )

  // ── Global Window Drag Listeners (Outside Stage Bounds) ───────────────────
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isPanningRef.current) {
        movePan(e.clientX, e.clientY)
      }
    }

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (e.button === 1 && isPanningRef.current) {
        endPan()
      }

      if (e.button === 2 && canvasCopyStartRef.current) {
        commitCanvasCopy()
      }

      if (e.button === 0) {
        if (activeToolRef.current === 'rectangle' && rectStartRef.current && rectCurrentRef.current) {
          handleRectangleFill(rectStartRef.current, rectCurrentRef.current)
          setRectStart(null)
          setRectCurrent(null)
        }

        if (isPaintingRef.current) {
          handleCommit()
          setIsPainting(false)
        }
      }
    }

    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove)
      window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [isPanningRef, movePan, endPan, commitCanvasCopy, handleRectangleFill, handleCommit, setIsPainting])

  return {
    canvasHover,
    canvasCopyStart,
    canvasCopyCurrent,
    rectStart,
    rectCurrent,
    handleStageMouseDown,
    handleStageMouseMove,
  }
}
