import React from 'react'

import { ActiveTool, PaintMode, MapData, Layer, TilesetData, TileSelection, DebugInfo, EntityData } from '@/types/editor'
import { MapCanvas } from '@/components/editor/canvas/MapCanvas'

interface CenterCanvasProps {
  activeTool: ActiveTool
  paintMode: PaintMode
  activeMap: MapData | null
  layers: Layer[]
  tilesets: TilesetData[]
  tileSelection: TileSelection | null
  setTileSelection: React.Dispatch<React.SetStateAction<TileSelection | null>>
  activeLayerId: string | null
  isPainting: boolean
  setIsPainting: (v: boolean) => void
  paintStartPos: { x: number; y: number } | null
  setPaintStartPos: (pos: { x: number; y: number } | null) => void
  debugInfo: DebugInfo | null
  handlePaint: (x: number, y: number) => void
  handlePaintBucket: (x: number, y: number) => void
  handleRectangleFill: (start: { x: number; y: number }, end: { x: number; y: number }) => void
  handleCommit: () => void
  entities?: EntityData[]
  selectedEntityId?: string | null
  setSelectedEntityId?: (id: string | null) => void
  moveEntity?: (id: string, x: number, y: number) => void
}

export function CenterCanvas({
  activeTool,
  paintMode,
  activeMap,
  layers,
  tilesets,
  tileSelection,
  setTileSelection,
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
  entities,
  selectedEntityId,
  setSelectedEntityId,
  moveEntity,
}: CenterCanvasProps) {
  return (
    <div className="flex-1 bg-muted/10 relative overflow-hidden flex flex-col min-w-0 min-h-0">
      <MapCanvas
        activeMap={activeMap}
        layers={layers}
        tilesets={tilesets}
        tileSelection={tileSelection}
        setTileSelection={setTileSelection}
        activeTool={activeTool}
        paintMode={paintMode}
        activeLayerId={activeLayerId}
        isPainting={isPainting}
        setIsPainting={setIsPainting}
        paintStartPos={paintStartPos}
        setPaintStartPos={setPaintStartPos}
        debugInfo={debugInfo}
        handlePaint={handlePaint}
        handlePaintBucket={handlePaintBucket}
        handleRectangleFill={handleRectangleFill}
        handleCommit={handleCommit}
        entities={entities}
        selectedEntityId={selectedEntityId}
        setSelectedEntityId={setSelectedEntityId}
        moveEntity={moveEntity}
      />
    </div>
  )
}

