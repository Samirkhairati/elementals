import { useState, useRef, useEffect, useCallback } from 'react'
import { Settings2, ChevronDown, ChevronRight } from 'lucide-react'
import { Layer, TilesetData, MapData, TileSelection, ActiveTool, PaintMode, DebugInfo, CopiedTile, Pos, EntityData } from '@/types/editor'
import { CanvasLayers } from './CanvasLayers'
import { CanvasOverlays } from './CanvasOverlays'
import { CanvasEntities } from './CanvasEntities'

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
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPos, setLastPanPos] = useState({ x: 0, y: 0 })

  const [canvasHover, setCanvasHover] = useState<Pos | null>(null)
  const [canvasCopyStart, setCanvasCopyStart] = useState<Pos | null>(null)
  const [canvasCopyCurrent, setCanvasCopyCurrent] = useState<Pos | null>(null)
  const [rectStart, setRectStart] = useState<Pos | null>(null)
  const [rectCurrent, setRectCurrent] = useState<Pos | null>(null)

  const [debugExpanded, setDebugExpanded] = useState(false)
  const mapRef = useRef<HTMLDivElement | null>(null)

  // ── Stable Refs for Global Window Listeners ──────────────────────────────
  const isPaintingRef = useRef(isPainting)
  useEffect(() => { isPaintingRef.current = isPainting }, [isPainting])

  const isPanningRef = useRef(isPanning)
  useEffect(() => { isPanningRef.current = isPanning }, [isPanning])

  const lastPanPosRef = useRef(lastPanPos)
  useEffect(() => { lastPanPosRef.current = lastPanPos }, [lastPanPos])

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

  // ── Coordinate Calculation Helper ────────────────────────────────────────
  const getTileCoords = useCallback((clientX: number, clientY: number) => {
    if (!mapRef.current || !activeMapRef.current) return null
    const rect = mapRef.current.getBoundingClientRect()
    const relX = (clientX - rect.left) / rect.width
    const relY = (clientY - rect.top) / rect.height
    const rawX = Math.floor(relX * activeMapRef.current.width)
    const rawY = Math.floor(relY * activeMapRef.current.height)
    const clampedX = Math.max(0, Math.min(activeMapRef.current.width - 1, rawX))
    const clampedY = Math.max(0, Math.min(activeMapRef.current.height - 1, rawY))
    const isInside =
      rawX >= 0 &&
      rawX < activeMapRef.current.width &&
      rawY >= 0 &&
      rawY < activeMapRef.current.height
    return { x: clampedX, y: clampedY, rawX, rawY, isInside }
  }, [])

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

  // ── Global Window Drag Listeners ─────────────────────────────────────────
  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      // 1. Panning
      if (isPanningRef.current) {
        setPan(prev => ({
          x: prev.x + (e.clientX - lastPanPosRef.current.x),
          y: prev.y + (e.clientY - lastPanPosRef.current.y),
        }))
        setLastPanPos({ x: e.clientX, y: e.clientY })
        return
      }

      const coords = getTileCoords(e.clientX, e.clientY)
      if (!coords) return

      // Update hover state
      if (coords.isInside) {
        setCanvasHover({ x: coords.x, y: coords.y })
      } else if (!isPaintingRef.current && !rectStartRef.current && !canvasCopyStartRef.current) {
        setCanvasHover(null)
      }

      // 2. Canvas Copy
      if (canvasCopyStartRef.current) {
        setCanvasCopyCurrent({ x: coords.x, y: coords.y })
        return
      }

      // 3. Rectangle Fill Drag
      if (activeToolRef.current === 'rectangle' && rectStartRef.current) {
        setRectCurrent({ x: coords.x, y: coords.y })
        return
      }

      // 4. Brush / Eraser Painting Drag
      if (isPaintingRef.current) {
        if (coords.isInside) {
          handlePaint(coords.x, coords.y)
        }
      }
    }

    const handleWindowMouseUp = (e: MouseEvent) => {
      if (e.button === 1 && isPanningRef.current) {
        setIsPanning(false)
      }

      if (e.button === 2 && canvasCopyStartRef.current) {
        commitCanvasCopy()
      }

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

    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', handleWindowMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove)
      window.removeEventListener('mouseup', handleWindowMouseUp)
    }
  }, [getTileCoords, commitCanvasCopy, handleCommit, handlePaint, handleRectangleFill, setIsPainting])

  return (
    <div
      className="flex-1 overflow-hidden flex items-center justify-center min-w-0 min-h-0 bg-[#1a1a1a]"
      onWheel={(e) => {
        const zoomSensitivity = (e.ctrlKey || e.metaKey) ? 0.005 : 0.001
        setZoom(prev => Math.min(Math.max(0.1, prev - e.deltaY * zoomSensitivity), 5))
      }}
      onMouseDown={(e) => {
        if (e.button === 1) {
          setIsPanning(true)
          setLastPanPos({ x: e.clientX, y: e.clientY })
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {activeMap ? (
        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center' }}>
          <div
            ref={mapRef}
            className="bg-card shadow-sm relative overflow-hidden"
            style={{
              width: activeMap.width * 32,
              height: activeMap.height * 32
            }}
            onMouseDown={(e) => {
              if (e.button === 1) return
              const coords = getTileCoords(e.clientX, e.clientY)
              if (!coords) return
              const { x, y } = coords

              if (e.button === 2) {
                setCanvasCopyStart({ x, y })
                setCanvasCopyCurrent({ x, y })
                return
              }

              if (activeTool === 'bucket') {
                handlePaintBucket(x, y)
                return
              }

              if (activeTool === 'rectangle') {
                setRectStart({ x, y })
                setRectCurrent({ x, y })
                if (paintMode === 'continuous' || paintMode === 'discontinuous') {
                  setPaintStartPos({ x, y })
                }
                return
              }

              setIsPainting(true)
              if (paintMode === 'continuous' || paintMode === 'discontinuous') {
                setPaintStartPos({ x, y })
              }
              handlePaint(x, y)
            }}
            onMouseLeave={() => {
              if (!isPainting && !rectStart && !canvasCopyStart) {
                setCanvasHover(null)
              }
            }}
          >
            <CanvasLayers layers={layers} tilesets={tilesets} activeMap={activeMap} />

            <CanvasEntities
              entities={entities}
              selectedEntityId={selectedEntityId}
              setSelectedEntityId={setSelectedEntityId || (() => {})}
              moveEntity={moveEntity || (() => {})}
              activeMap={activeMap}
              tilesets={tilesets}
            />

            <CanvasOverlays
              activeTool={activeTool}
              tileSelection={tileSelection}
              canvasHover={canvasHover}
              canvasCopyStart={canvasCopyStart}
              canvasCopyCurrent={canvasCopyCurrent}
              rectStart={rectStart}
              rectCurrent={rectCurrent}
            />
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground font-mono text-xs tracking-wider opacity-50">
          Select or create a map to start editing
        </div>
      )}

      {/* Debug Panel */}
      <div className={`absolute bottom-4 right-4 bg-black/80 text-green-400 rounded font-mono z-50 shadow-lg ring-1 ring-white/20 min-w-[250px] transition-all overflow-hidden ${debugExpanded ? 'p-4' : 'p-2'}`}>
        <div
          className="font-bold text-white uppercase tracking-wider flex items-center justify-between cursor-pointer"
          onClick={() => setDebugExpanded(!debugExpanded)}
        >
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-green-400" />
            <span className="text-xs">Debug Status</span>
          </div>
          <button className="hover:bg-white/10 p-1 rounded">
            {debugExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        </div>

        {debugExpanded && (
          <div className="flex flex-col gap-1 mt-2 border-t border-white/20 pt-2 text-xs pointer-events-none">
            <div>Tool: {activeTool}</div>
            <div>Selection: {tileSelection ? `${tileSelection.width}x${tileSelection.height} tiles` : 'NONE'}</div>
            <div>Active Layer ID: {activeLayerId || 'NONE'}</div>
            <div>Active Map: {activeMap ? `${activeMap.name} (${activeMap.width}x${activeMap.height})` : 'NONE'}</div>
            <div>isPainting: {isPainting ? 'TRUE' : 'FALSE'}</div>
            <div className="mt-2 text-yellow-400">Last Paint Result:</div>
            <div className="whitespace-pre-wrap">{debugInfo ? `${debugInfo.action.toUpperCase()} at [${debugInfo.x ?? '-'}, ${debugInfo.y ?? '-'}]\nReason: ${debugInfo.error}` : 'Waiting for input...'}</div>
          </div>
        )}
      </div>
    </div>
  )
}
