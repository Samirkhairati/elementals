import { useState, useRef, useEffect, useCallback } from 'react'
import type { ImagePick } from '@/lib/graphicAssets'
import { flippedItemBounds } from '@/lib/imageItems'
import { snapPicture } from '@/lib/imageSnap'
import { applyAxisLock, type Axis, type AxisLock } from '@/lib/axisLock'
import type { SpriteAssetInfo } from '../../../../../shared/engine/types'
import Konva from 'konva'
import {
  Layer,
  MapData,
  TileSelection,
  ActiveTool,
  PaintMode,
  Pos,
  EntityData,
} from '@/types/editor'
import { getBoundingBox } from '@/components/editor/canvas/canvasUtils'
import { sampleSelection, sampledLayers } from '@/lib/layerSelection'
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
  selectedEntityId?: string | null
  setSelectedEntityId?: (id: string | null) => void
  /** Pinned: a right-drag samples every selected layer instead of only the active one. */
  pinSelection?: boolean
  /** Layers added with Ctrl/Cmd+click, on top of the active layer. */
  selectedLayerIds?: readonly string[]
  /** Image layers: a sprite waiting to be dropped, where the next click puts it, and how a click on empty canvas deselects. */
  pendingImage?: ImagePick | null
  /** Pictures known to the editor: the pending image's size decides where its snapped anchor goes. */
  spriteAssets?: Record<string, SpriteAssetInfo>
  commitImagePlacement?: (x: number, y: number) => void
  cancelImagePlacement?: () => void
  clearImageSelection?: () => void
}

/** True for the pick/drag handle of a picture on an image layer (see KonvaImageItems). */
type NodeLike = { name(): string; getParent(): NodeLike | null; getAttr?(name: string): unknown }
export function isPictureHandle(node: NodeLike | null): boolean {
  for (let n: NodeLike | null = node; n; n = n.getParent()) if (n.name() === 'image-handle') return true
  return false
}

