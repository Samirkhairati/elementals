import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Stage, Layer as KonvaLayer, Rect } from 'react-konva'
import Konva from 'konva'
import { Settings2, ChevronDown, ChevronRight } from 'lucide-react'
import {
  Layer,
  TilesetData,
  MapData,
  TileSelection,
  ActiveTool,
  PaintMode,
  DebugInfo,
  CopiedTile,
  Pos,
  EntityData,
} from '@/types/editor'
import { useTilesetImages } from '@/hooks/editor/useTilesetImages'
import { KonvaTilemapLayer } from './konva/KonvaTilemapLayer'
import { KonvaOverlays } from './konva/KonvaOverlays'
import { KonvaEntities } from './konva/KonvaEntities'

interface MapCanvasProps {
  activeMap: MapData | null
  layers: Layer[]
  tilesets: TilesetData[]
  tileSelection: TileSelection | null
  setTileSelection: (s: TileSelection | null) => void
  activeTool: ActiveTool
  paintMode: PaintMode
  activeLayerId: string | null
  isPainting: boolean
  setIsPainting: (v: boolean) => void
  paintStartPos: Pos | null
  setPaintStartPos: (v: Pos | null) => void
  debugInfo: DebugInfo | null
  handlePaint: (x: number, y: number) => void
  handlePaintBucket: (x: number, y: number) => void
  handleRectangleFill: (start: Pos, end: Pos) => void
  handleCommit: () => void
  entities?: EntityData[]
  selectedEntityId?: string | null
  setSelectedEntityId?: (id: string | null) => void
  moveEntity?: (id: string, x: number, y: number) => void
}

