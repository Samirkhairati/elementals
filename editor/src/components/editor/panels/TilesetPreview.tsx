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
}: TilesetPreviewProps) {
  if (!activeTileset) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-muted-foreground font-mono">
        Select a tileset to preview
      </div>
    )
  }

  const commitSelection = () => {
    const box = getTilesetSelectionBox(tilesetSelectionStart, tilesetSelectionCurrent)
    if (box) {
      const tiles: (CopiedTile | null)[] = []
      for (let dy = 0; dy < box.height; dy++) {
        for (let dx = 0; dx < box.width; dx++) {
          tiles.push({
            tilesetId: activeTileset.fileName,
            x: box.minX + dx,
            y: box.minY + dy,
          })
        }
      }
      setTileSelection({ width: box.width, height: box.height, tiles })
      setTilesetSelectionStart(null)
      setTilesetSelectionCurrent(null)
    }
  }

  const box = getTilesetSelectionBox(tilesetSelectionStart, tilesetSelectionCurrent)

  return (
    <div className="relative inline-block border shadow-sm cursor-crosshair">
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
        className="relative z-10 block max-w-none"
        style={{ imageRendering: 'pixelated' }}
      />

      {tilesetDimensions && (
        <div className="absolute inset-0 z-20 pointer-events-none" style={{ backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.2) 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>
      )}

      <div
        className="absolute inset-0 z-30 select-none"
        onMouseDown={(e) => {
          if (e.button !== 0) return
          const x = Math.floor(e.nativeEvent.offsetX / 32)
          const y = Math.floor(e.nativeEvent.offsetY / 32)
          setTilesetSelectionStart({ x, y })
          setTilesetSelectionCurrent({ x, y })
        }}
        onMouseMove={(e) => {
          if (!tilesetDimensions) return
          const x = Math.floor(e.nativeEvent.offsetX / 32)
          const y = Math.floor(e.nativeEvent.offsetY / 32)
          setHoverTile({ x, y })
          if (tilesetSelectionStart) {
            setTilesetSelectionCurrent({ x, y })
          }
        }}
        onMouseUp={commitSelection}
        onMouseLeave={() => {
          setHoverTile(null)
          commitSelection()
        }}
      >
        {hoverTile && !tilesetSelectionStart && (
          <div className="absolute border border-yellow-400 bg-yellow-400/20 pointer-events-none" style={{ left: hoverTile.x * 32, top: hoverTile.y * 32, width: 32, height: 32 }}></div>
        )}
        {(() => {
          if (box) {
            return (
              <div className="absolute border-2 border-primary bg-primary/30 pointer-events-none" style={{ left: box.minX * 32, top: box.minY * 32, width: box.width * 32, height: box.height * 32 }}></div>
            )
          }
          if (tileSelection) {
            return tileSelection.tiles.map((t, i) => {
              if (!t || t.tilesetId !== activeTileset.fileName) return null
              return (
                <div key={i} className="absolute border border-primary bg-primary/30 pointer-events-none" style={{ left: t.x * 32, top: t.y * 32, width: 32, height: 32 }}></div>
              )
            })
          }
          return null
        })()}
      </div>
    </div>
  )
}
