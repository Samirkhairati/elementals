import React from 'react'
import { Shape, Group } from 'react-konva'
import { Layer as MapLayer, MapData } from '@/types/editor'

interface KonvaTilemapLayerProps {
  layers: MapLayer[]
  images: Record<string, HTMLImageElement>
  activeMap: MapData
}

export const KonvaTilemapLayer = React.memo(function KonvaTilemapLayer({
  layers,
  images,
  activeMap,
}: KonvaTilemapLayerProps) {
  // Render in reverse order so bottom layer renders first, matching DOM layers.slice().reverse()
  const visibleLayers = layers
    .slice()
    .reverse()
    .filter(l => l.visible)

  return (
    <Group listening={false}>
      {visibleLayers.map(layer => (
        <Shape
          key={layer.id}
          listening={false}
          sceneFunc={(context, shape) => {
            const ctx = context._context as CanvasRenderingContext2D
            ctx.imageSmoothingEnabled = false

            const tileEntries = Object.entries(layer.data || {})
            for (let i = 0; i < tileEntries.length; i++) {
              const [indexStr, tile] = tileEntries[i]
              const index = parseInt(indexStr)
              const x = (index % activeMap.width) * 32
              const y = Math.floor(index / activeMap.width) * 32

              if (tile.tilesetId === '__collision__') {
                // Collision fill
                ctx.fillStyle = 'rgba(239, 68, 68, 0.2)'
                ctx.fillRect(x, y, 32, 32)

                // Collision border
                ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)'
                ctx.lineWidth = 1
                ctx.strokeRect(x + 0.5, y + 0.5, 31, 31)

                // Collision diagonal cross
                ctx.beginPath()
                ctx.moveTo(x, y)
                ctx.lineTo(x + 32, y + 32)
                ctx.moveTo(x + 32, y)
                ctx.lineTo(x, y + 32)
                ctx.stroke()
                continue
              }

              const img = images[tile.tilesetId]
              if (img && img.complete && img.naturalWidth > 0) {
                ctx.drawImage(
                  img,
                  tile.x * 32,
                  tile.y * 32,
                  32,
                  32,
                  x,
                  y,
                  32,
                  32
                )
              }
            }
          }}
        />
      ))}
    </Group>
  )
})
