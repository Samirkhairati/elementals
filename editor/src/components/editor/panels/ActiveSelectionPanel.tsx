import { useState } from 'react'
import { Pin, PinOff } from 'lucide-react'
import { CopiedTile, TileSelection, TilesetData } from '@/types/editor'
import { IconButton } from '../ui/controls'

interface ActiveSelectionPanelProps {
  tileSelection: TileSelection | null
  tilesets: TilesetData[]
  /** Pinned: a right-drag on the map samples every selected layer and painting writes back to all of them. */
  pinned?: boolean
  onTogglePin?: () => void
}

const PIN_TIP =
  'Pin the selection: right-drag samples every selected layer (Ctrl/Cmd+click layers to pick several; image layers are skipped) and painting puts each layer\'s tiles back on its own layer.'
const UNPIN_TIP = 'Unpin: right-drag samples only the active layer again.'

const CELL = 32

/** One cell: the tile from its tileset, or the red collision marker. Layers overlap by being drawn in order. */
function SelectionCell({ tile, dx, dy, tilesets }: { tile: CopiedTile; dx: number; dy: number; tilesets: TilesetData[] }) {
  if (tile.tilesetId === '__collision__') {
    return (
      <div
        className="absolute border border-red-500/50 bg-red-500/20 overflow-hidden"
        style={{ left: dx * CELL, top: dy * CELL, width: CELL, height: CELL }}
      >
        <div className="absolute w-[50px] h-[2px] bg-red-500/50 origin-center left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45" />
        <div className="absolute w-[50px] h-[2px] bg-red-500/50 origin-center left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45" />
      </div>
    )
  }
  const tileset = tilesets.find((ts) => ts.fileName === tile.tilesetId)
  if (!tileset) return null
  return (
    <div
      className="absolute"
      style={{
        left: dx * CELL,
        top: dy * CELL,
        width: CELL,
        height: CELL,
        backgroundImage: `url(${tileset.dataUrl})`,
        backgroundPosition: `-${tile.x * CELL}px -${tile.y * CELL}px`,
        imageRendering: 'pixelated',
      }}
    />
  )
}

export function ActiveSelectionPanel({ tileSelection, tilesets, pinned = false, onTogglePin }: ActiveSelectionPanelProps) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)

  const header = (
    <div className="flex h-row shrink-0 items-center gap-1 border-b border-border/60 px-2" data-testid="selection-header">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        {tileSelection?.layers && tileSelection.layers.length > 1 ? (
          tileSelection.layers.map((part) => (
            <span key={part.layerId} className="ed-badge" title={`Sampled from ${part.name}`} data-testid="selection-part">
              {part.name}
            </span>
          ))
        ) : (
          <span className="ed-hint truncate">{pinned ? 'Pinned: Ctrl/Cmd+click layers, then right-drag' : 'Right-drag on the map to select'}</span>
        )}
      </div>
      <IconButton
        title={pinned ? UNPIN_TIP : PIN_TIP}
        aria-label={pinned ? 'Unpin selection' : 'Pin selection'}
        aria-pressed={pinned}
        active={pinned}
        onClick={onTogglePin}
      >
        {pinned ? <Pin /> : <PinOff />}
      </IconButton>
    </div>
  )

  if (!tileSelection) {
    return (
      <>
        {header}
        <div className="ed-empty">No tiles selected</div>
      </>
    )
  }

  // Layers overlap in the preview the way they do on the map: the bottom layer first, the top one last.
  const overlap = tileSelection.layers && tileSelection.layers.length > 1 ? tileSelection.layers.slice().reverse().map((part) => part.tiles) : [tileSelection.tiles]

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      const zoomSensitivity = 0.003
      setZoom(prev => Math.min(Math.max(0.1, prev * Math.exp(-e.deltaY * zoomSensitivity)), 5))
    } else {
      setPan(prev => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }))
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1) {
      setIsPanning(true)
      let lastX = e.clientX
      let lastY = e.clientY

      const handleGlobalMouseMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - lastX
        const dy = moveEvent.clientY - lastY
        lastX = moveEvent.clientX
        lastY = moveEvent.clientY
        setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }))
      }

      const handleGlobalMouseUp = (upEvent: MouseEvent) => {
        if (upEvent.button === 1) {
          setIsPanning(false)
          window.removeEventListener('mousemove', handleGlobalMouseMove)
          window.removeEventListener('mouseup', handleGlobalMouseUp)
        }
      }

      window.addEventListener('mousemove', handleGlobalMouseMove)
      window.addEventListener('mouseup', handleGlobalMouseUp)
    }
  }

  return (
    <>
      {header}
      <div
        className={`min-h-0 w-full flex-1 overflow-hidden flex items-center justify-center ${isPanning ? 'cursor-grabbing' : ''}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
      >
        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center' }}>
          <div
            className="relative border shadow-sm"
            data-testid="selection-preview"
            style={{
              width: tileSelection.width * CELL,
              height: tileSelection.height * CELL,
              backgroundImage: 'linear-gradient(45deg, #808080 25%, transparent 25%), linear-gradient(-45deg, #808080 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #808080 75%), linear-gradient(-45deg, transparent 75%, #808080 75%)',
              backgroundSize: '10px 10px',
              backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px',
            }}
          >
            {overlap.map((tiles, layerIndex) =>
              tiles.map((t, i) =>
                t ? (
                  <SelectionCell
                    key={`${layerIndex}:${i}`}
                    tile={t}
                    dx={i % tileSelection.width}
                    dy={Math.floor(i / tileSelection.width)}
                    tilesets={tilesets}
                  />
                ) : null
              )
            )}
            <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.2) 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>
          </div>
        </div>
      </div>
    </>
  )
}
