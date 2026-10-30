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
  EntityData,
} from '@/types/editor'
import { getBoundingBox } from '@/components/editor/canvas/canvasUtils'
import { TileCoords } from './useCanvasViewport'
import { PendingEntityPlacement } from '@/hooks/editor/useEntityPlacement'
import {
  CanvasContextMenuState,
} from '@/components/editor/canvas/CanvasContextMenu'

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
  selectedEntityId?: string | null
  setSelectedEntityId?: (id: string | null) => void
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
  snapEntityPos: _snapEntityPos,
  resizingColliderEntityId = null,
  setResizingColliderEntityId,
  selectedEntityId = null,
  setSelectedEntityId,
}: UseCanvasInteractionProps) {
  const [canvasHover, setCanvasHover] = useState<Pos | null>(null)
  const [canvasCopyStart, setCanvasCopyStart] = useState<Pos | null>(null)
  const [canvasCopyCurrent, setCanvasCopyCurrent] = useState<Pos | null>(null)
  const [rectStart, setRectStart] = useState<Pos | null>(null)
  const [rectCurrent, setRectCurrent] = useState<Pos | null>(null)
  const [isSpaceDown, setIsSpaceDown] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [stagePointerPos, setStagePointerPos] = useState<{ x: number; y: number } | null>(null)
  const [contextMenuState, setContextMenuState] = useState<CanvasContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    target: null,
  })

  const isSpaceDownRef = useRef(false)
  const rightClickRef = useRef<{
    clientX: number
    clientY: number
    tileX: number
    tileY: number
    isEntity: boolean
    entity?: EntityData
  } | null>(null)
  const isRightDraggingRef = useRef(false)

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

  // ── Single Tile Sampling Helper ─────────────────────────────────────────
  const sampleSingleTile = useCallback(
    (tileX: number, tileY: number) => {
      const map = activeMapRef.current
      const layerId = activeLayerIdRef.current
      if (!map || !layerId) return

      const layer = layersRef.current.find((l) => l.id === layerId)
      const currentData = layer?.data || {}
      const tileIndex = tileY * map.width + tileX
      const existing = currentData[tileIndex]
      if (existing) {
        setTileSelection({
          width: 1,
          height: 1,
          tiles: [{ tilesetId: existing.tilesetId, x: existing.x, y: existing.y }],
        })
      }
    },
    [setTileSelection]
  )

  // ── Right-Click on Entity Handler ────────────────────────────────────────
  const handleRightClickEntity = useCallback(
    (entity: EntityData, clientX: number, clientY: number) => {
      const coords = getTileCoordsFromPointer()
      rightClickRef.current = {
        clientX,
        clientY,
        tileX: coords?.x ?? Math.floor(entity.x / 32),
        tileY: coords?.y ?? Math.floor(entity.y / 32),
        isEntity: true,
        entity,
      }
      isRightDraggingRef.current = false
      if (coords) {
        setCanvasCopyStart({ x: coords.x, y: coords.y })
        setCanvasCopyCurrent({ x: coords.x, y: coords.y })
      }
    },
    [getTileCoordsFromPointer]
  )

  const closeContextMenu = useCallback(() => {
    setContextMenuState((prev) => ({ ...prev, isOpen: false }))
  }, [])

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

      // Check if user clicked on an entity, collider shape, transformer handle
      const isEntityOrTransformer = e.target !== e.target.getStage()

      // If an interactive entity or collider transformer was clicked
      if (isEntityOrTransformer) {
        if (e.evt.button === 0) {
          // Left click on entity / transformer:
          // Do NOT paint tiles, do NOT bucket fill, do NOT rectangle fill.
          // Let Konva's entity drag / transform events handle it cleanly!
          return
        }
        if (e.evt.button === 2) {
          // Right click on entity: KonvaEntityNode handles recording the right-click target
          return
        }
      }

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

      // If an entity was selected or we were resizing collider, clicking elsewhere on the canvas
      // should ONLY deselect on the first click and NOT start painting immediately!
      if (e.evt.button === 0 && (selectedEntityId || resizingColliderEntityId)) {
        if (selectedEntityId && setSelectedEntityId) {
          setSelectedEntityId(null)
        }
        if (resizingColliderEntityId && setResizingColliderEntityId) {
          setResizingColliderEntityId(null)
        }
        return
      }

      // Deselect collider resize mode if clicking elsewhere on canvas
      if (resizingColliderEntityId && setResizingColliderEntityId) {
        setResizingColliderEntityId(null)
      }

      // Right-click tile down: prepare for possible tile drag selection or single-click context menu
      if (e.evt.button === 2) {
        rightClickRef.current = {
          clientX: e.evt.clientX,
          clientY: e.evt.clientY,
          tileX: coords.x,
          tileY: coords.y,
          isEntity: false,
        }
        isRightDraggingRef.current = false
        setCanvasCopyStart({ x: coords.x, y: coords.y })
        setCanvasCopyCurrent({ x: coords.x, y: coords.y })
        return
      }

      // Left-click tools on tilemap
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
      selectedEntityId,
      setSelectedEntityId,
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

      // Right-click drag detection (eyedropper / tile selection marquee)
      if (rightClickRef.current) {
        const dist = Math.hypot(
          e.evt.clientX - rightClickRef.current.clientX,
          e.evt.clientY - rightClickRef.current.clientY
        )
        if (dist > 4 || coords.x !== rightClickRef.current.tileX || coords.y !== rightClickRef.current.tileY) {
          isRightDraggingRef.current = true
        }
        if (isRightDraggingRef.current) {
          if (!canvasCopyStartRef.current) {
            setCanvasCopyStart({ x: rightClickRef.current.tileX, y: rightClickRef.current.tileY })
          }
          setCanvasCopyCurrent({ x: coords.x, y: coords.y })
          return
        }
      }

      // If an entity or node is currently being dragged, DO NOT paint!
      if (stageRef?.current?.isDragging?.()) {
        return
      }

      // Hover state
      if (coords.isInside) {
        setCanvasHover(prev => (prev?.x === coords.x && prev?.y === coords.y ? prev : { x: coords.x, y: coords.y }))
      } else if (!isPaintingRef.current && !rectStartRef.current && !canvasCopyStartRef.current) {
        setCanvasHover(null)
      }

      // Canvas copy sampler drag (if triggered elsewhere)
      if (canvasCopyStartRef.current && !rightClickRef.current) {
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

      // Right-click released
      if (e.button === 2) {
        if (rightClickRef.current) {
          if (isRightDraggingRef.current) {
            // Dragged -> Commit tile selection marquee!
            commitCanvasCopy()
          } else {
            // Single right-click without drag -> Clear copy marquee and Open Context Menu!
            setCanvasCopyStart(null)
            setCanvasCopyCurrent(null)
            if (rightClickRef.current.isEntity && rightClickRef.current.entity) {
              setContextMenuState({
                isOpen: true,
                x: e.clientX,
                y: e.clientY,
                target: { type: 'entity', entity: rightClickRef.current.entity },
              })
            } else {
              setContextMenuState({
                isOpen: true,
                x: e.clientX,
                y: e.clientY,
                target: { type: 'tile', tileX: rightClickRef.current.tileX, tileY: rightClickRef.current.tileY },
              })
            }
          }
          rightClickRef.current = null
          isRightDraggingRef.current = false
        } else if (canvasCopyStartRef.current) {
          commitCanvasCopy()
        }
      }

      // Left-click released
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
    contextMenuState,
    setContextMenuState,
    closeContextMenu,
    sampleSingleTile,
    handleRightClickEntity,
    handleStageMouseDown,
    handleStageMouseMove,
  }
}
