import React, { useState, useCallback } from 'react'
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
  ComponentType,
} from '@/types/editor'
import { useTilesetImages } from '@/hooks/editor/useTilesetImages'
import { useCanvasViewport } from '@/hooks/editor/canvas/useCanvasViewport'
import { useCanvasInteraction } from '@/hooks/editor/canvas/useCanvasInteraction'
import { KonvaTilemapLayer } from './konva/KonvaTilemapLayer'
import { KonvaOverlays } from './konva/KonvaOverlays'
import { KonvaEntities } from './konva/KonvaEntities'
import { KonvaGhostEntity } from './konva/KonvaGhostEntity'
import { CanvasContextMenu } from './CanvasContextMenu'
import { DebugStatusBadge } from './DebugStatusBadge'
import { PendingEntityPlacement } from '@/hooks/editor/useEntityPlacement'

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
  showGrid?: boolean
  snapToGrid?: boolean
  snapEntityPos?: (rawX: number, rawY: number) => { x: number; y: number }
  pendingPlacement?: PendingEntityPlacement | null
  commitPlacement?: (x: number, y: number) => void
  cancelPlacement?: () => void
  createEntity?: (name: string, x?: number, y?: number, initialComponents?: any) => void
  duplicateEntity?: (id: string) => void
  deleteEntity?: (id: string) => void
  updateComponentProp?: (entityId: string, type: ComponentType, key: string, value: any) => void
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
  showGrid = true,
  snapToGrid = true,
  snapEntityPos = (x, y) => ({ x: Math.floor(x / 32) * 32 + 16, y: Math.floor((y - 16) / 32 + 1) * 32 }),
  pendingPlacement = null,
  commitPlacement,
  cancelPlacement,
  createEntity,
  duplicateEntity,
  deleteEntity,
  updateComponentProp,
}: MapCanvasProps) {
  // Preload and cache tileset image textures
  const images = useTilesetImages(tilesets)

  const [resizingColliderEntityId, setResizingColliderEntityId] = useState<string | null>(null)

  // Viewport, zoom, pan, and stage coordinate translation
  const {
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
  } = useCanvasViewport({ activeMap })

  // Tools, painting, eraser, bucket, rectangle fill, copy/sampler, placement, context menu
  const {
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
    isZoomingRef,
    startPan,
    movePan,
    endPan,
    stageRef,
    pendingPlacement,
    commitPlacement,
    cancelPlacement,
    snapToGrid,
    snapEntityPos,
    resizingColliderEntityId,
    setResizingColliderEntityId,
  })

  const handleUpdateCollider = useCallback(
    (entityId: string, width: number, height: number, offsetX: number, offsetY: number) => {
      updateComponentProp?.(entityId, 'Collider', 'width', width)
      updateComponentProp?.(entityId, 'Collider', 'height', height)
      updateComponentProp?.(entityId, 'Collider', 'offsetX', offsetX)
      updateComponentProp?.(entityId, 'Collider', 'offsetY', offsetY)
    },
    [updateComponentProp]
  )

  const mapWidthPx = activeMap ? activeMap.width * 32 : 0
  const mapHeightPx = activeMap ? activeMap.height * 32 : 0

  return (
    <CanvasContextMenu
      target={contextMenuTarget}
      onCreateEntity={(name, x, y, comps) => createEntity?.(name, x, y, comps)}
      onDuplicateEntity={duplicateEntity}
      onDeleteEntity={deleteEntity}
      onStartResizeCollider={(id) => setResizingColliderEntityId(id)}
    >
      <div
        ref={containerRef}
        className={`flex-1 overflow-hidden relative min-w-0 min-h-0 bg-[#1a1a1a] ${
          isPanning ? 'cursor-grabbing' : isSpaceDown ? 'cursor-grab' : pendingPlacement ? 'cursor-crosshair' : ''
        }`}
      >
        {activeMap ? (
          <Stage
            ref={stageRef}
            width={dimensions.width || 1}
            height={dimensions.height || 1}
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
                showGrid={showGrid}
              />

              {/* Draggable interactive entities */}
              <KonvaEntities
                entities={entities}
                selectedEntityId={selectedEntityId}
                setSelectedEntityId={setSelectedEntityId || (() => {})}
                moveEntity={moveEntity || (() => {})}
                activeMap={activeMap}
                images={images}
                snapToGrid={snapToGrid}
                snapEntityPos={snapEntityPos}
                resizingColliderEntityId={resizingColliderEntityId}
                setResizingColliderEntityId={setResizingColliderEntityId}
                onUpdateCollider={handleUpdateCollider}
                onContextMenuEntity={(entity) => {
                  setContextMenuTarget({ type: 'entity', entity })
                }}
              />

              {/* Ghost entity preview during placement mode */}
              <KonvaGhostEntity
                pendingPlacement={pendingPlacement}
                pointerPos={stagePointerPos}
                snapToGrid={snapToGrid}
                snapEntityPos={snapEntityPos}
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
    </CanvasContextMenu>
  )
}