export function MapCanvas({
  activeMap,
  layers,
  tilesets,
  tileSelection,
  setTileSelection,
  activeTool,
  paintMode,
  activeLayerId,
  isPainting,
  setIsPainting,
  paintStartPos,
  setPaintStartPos,
  debugInfo,
  handlePaint,
  handlePaintBucket,
  handleRectangleFill,
  handleCommit,
  entities = [],
  selectedEntityId = null,
  setSelectedEntityId,
  moveEntity,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<Konva.Stage | null>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  // Preload and cache tileset images for fast canvas 2D rendering
  const images = useTilesetImages(tilesets)

  const [canvasHover, setCanvasHover] = useState<Pos | null>(null)
  const [canvasCopyStart, setCanvasCopyStart] = useState<Pos | null>(null)
  const [canvasCopyCurrent, setCanvasCopyCurrent] = useState<Pos | null>(null)
  const [rectStart, setRectStart] = useState<Pos | null>(null)
  const [rectCurrent, setRectCurrent] = useState<Pos | null>(null)
  const [debugExpanded, setDebugExpanded] = useState(false)

  // ── Stable Refs for listeners ───────────────────────────────────────────
  const isPaintingRef = useRef(isPainting)
  useEffect(() => { isPaintingRef.current = isPainting }, [isPainting])

  const isPanningRef = useRef(false)
  const lastPanPosRef = useRef({ x: 0, y: 0 })

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

  // ── Resize Observer for Stage Dimensions ─────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const updateSize = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setDimensions({ width: Math.floor(rect.width), height: Math.floor(rect.height) })
      }
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // ── Center Map Initially on Load or Map Change ───────────────────────────
  const hasCenteredMapRef = useRef<string | null>(null)
  useEffect(() => {
    if (!activeMap || !stageRef.current) return
    const mapKey = `${activeMap.folderPath || ''}/${activeMap.fileName}`
    if (hasCenteredMapRef.current !== mapKey && dimensions.width > 0 && dimensions.height > 0) {
      hasCenteredMapRef.current = mapKey
      const stage = stageRef.current
      const mapW = activeMap.width * 32
      const mapH = activeMap.height * 32
      const initialScale = Math.min(
        1,
        Math.max(0.2, Math.min((dimensions.width * 0.8) / mapW, (dimensions.height * 0.8) / mapH))
      )
      const posX = (dimensions.width - mapW * initialScale) / 2
      const posY = (dimensions.height - mapH * initialScale) / 2

      stage.scale({ x: initialScale, y: initialScale })
      stage.position({ x: posX, y: posY })
      stage.batchDraw()
    }
  }, [activeMap, dimensions])

  // ── Coordinate Calculation Helper ────────────────────────────────────────
  const getTileCoordsFromPointer = useCallback(() => {
    const stage = stageRef.current
    if (!stage || !activeMapRef.current) return null
    const pointer = stage.getPointerPosition()
    if (!pointer) return null

    const transform = stage.getAbsoluteTransform().copy().invert()
    const localPos = transform.point(pointer)

    const rawX = Math.floor(localPos.x / 32)
    const rawY = Math.floor(localPos.y / 32)
    const clampedX = Math.max(0, Math.min(activeMapRef.current.width - 1, rawX))
    const clampedY = Math.max(0, Math.min(activeMapRef.current.height - 1, rawY))
    const isInside =
      rawX >= 0 &&
      rawX < activeMapRef.current.width &&
      rawY >= 0 &&
      rawY < activeMapRef.current.height

    return { x: clampedX, y: clampedY, rawX, rawY, isInside }
  }, [])

  // ── Canvas Copy Helper ───────────────────────────────────────────────────
  const getCanvasCopyBox = useCallback(() => {
    if (!canvasCopyStartRef.current || !canvasCopyCurrentRef.current) return null
    const minX = Math.min(canvasCopyStartRef.current.x, canvasCopyCurrentRef.current.x)
    const minY = Math.min(canvasCopyStartRef.current.y, canvasCopyCurrentRef.current.y)
    const maxX = Math.max(canvasCopyStartRef.current.x, canvasCopyCurrentRef.current.x)
    const maxY = Math.max(canvasCopyStartRef.current.y, canvasCopyCurrentRef.current.y)
    return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 }
  }, [])

  const commitCanvasCopy = useCallback(() => {
    if (!activeMapRef.current || !activeLayerIdRef.current) return
    const box = getCanvasCopyBox()
    if (box) {
      const layer = layersRef.current.find(l => l.id === activeLayerIdRef.current)
      const currentData = layer?.data || {}
      const tiles: (CopiedTile | null)[] = []
      for (let dy = 0; dy < box.height; dy++) {
        for (let dx = 0; dx < box.width; dx++) {
          const targetX = box.minX + dx
          const targetY = box.minY + dy
          const tileIndex = targetY * activeMapRef.current.width + targetX
          const existing = currentData[tileIndex]
          if (existing) {
            tiles.push({ tilesetId: existing.tilesetId, x: existing.x, y: existing.y })
          } else {
            tiles.push(null)
          }
        }
      }
      setTileSelection({ width: box.width, height: box.height, tiles })
    }
    setCanvasCopyStart(null)
    setCanvasCopyCurrent(null)
  }, [getCanvasCopyBox, setTileSelection])

  // ── Wheel Zoom (Cursor-Centered Exponential Scaling) ─────────────────────
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return

    const oldScale = stage.scaleX()
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const clampedDelta = Math.max(-120, Math.min(120, e.evt.deltaY))
    const sensitivity = (e.evt.ctrlKey || e.evt.metaKey) ? 0.003 : 0.0015
    const factor = Math.exp(-clampedDelta * sensitivity)
    const newScale = Math.min(Math.max(0.15, oldScale * factor), 5)

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    }

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    }

    stage.scale({ x: newScale, y: newScale })
    stage.position(newPos)
    stage.batchDraw()
  }, [])

  // ── Stage Mouse Down ─────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    // 1. Middle-click pan start
    if (e.evt.button === 1) {
      isPanningRef.current = true
      lastPanPosRef.current = { x: e.evt.clientX, y: e.evt.clientY }
      return
    }

    const coords = getTileCoordsFromPointer()
    if (!coords) return
    const { x, y, isInside } = coords

    // 2. Right-click tile copy start
    if (e.evt.button === 2) {
      setCanvasCopyStart({ x, y })
      setCanvasCopyCurrent({ x, y })
      return
    }

    // 3. Left-click tool actions
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
  }, [getTileCoordsFromPointer, handlePaintBucket, handlePaint, setIsPainting, setPaintStartPos, paintMode])

  // ── Stage Mouse Move ─────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current

    // 1. Panning
    if (isPanningRef.current && stage) {
      const dx = e.evt.clientX - lastPanPosRef.current.x
      const dy = e.evt.clientY - lastPanPosRef.current.y
      lastPanPosRef.current = { x: e.evt.clientX, y: e.evt.clientY }
      stage.position({ x: stage.x() + dx, y: stage.y() + dy })
      stage.batchDraw()
      return
    }

    const coords = getTileCoordsFromPointer()
    if (!coords) return

    // Update hover
    if (coords.isInside) {
      setCanvasHover(prev =>
        prev?.x === coords.x && prev?.y === coords.y ? prev : { x: coords.x, y: coords.y }
      )
    } else if (!isPaintingRef.current && !rectStartRef.current && !canvasCopyStartRef.current) {
      setCanvasHover(null)
    }

    // Canvas copy drag
    if (canvasCopyStartRef.current) {
      setCanvasCopyCurrent({ x: coords.x, y: coords.y })
      return
    }

    // Rectangle fill drag
    if (activeToolRef.current === 'rectangle' && rectStartRef.current) {
      setRectCurrent({ x: coords.x, y: coords.y })
      return
    }

    // Brush / Eraser painting drag
    if (isPaintingRef.current && coords.isInside) {
      handlePaint(coords.x, coords.y)
    }
  }, [getTileCoordsFromPointer, handlePaint])

  // ── Window Global Mouse Listeners ────────────────────────────────────────
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      // If panning via middle mouse outside stage element
      if (isPanningRef.current && stageRef.current) {
        const dx = e.clientX - lastPanPosRef.current.x
        const dy = e.clientY - lastPanPosRef.current.y
        lastPanPosRef.current = { x: e.clientX, y: e.clientY }
        const stage = stageRef.current
        stage.position({ x: stage.x() + dx, y: stage.y() + dy })
        stage.batchDraw()
      }
    }

    const handleGlobalMouseUp = (e: MouseEvent) => {
      // 1. End Pan
      if (e.button === 1 && isPanningRef.current) {
        isPanningRef.current = false
      }

      // 2. Commit Canvas Copy
      if (e.button === 2 && canvasCopyStartRef.current) {
        commitCanvasCopy()
      }

      // 3. Left-click Commit
      if (e.button === 0) {
        if (
          activeToolRef.current === 'rectangle' &&
          rectStartRef.current &&
          rectCurrentRef.current
        ) {
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
  }, [commitCanvasCopy, handleCommit, handleRectangleFill, setIsPainting])

  const mapWidthPx = activeMap ? activeMap.width * 32 : 0
  const mapHeightPx = activeMap ? activeMap.height * 32 : 0

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden relative min-w-0 min-h-0 bg-[#1a1a1a]"
      onContextMenu={e => e.preventDefault()}
    >
      {activeMap ? (
        <Stage
          ref={stageRef}
          width={dimensions.width}
          height={dimensions.height}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
        >
          {/* Main Map Background & Tiles */}
          <KonvaLayer>
            {/* Map background fill */}
            <Rect
              x={0}
              y={0}
              width={mapWidthPx}
              height={mapHeightPx}
              fill="#222222"
              shadowColor="black"
              shadowBlur={10}
              shadowOpacity={0.5}
              listening={false}
            />

            {/* Tilemap layers (batched canvas 2D draws) */}
            <KonvaTilemapLayer
              layers={layers}
              images={images}
              activeMap={activeMap}
            />

            {/* Grid & Tool Overlays */}
            <KonvaOverlays
              activeMap={activeMap}
              activeTool={activeTool}
              tileSelection={tileSelection}
              canvasHover={canvasHover}
              canvasCopyStart={canvasCopyStart}
              canvasCopyCurrent={canvasCopyCurrent}
              rectStart={rectStart}
              rectCurrent={rectCurrent}
            />

            {/* Draggable Interactive Entities */}
            <KonvaEntities
              entities={entities}
              selectedEntityId={selectedEntityId}
              setSelectedEntityId={setSelectedEntityId || (() => {})}
              moveEntity={moveEntity || (() => {})}
              activeMap={activeMap}
              images={images}
            />
          </KonvaLayer>
        </Stage>
      ) : (
        <div className="h-full w-full flex items-center justify-center text-muted-foreground font-mono text-xs tracking-wider opacity-50">
          Select or create a map to start editing
        </div>
      )}

      {/* Floating Debug Status Badge */}
      <div
        className={`absolute bottom-4 right-4 bg-black/80 text-green-400 rounded font-mono z-50 shadow-lg ring-1 ring-white/20 min-w-[250px] transition-all overflow-hidden ${
          debugExpanded ? 'p-4' : 'p-2'
        }`}
      >
        <div
          className="font-bold text-white uppercase tracking-wider flex items-center justify-between cursor-pointer"
          onClick={() => setDebugExpanded(!debugExpanded)}
        >
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-green-400" />
            <span className="text-xs">Debug Status (Konva)</span>
          </div>
          <button className="hover:bg-white/10 p-1 rounded">
            {debugExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        </div>

        {debugExpanded && (
          <div className="flex flex-col gap-1 mt-2 border-t border-white/20 pt-2 text-xs pointer-events-none">
            <div>Engine: Konva Canvas 2D</div>
            <div>Tool: {activeTool}</div>
            <div>Selection: {tileSelection ? `${tileSelection.width}x${tileSelection.height} tiles` : 'NONE'}</div>
            <div>Active Layer ID: {activeLayerId || 'NONE'}</div>
            <div>Active Map: {activeMap ? `${activeMap.name} (${activeMap.width}x${activeMap.height})` : 'NONE'}</div>
            <div>isPainting: {isPainting ? 'TRUE' : 'FALSE'}</div>
            <div className="mt-2 text-yellow-400">Last Paint Result:</div>
            <div className="whitespace-pre-wrap">
              {debugInfo
                ? `${debugInfo.action.toUpperCase()} at [${debugInfo.x ?? '-'}, ${debugInfo.y ?? '-'}]\nReason: ${debugInfo.error}`
                : 'Waiting for input...'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
