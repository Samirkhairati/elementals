import { useState, useRef, useCallback } from 'react'
import { TilesetData, TileSelection, CopiedTile, Pos } from '@/types/editor'

interface TilesetPreviewProps {
  activeTileset: TilesetData | null
  tilesetDimensions: { width: number; height: number } | null
  setTilesetDimensions: (d: { width: number; height: number } | null) => void
  tileSelection: TileSelection | null
  setTileSelection: (s: TileSelection | null) => void
  tilesetSelectionStart: Pos | null
  setTilesetSelectionStart: (v: Pos | null) => void
  tilesetSelectionCurrent: Pos | null
  setTilesetSelectionCurrent: (v: Pos | null) => void
  hoverTile: Pos | null
  setHoverTile: (v: Pos | null) => void
  isDisabled?: boolean
  activeLayerType?: string | null
}

function getTilesetSelectionBox(start: Pos | null, current: Pos | null) {
  if (!start || !current) return null
  const minX = Math.min(start.x, current.x)
  const minY = Math.min(start.y, current.y)
  const maxX = Math.max(start.x, current.x)
  const maxY = Math.max(start.y, current.y)
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

export function TilesetPreview({
  activeTileset,
  tilesetDimensions,
  setTilesetDimensions,
  tileSelection,
  setTileSelection,
  tilesetSelectionStart,
  setTilesetSelectionStart,
  tilesetSelectionCurrent,
  setTilesetSelectionCurrent,
  hoverTile,
  setHoverTile,
  isDisabled,
  activeLayerType,
}: TilesetPreviewProps) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)

  const imageContainerRef = useRef<HTMLDivElement | null>(null)
  const dragStartRef = useRef<Pos | null>(null)

  const getClampedTileCoords = useCallback((clientX: number, clientY: number): Pos | null => {
    if (!imageContainerRef.current || !tilesetDimensions) return null
    const rect = imageContainerRef.current.getBoundingClientRect()
    const maxTilesX = Math.floor(tilesetDimensions.width / 32)
    const maxTilesY = Math.floor(tilesetDimensions.height / 32)
    if (maxTilesX <= 0 || maxTilesY <= 0) return null

    // Calculate position relative to container, scaled by zoom
    const currentZoom = zoom || 1
    const relX = (clientX - rect.left) / currentZoom
    const relY = (clientY - rect.top) / currentZoom

    const tileX = Math.max(0, Math.min(maxTilesX - 1, Math.floor(relX / 32)))
    const tileY = Math.max(0, Math.min(maxTilesY - 1, Math.floor(relY / 32)))

    return { x: tileX, y: tileY }
  }, [tilesetDimensions, zoom])

  const commitSelection = useCallback((endPos?: Pos) => {
    const start = dragStartRef.current || tilesetSelectionStart
    const current = endPos || tilesetSelectionCurrent || start
    const box = getTilesetSelectionBox(start, current)
    if (box && activeTileset && tilesetDimensions) {
      const maxTilesX = Math.floor(tilesetDimensions.width / 32)
      const maxTilesY = Math.floor(tilesetDimensions.height / 32)

      const minX = Math.max(0, Math.min(maxTilesX - 1, box.minX))
      const maxX = Math.max(0, Math.min(maxTilesX - 1, box.maxX))
      const minY = Math.max(0, Math.min(maxTilesY - 1, box.minY))
      const maxY = Math.max(0, Math.min(maxTilesY - 1, box.maxY))

      const width = maxX - minX + 1
      const height = maxY - minY + 1

      const tiles: (CopiedTile | null)[] = []
      for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) {
          tiles.push({
            tilesetId: activeTileset.fileName,
            x: minX + dx,
            y: minY + dy,
          })
        }
      }
      setTileSelection({ width, height, tiles })
      setTilesetSelectionStart(null)
      setTilesetSelectionCurrent(null)
      dragStartRef.current = null
    }
  }, [
    activeTileset,
    tilesetDimensions,
    tilesetSelectionStart,
    tilesetSelectionCurrent,
    setTileSelection,
    setTilesetSelectionStart,
    setTilesetSelectionCurrent,
  ])

  if (activeLayerType === 'collision') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center space-y-4">
        <div className="text-xs text-red-400 font-mono uppercase tracking-wider">Collision Block</div>
        <div 
          className="relative w-16 h-16 border-2 border-red-500 bg-red-500/20 overflow-hidden ring-4 ring-primary shadow-lg shadow-red-500/20 cursor-pointer hover:bg-red-500/30"
          onClick={() => {
            setTileSelection({ width: 1, height: 1, tiles: [{ tilesetId: '__collision__', x: 0, y: 0 }] })
          }}
        >
          <div className="absolute w-[100px] h-[3px] bg-red-500 origin-center left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45" />
          <div className="absolute w-[100px] h-[3px] bg-red-500 origin-center left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45" />
        </div>
      </div>
    )
  }

  if (isDisabled) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-xs text-muted-foreground font-mono space-y-2">
        <p>yet to implement</p>
      </div>
    )
  }

  if (!activeTileset) {
    return (
      <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground font-mono">
        Select a tileset to preview
      </div>
    )
  }

  const handleSelectionMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !activeTileset || !tilesetDimensions) return
    const coords = getClampedTileCoords(e.clientX, e.clientY)
    if (!coords) return

    dragStartRef.current = coords
    setTilesetSelectionStart(coords)
    setTilesetSelectionCurrent(coords)

    const handleWindowMouseMove = (moveEvent: MouseEvent) => {
      const moveCoords = getClampedTileCoords(moveEvent.clientX, moveEvent.clientY)
      if (moveCoords) {
        setTilesetSelectionCurrent(moveCoords)
        setHoverTile(moveCoords)
      }
    }

    const handleWindowMouseUp = (upEvent: MouseEvent) => {
      const endCoords = getClampedTileCoords(upEvent.clientX, upEvent.clientY)
      commitSelection(endCoords || undefined)
      window.removeEventListener('mousemove', handleWindowMouseMove)
      window.removeEventListener('mouseup', handleWindowMouseUp)
    }

    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', handleWindowMouseUp)
  }

  const box = getTilesetSelectionBox(tilesetSelectionStart, tilesetSelectionCurrent)

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
      const startX = e.clientX
      const startY = e.clientY
      let lastX = startX
      let lastY = startY

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
          ref={imageContainerRef}
          className="relative inline-block border shadow-sm cursor-crosshair select-none"
        >
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'linear-gradient(45deg, #808080 25%, transparent 25%), linear-gradient(-45deg, #808080 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #808080 75%), linear-gradient(-45deg, transparent 75%, #808080 75%)',
              backgroundSize: '10px 10px',
              backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px'
            }}
          ></div>
          <img
            src={activeTileset.dataUrl}
            onLoad={(e) => setTilesetDimensions({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
            alt={activeTileset.name}
            className="relative z-10 block max-w-none pointer-events-none select-none"
            style={{ imageRendering: 'pixelated' }}
            draggable={false}
          />

          {tilesetDimensions && (
            <div className="absolute inset-0 z-20 pointer-events-none" style={{ backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.2) 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>
          )}

          {/* Interactive Selection & Hover Layer */}
          <div
            className="absolute inset-0 z-30 select-none cursor-crosshair"
            onMouseDown={handleSelectionMouseDown}
            onMouseMove={(e) => {
              if (dragStartRef.current || tilesetSelectionStart) return
              const coords = getClampedTileCoords(e.clientX, e.clientY)
              setHoverTile(coords)
            }}
            onMouseLeave={() => {
              if (!dragStartRef.current && !tilesetSelectionStart) {
                setHoverTile(null)
              }
            }}
          >
            {hoverTile && !tilesetSelectionStart && (
              <div
                className="absolute border border-yellow-400 bg-yellow-400/20 pointer-events-none"
                style={{ left: hoverTile.x * 32, top: hoverTile.y * 32, width: 32, height: 32 }}
              />
            )}
            {(() => {
              if (box) {
                return (
                  <div
                    className="absolute border-2 border-primary bg-primary/30 pointer-events-none shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                    style={{ left: box.minX * 32, top: box.minY * 32, width: box.width * 32, height: box.height * 32 }}
                  />
                )
              }
              if (tileSelection) {
                return tileSelection.tiles.map((t, i) => {
                  if (!t || t.tilesetId !== activeTileset.fileName) return null
                  return (
                    <div
                      key={i}
                      className="absolute border border-primary bg-primary/30 pointer-events-none"
                      style={{ left: t.x * 32, top: t.y * 32, width: 32, height: 32 }}
                    />
                  )
                })
              }
              return null
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
