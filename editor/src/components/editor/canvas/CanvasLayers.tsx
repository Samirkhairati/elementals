import { Layer, TilesetData, MapData } from '@/types/editor'

interface CanvasLayersProps {
  layers: Layer[]
  tilesets: TilesetData[]
  activeMap: MapData
}

export function CanvasLayers({ layers, tilesets, activeMap }: CanvasLayersProps) {
  return (
    <>
      {layers.slice().reverse().filter(l => l.visible).sort((a, b) => {
        const isSpecialA = ['collision', 'terrain', 'encounters'].includes(a.type)
        const isSpecialB = ['collision', 'terrain', 'encounters'].includes(b.type)
        if (isSpecialA && !isSpecialB) return 1
        if (!isSpecialA && isSpecialB) return -1
        return 0
      }).map(layer => (
        <div key={layer.id} className="absolute inset-0 pointer-events-none z-10">
          {Object.entries(layer.data || {}).map(([indexStr, tile]) => {
            const index = parseInt(indexStr)
            const x = index % activeMap.width
            const y = Math.floor(index / activeMap.width)
            
            if (tile.tilesetId === '__collision__') {
              return (
                <div
                  key={index}
                  className="absolute border border-red-500/50 bg-red-500/20 overflow-hidden"
                  style={{
                    left: x * 32,
                    top: y * 32,
                    width: 32,
                    height: 32,
                  }}
                >
                  <div className="absolute w-[50px] h-[2px] bg-red-500/50 origin-center left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45" />
                  <div className="absolute w-[50px] h-[2px] bg-red-500/50 origin-center left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45" />
                </div>
              )
            }

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
