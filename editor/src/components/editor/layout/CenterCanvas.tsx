import React from 'react'

import { ActiveTool, PaintMode, MapData, Layer, TilesetData, TileSelection, DebugInfo } from '@/types/editor'
import { Toolbar } from '@/components/editor/canvas/Toolbar'
import { MapCanvas } from '@/components/editor/canvas/MapCanvas'

interface CenterCanvasProps {
  historyIndex: number
  historyLength: number
  activeTool: ActiveTool
  paintMode: PaintMode
  handleUndo: () => void
  handleRedo: () => void
  setActiveTool: (tool: ActiveTool) => void
  setPaintMode: (mode: PaintMode) => void
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
}

export function CenterCanvas({
  historyIndex,
  historyLength,
  activeTool,
  paintMode,
  handleUndo,
  handleRedo,
  setActiveTool,
  setPaintMode,
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
  handleCommit
}: CenterCanvasProps) {
  return (
      <div className="flex-1 bg-muted/10 relative overflow-hidden flex flex-col min-w-0 min-h-0">
        <Toolbar
          historyIndex={historyIndex}
          historyLength={historyLength}
          activeTool={activeTool}
          paintMode={paintMode}
          handleUndo={handleUndo}
          handleRedo={handleRedo}
          setActiveTool={setActiveTool}
          setPaintMode={setPaintMode}
        />
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
        />
      </div>
  )
}
