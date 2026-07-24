import { Layer, TilesetData, MapData } from '@/types/editor'

interface CanvasLayersProps {
  layers: Layer[]
  tilesets: TilesetData[]
  activeMap: MapData
}

export function CanvasLayers({ layers, tilesets, activeMap }: CanvasLayersProps) {
  return (
    <>
      {layers.slice().reverse().filter(l => l.visible).map(layer => (
        <div key={layer.id} className="absolute inset-0 pointer-events-none z-10">
          {Object.entries(layer.data || {}).map(([indexStr, tile]) => {
            const index = parseInt(indexStr)
            const x = index % activeMap.width
            const y = Math.floor(index / activeMap.width)
            const tileset = tilesets.find(t => t.fileName === tile.tilesetId)
            if (!tileset) return null

            return (
              <div
                key={index}
                className="absolute"
                style={{
                  left: x * 32,
                  top: y * 32,
                  width: 32,
                  height: 32,
                  backgroundImage: `url(${tileset.dataUrl})`,
                  backgroundPosition: `-${tile.x * 32}px -${tile.y * 32}px`,
                  imageRendering: 'pixelated'
                }}
              />
            )
          })}
        </div>
      ))}
    </>
  )
}
