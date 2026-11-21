import { useRef, useCallback } from 'react'
import { usePanZoom } from '@/hooks/usePanZoom'
import { trackWindowDrag } from '@/lib/windowDrag'
import { getBoundingBox } from '../canvas/canvasUtils'
import { TilesetData, TileSelection, CopiedTile, Pos } from '@/types/editor'
import { TILE_SIZE } from '../../../../../shared/engine/constants'

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
  const { zoom, isPanning, transform, onWheel, onMouseDown } = usePanZoom()

  const imageContainerRef = useRef<HTMLDivElement | null>(null)
  const dragStartRef = useRef<Pos | null>(null)

  const getClampedTileCoords = useCallback((clientX: number, clientY: number): Pos | null => {
    if (!imageContainerRef.current || !tilesetDimensions) return null
    const rect = imageContainerRef.current.getBoundingClientRect()
    const maxTilesX = Math.floor(tilesetDimensions.width / TILE_SIZE)
    const maxTilesY = Math.floor(tilesetDimensions.height / TILE_SIZE)
    if (maxTilesX <= 0 || maxTilesY <= 0) return null

    // Calculate position relative to container, scaled by zoom
    const currentZoom = zoom || 1
    const relX = (clientX - rect.left) / currentZoom
    const relY = (clientY - rect.top) / currentZoom

    const tileX = Math.max(0, Math.min(maxTilesX - 1, Math.floor(relX / TILE_SIZE)))
    const tileY = Math.max(0, Math.min(maxTilesY - 1, Math.floor(relY / TILE_SIZE)))

    return { x: tileX, y: tileY }
  }, [tilesetDimensions, zoom])

  const commitSelection = useCallback((endPos?: Pos) => {
    const start = dragStartRef.current || tilesetSelectionStart
    const current = endPos || tilesetSelectionCurrent || start
    const box = getBoundingBox(start, current)
    if (box && activeTileset && tilesetDimensions) {
      const maxTilesX = Math.floor(tilesetDimensions.width / TILE_SIZE)
      const maxTilesY = Math.floor(tilesetDimensions.height / TILE_SIZE)

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

  if (activeLayerType === 'group' || activeLayerType === 'ySort') {
    return (
      <div className="ed-empty">
        <p>{activeLayerType === 'ySort' ? 'YSort' : 'Node'}: no tiles to paint</p>
        <p>Add a TileMap child to paint, or a Sprite (Add Child Node › Sprite in the Scene panel).</p>
      </div>
    )
  }

  if (activeLayerType === 'collision') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
        <div className="ed-section-title text-red-400">Collision Block</div>
        <div 
          className="relative w-16 h-16 border-2 border-red-500 bg-red-500/20 overflow-hidden ring-2 ring-primary cursor-pointer hover:bg-red-500/30"
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
      <div className="ed-empty">yet to implement</div>
    )
  }

  if (!activeTileset) {
    return (
      <div className="ed-empty">Select a tileset to preview</div>
    )
  }

  const handleSelectionMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !activeTileset || !tilesetDimensions) return
    const coords = getClampedTileCoords(e.clientX, e.clientY)
    if (!coords) return

    dragStartRef.current = coords
    setTilesetSelectionStart(coords)
    setTilesetSelectionCurrent(coords)

    trackWindowDrag({
      move: (moveEvent) => {
        const moveCoords = getClampedTileCoords(moveEvent.clientX, moveEvent.clientY)
        if (moveCoords) {
          setTilesetSelectionCurrent(moveCoords)
          setHoverTile(moveCoords)
        }
      },
      up: (upEvent) => commitSelection(getClampedTileCoords(upEvent.clientX, upEvent.clientY) || undefined),
    })
  }

  const box = getBoundingBox(tilesetSelectionStart, tilesetSelectionCurrent)

  return (
    <div
      className={`w-full h-full overflow-hidden flex items-center justify-center ${isPanning ? 'cursor-grabbing' : ''}`}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
    >
      <div style={{ transform, transformOrigin: 'center' }}>
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
            <div className="absolute inset-0 z-20 pointer-events-none" style={{ backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.2) 1px, transparent 1px)', backgroundSize: `${TILE_SIZE}px ${TILE_SIZE}px` }}></div>
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
                style={{ left: hoverTile.x * TILE_SIZE, top: hoverTile.y * TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE }}
              />
            )}
            {(() => {
              if (box) {
                return (
                  <div
                    className="absolute border-2 border-primary bg-primary/30 pointer-events-none shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                    style={{ left: box.minX * TILE_SIZE, top: box.minY * TILE_SIZE, width: box.width * TILE_SIZE, height: box.height * TILE_SIZE }}
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
                      style={{ left: t.x * TILE_SIZE, top: t.y * TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE }}
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