/** The id of the picture whose handle this node is (or is drawn inside), if any. */
export function pictureHandleId(node: NodeLike | null): string | null {
  for (let n: NodeLike | null = node; n; n = n.getParent()) {
    if (n.name() === 'image-handle') {
      const id = n.getAttr?.('imageId')
      return typeof id === 'string' ? id : null
    }
  }
  return null
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
  selectedEntityId = null,
  setSelectedEntityId,
  pinSelection = false,
  selectedLayerIds = [],
  pendingImage = null,
  spriteAssets,
  commitImagePlacement,
  cancelImagePlacement,
  clearImageSelection,
}: UseCanvasInteractionProps) {
  const [canvasHover, setCanvasHover] = useState<Pos | null>(null)
  const [canvasCopyStart, setCanvasCopyStart] = useState<Pos | null>(null)
  const [canvasCopyCurrent, setCanvasCopyCurrent] = useState<Pos | null>(null)
  const [rectStart, setRectStart] = useState<Pos | null>(null)
  const [rectCurrent, setRectCurrent] = useState<Pos | null>(null)
  const [isSpaceDown, setIsSpaceDown] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [stagePointerPos, setStagePointerPos] = useState<{ x: number; y: number } | null>(null)
  /** Placing a picture with Shift held: where Shift went down and which axis the pointer chose (see lib/axisLock). */
  const placementLockRef = useRef<AxisLock | null>(null)
  const [placementAxis, setPlacementAxis] = useState<Axis | null>(null)
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
    /** The picture under the pointer when the right button went down (its menu offers "Place multiple"). */
    pictureId?: string
  } | null>(null)
  const isRightDraggingRef = useRef(false)
  // The current press is Shift + left button standing in for the right button.
  const shiftSecondaryRef = useRef(false)

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

  const pinSelectionRef = useRef(pinSelection)
  useEffect(() => { pinSelectionRef.current = pinSelection }, [pinSelection])

  const selectedLayerIdsRef = useRef(selectedLayerIds)
  useEffect(() => { selectedLayerIdsRef.current = selectedLayerIds }, [selectedLayerIds])

  // ── Canvas Copy / Sampler Commit ─────────────────────────────────────────
  const commitCanvasCopy = useCallback(() => {
    const map = activeMapRef.current
    const layerId = activeLayerIdRef.current
    if (!map || !layerId) return

    const box = getBoundingBox(canvasCopyStartRef.current, canvasCopyCurrentRef.current)
    if (box) {
      // Pinned: every selected layer joins the selection. Otherwise only the active one is sampled.
      const sourceLayers = pinSelectionRef.current
        ? sampledLayers(layersRef.current, layerId, selectedLayerIdsRef.current)
        : layersRef.current.filter(l => l.id === layerId && l.type !== 'image')
      if (sourceLayers.length > 0) setTileSelection(sampleSelection(sourceLayers, map.width, box))
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
      if (layer?.type === 'image') return
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
      // Shift + left button is the same gesture as the right button (sampling, context menu, cancel), except while a picture
      // is being placed: there Shift locks it to one axis, and the click places it.
      const secondary = e.evt.button === 2 || (e.evt.button === 0 && e.evt.shiftKey && !pendingImage)
      shiftSecondaryRef.current = secondary && e.evt.button === 0
      const button = secondary ? 2 : e.evt.button

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
      // (A picture handle is neither: right-clicking over a picture still opens the tile menu.)
      const isEntityOrTransformer = e.target !== e.target.getStage() && !isPictureHandle(e.target)

      // If an interactive entity or collider transformer was clicked
      if (isEntityOrTransformer) {
        if (button === 0) {
          // Left click on entity / transformer:
          // Do NOT paint tiles, do NOT bucket fill, do NOT rectangle fill.
          // Let Konva's entity drag / transform events handle it cleanly!
          return
        }
        if (button === 2) {
          // Right click on entity: KonvaEntityNode handles recording the right-click target
          return
        }
      }

      // If pending entity placement mode is active
      if (pendingPlacement) {
        if (button === 0) {
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
        if (button === 2) {
          cancelPlacement?.()
          return
        }
      }

      // If an entity was selected, clicking elsewhere on the canvas should ONLY deselect on the first
      // click and NOT start painting immediately!
      if (button === 0 && selectedEntityId) {
        setSelectedEntityId?.(null)
        return
      }

      if (pendingImage && button === 2) {
        cancelImagePlacement?.()
        return
      }

      // Right-click tile down: prepare for possible tile drag selection or single-click context menu
      if (button === 2) {
        rightClickRef.current = {
          clientX: e.evt.clientX,
          clientY: e.evt.clientY,
          tileX: coords.x,
          tileY: coords.y,
          isEntity: false,
          pictureId: pictureHandleId(e.target) ?? undefined,
        }
        isRightDraggingRef.current = false
        setCanvasCopyStart({ x: coords.x, y: coords.y })
        setCanvasCopyCurrent({ x: coords.x, y: coords.y })
        return
      }

      // Image layer: a click drops the pending image, otherwise it only deselects (tiles are never painted here).
      const activeLayer = layersRef.current.find((l) => l.id === activeLayerIdRef.current)
      if (activeLayer?.type === 'image') {
        if (button === 0) {
          if (pendingImage && coords.isInside && !activeLayer.locked && activeLayer.visible) {
            // Same maths as the ghost preview, so the image lands where the preview showed it.
            const p = stageRef?.current?.getPointerPosition()
            const stage = stageRef?.current
            const scale = stage?.scaleX() || 1
            const raw = p && stage ? { x: (p.x - stage.x()) / scale, y: (p.y - stage.y()) / scale } : { x: coords.rawX * 32 + 16, y: coords.rawY * 32 + 32 }
            const world = e.evt.shiftKey ? applyAxisLock(placementLockRef.current, true, raw.x, raw.y) : raw
            const at = snapToGrid ? snapPicture(flippedItemBounds(pendingImage, spriteAssets ?? {}, true), world.x, world.y) : { x: Math.round(world.x), y: Math.round(world.y) }
            commitImagePlacement?.(at.x, at.y)
          } else {
            clearImageSelection?.()
          }
        }
        return
      }

      // Left-click tools on tilemap
      if (button === 0) {
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
      selectedEntityId,
      setSelectedEntityId,
      pendingImage,
      spriteAssets,
      commitImagePlacement,
      cancelImagePlacement,
      clearImageSelection,
      snapEntityPos,
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
          let world = { x: (p.x - stageRef.current.x()) / scale, y: (p.y - stageRef.current.y()) / scale }
          if (pendingImage) {
            const locked = applyAxisLock(placementLockRef.current, e.evt.shiftKey, world.x, world.y)
            placementLockRef.current = locked.lock
            setPlacementAxis(locked.lock?.axis ?? null)
            world = { x: locked.x, y: locked.y }
          } else if (placementLockRef.current) {
            placementLockRef.current = null
            setPlacementAxis(null)
          }
          setStagePointerPos(world)
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
      // A Shift-initiated press ends as a right-button release, even if Shift was let go first.
      const secondaryUp = e.button === 2 || (e.button === 0 && shiftSecondaryRef.current)
      if (e.button === 0) shiftSecondaryRef.current = false
      if (isPanningRef.current) {
        if (e.button === 1 || e.button === 0) {
          endPan()
          setIsPanning(false)
        }
      }

      // Right-click released
      if (secondaryUp) {
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
                target: { type: 'tile', tileX: rightClickRef.current.tileX, tileY: rightClickRef.current.tileY, pictureId: rightClickRef.current.pictureId },
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
      if (e.button === 0 && !secondaryUp) {
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
    placementAxis,
    contextMenuState,
    setContextMenuState,
    closeContextMenu,
    sampleSingleTile,
    handleRightClickEntity,
    handleStageMouseDown,
    handleStageMouseMove,
  }
}
