import { useState } from 'react'
import { TileSelection, TilesetData } from '@/types/editor'

interface ActiveSelectionPanelProps {
  tileSelection: TileSelection | null
  tilesets: TilesetData[]
}

export function ActiveSelectionPanel({ tileSelection, tilesets }: ActiveSelectionPanelProps) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPos, setLastPanPos] = useState({ x: 0, y: 0 })

  if (!tileSelection) {
    return <div className="text-xs text-muted-foreground text-center font-mono w-full h-full flex items-center justify-center">No tiles selected</div>
  }

  return (
    <div
      className="w-full h-full overflow-hidden flex items-center justify-center"
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
      onMouseMove={(e) => {
        if (isPanning) {
          setPan(prev => ({
            x: prev.x + (e.clientX - lastPanPos.x),
            y: prev.y + (e.clientY - lastPanPos.y)
          }))
          setLastPanPos({ x: e.clientX, y: e.clientY })
        }
      }}
      onMouseUp={(e) => {
        if (e.button === 1) setIsPanning(false)
      }}
      onMouseLeave={() => setIsPanning(false)}
    >
      <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center' }}>
        <div
          className="relative border shadow-sm"
          style={{
            width: tileSelection.width * 32,
            height: tileSelection.height * 32,
            backgroundImage: 'linear-gradient(45deg, #808080 25%, transparent 25%), linear-gradient(-45deg, #808080 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #808080 75%), linear-gradient(-45deg, transparent 75%, #808080 75%)',
            backgroundSize: '10px 10px',
            backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px'
          }}
        >
          {tileSelection.tiles.map((t, i) => {
            if (!t) return null
            const dx = i % tileSelection.width
            const dy = Math.floor(i / tileSelection.width)
            const tileset = tilesets.find(ts => ts.fileName === t.tilesetId)
            if (!tileset) return null
            return (
              <div
                key={i}
                className="absolute"
                style={{
                  left: dx * 32,
                  top: dy * 32,
                  width: 32,
                  height: 32,
                  backgroundImage: `url(${tileset.dataUrl})`,
                  backgroundPosition: `-${t.x * 32}px -${t.y * 32}px`,
                  imageRendering: 'pixelated'
                }}
              />
            )
          })}
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.2) 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>
        </div>
      </div>
    </div>
  )
}
