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
import { PendingEntityPlacement } from '@/hooks/editor/useEntityPlacement'
import { CanvasContextMenuTarget } from '@/components/editor/canvas/CanvasContextMenu'

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
  isZoomingRef: React.MutableRefObject<boolean>
  startPan: (clientX: number, clientY: number) => void
  movePan: (clientX: number, clientY: number) => void
  endPan: () => void
  stageRef?: React.RefObject<Konva.Stage | null>
  pendingPlacement?: PendingEntityPlacement | null
  commitPlacement?: (x: number, y: number) => void
  cancelPlacement?: () => void
  snapToGrid?: boolean
  snapEntityPos?: (rawX: number, rawY: number) => { x: number; y: number }
  resizingColliderEntityId?: string | null
  setResizingColliderEntityId?: (id: string | null) => void
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
  isZoomingRef,
  startPan,
  movePan,
  endPan,
  stageRef,
  pendingPlacement = null,
  commitPlacement,
  cancelPlacement,
  snapToGrid = true,
  snapEntityPos,
  resizingColliderEntityId = null,
  setResizingColliderEntityId,
}: UseCanvasInteractionProps) {
  const [canvasHover, setCanvasHover] = useState<Pos | null>(null)
  const [canvasCopyStart, setCanvasCopyStart] = useState<Pos | null>(null)
  const [canvasCopyCurrent, setCanvasCopyCurrent] = useState<Pos | null>(null)
  const [rectStart, setRectStart] = useState<Pos | null>(null)
  const [rectCurrent, setRectCurrent] = useState<Pos | null>(null)
  const [isSpaceDown, setIsSpaceDown] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [stagePointerPos, setStagePointerPos] = useState<{ x: number; y: number } | null>(null)
  const [contextMenuTarget, setContextMenuTarget] = useState<CanvasContextMenuTarget | null>(null)

  const isSpaceDownRef = useRef(false)

  // ── Keyboard Listeners for Spacebar Pan Mode ─────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      if (e.code === 'Space' && !e.repeat) {
        setIsSpaceDown(true)
        isSpaceDownRef.current = true
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpaceDown(false)
        isSpaceDownRef.current = false
        if (isPanningRef.current) {
          endPan()
          setIsPanning(false)
        }
      }
    }

    const handleBlur = () => {
      setIsSpaceDown(false)
      isSpaceDownRef.current = false
      if (isPanningRef.current) {
        endPan()
        setIsPanning(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [endPan, isPanningRef])

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
      // Middle-click OR Space + Left-click pan start
      if (e.evt.button === 1 || (e.evt.button === 0 && isSpaceDownRef.current)) {
        startPan(e.evt.clientX, e.evt.clientY)
        setIsPanning(true)
        return
      }

      const coords = getTileCoordsFromPointer()
      if (!coords) return
      const { x, y, isInside } = coords

      // If pending entity placement mode is active
      if (pendingPlacement) {
        if (e.evt.button === 0) {
          const stage = stageRef?.current
          let posX = coords.rawX * 32 + 16
          let posY = coords.rawY * 32 + 32
          if (!snapToGrid && stage) {
            const p = stage.getPointerPosition()
            if (p) {
              const scale = stage.scaleX() || 1
              posX = Math.round((p.x - stage.x()) / scale)
              posY = Math.round((p.y - stage.y()) / scale)
            }
          }
          commitPlacement?.(posX, posY)
          return
        }
        if (e.evt.button === 2) {
          cancelPlacement?.()
          return
        }
      }

      // Deselect collider resize mode if clicking elsewhere on canvas
      if (resizingColliderEntityId && setResizingColliderEntityId) {
        setResizingColliderEntityId(null)
      }

      // Right-click tile context menu & copy sampler start
      if (e.evt.button === 2) {
        setContextMenuTarget({
          type: 'tile',
          tileX: coords.x,
          tileY: coords.y,
        })
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
    [
      getTileCoordsFromPointer,
      startPan,
      handlePaintBucket,
      handlePaint,
      setIsPainting,
      setPaintStartPos,
      paintMode,
      pendingPlacement,
      commitPlacement,
      cancelPlacement,
      snapToGrid,
      stageRef,
      resizingColliderEntityId,
      setResizingColliderEntityId,
    ]
  )

  // ── Stage Mouse Move ─────────────────────────────────────────────────────
  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Track pointer position in world coordinates (for ghost placement entity)
      if (stageRef?.current) {
        const p = stageRef.current.getPointerPosition()
        if (p) {
          const scale = stageRef.current.scaleX() || 1
          setStagePointerPos({
            x: (p.x - stageRef.current.x()) / scale,
            y: (p.y - stageRef.current.y()) / scale,
          })
        }
      }

      if (isPanningRef.current || isZoomingRef.current) {
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
    [getTileCoordsFromPointer, isPanningRef, isZoomingRef, handlePaint, stageRef]
  )

  // ── Global Window Drag Listeners (Outside Stage Bounds) ───────────────────
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isPanningRef.current) {
        movePan(e.clientX, e.clientY)
      }
    }

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (isPanningRef.current) {
        if (e.button === 1 || e.button === 0) {
          endPan()
          setIsPanning(false)
        }
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
    isSpaceDown,
    isPanning,
    stagePointerPos,
    contextMenuTarget,
    setContextMenuTarget,
    handleStageMouseDown,
    handleStageMouseMove,
  }
}
