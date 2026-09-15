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

  if (!tileSelection) {
    return <div className="text-xs text-muted-foreground text-center font-mono w-full h-full flex items-center justify-center">No tiles selected</div>
  }

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
    <div
      className={`w-full h-full overflow-hidden flex items-center justify-center ${isPanning ? 'cursor-grabbing' : ''}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
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
            if (t.tilesetId === '__collision__') {
              return (
                <div
                  key={i}
                  className="absolute border border-red-500/50 bg-red-500/20 overflow-hidden"
                  style={{
                    left: dx * 32,
                    top: dy * 32,
                    width: 32,
                    height: 32,
                  }}
                >
                  <div className="absolute w-[50px] h-[2px] bg-red-500/50 origin-center left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45" />
                  <div className="absolute w-[50px] h-[2px] bg-red-500/50 origin-center left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45" />
                </div>
              )
            }

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
