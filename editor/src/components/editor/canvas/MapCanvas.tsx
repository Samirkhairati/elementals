import React from 'react'
import { Stage, Layer as KonvaLayer, Rect } from 'react-konva'
import {
  Layer,
  TilesetData,
  MapData,
  TileSelection,
  ActiveTool,
  PaintMode,
  DebugInfo,
  Pos,
  EntityData,
} from '@/types/editor'
import { useTilesetImages } from '@/hooks/editor/useTilesetImages'
import { useCanvasViewport } from '@/hooks/editor/canvas/useCanvasViewport'
import { useCanvasInteraction } from '@/hooks/editor/canvas/useCanvasInteraction'
import { KonvaTilemapLayer } from './konva/KonvaTilemapLayer'
import { KonvaOverlays } from './konva/KonvaOverlays'
import { KonvaEntities } from './konva/KonvaEntities'
import { DebugStatusBadge } from './DebugStatusBadge'

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
  paintStartPos: _paintStartPos,
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
  // Preload and cache tileset image textures
  const images = useTilesetImages(tilesets)

  // Viewport, zoom, pan, and stage coordinate translation
  const {
    containerRef,
    stageRef,
    dimensions,
    isPanningRef,
    handleWheel,
    startPan,
    movePan,
    endPan,
    getTileCoordsFromPointer,
  } = useCanvasViewport({ activeMap })

  // Tools, painting, eraser, bucket, rectangle fill, copy/sampler
  const {
    canvasHover,
    canvasCopyStart,
    canvasCopyCurrent,
    rectStart,
    rectCurrent,
    handleStageMouseDown,
    handleStageMouseMove,
  } = useCanvasInteraction({
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
  })

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
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
        >
          <KonvaLayer>
            {/* Map background */}
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

            {/* Tilemap layer rendering */}
            <KonvaTilemapLayer
              layers={layers}
              images={images}
              activeMap={activeMap}
            />

            {/* Grid and tool previews */}
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

            {/* Draggable interactive entities */}
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

      {/* Floating debug status overlay */}
      <DebugStatusBadge
        activeTool={activeTool}
        tileSelection={tileSelection}
        activeLayerId={activeLayerId}
        activeMap={activeMap}
        isPainting={isPainting}
        debugInfo={debugInfo}
      />
    </div>
  )
}
