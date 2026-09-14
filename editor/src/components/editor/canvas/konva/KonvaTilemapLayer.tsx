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
          perfectDrawEnabled={false}
          shadowForStrokeEnabled={false}
          sceneFunc={(context) => {
            const ctx = context._context as CanvasRenderingContext2D
            ctx.imageSmoothingEnabled = false

            const data = layer.data
            if (!data) return

            const mapWidth = activeMap.width

            for (const indexStr in data) {
              const tile = data[indexStr]
              if (!tile) continue

              const index = Number(indexStr)
              const x = (index % mapWidth) * 32
              const y = Math.floor(index / mapWidth) * 32

              if (tile.tilesetId === '__collision__') {
                ctx.fillStyle = 'rgba(239, 68, 68, 0.2)'
                ctx.fillRect(x, y, 32, 32)

                ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)'
                ctx.lineWidth = 1
                ctx.strokeRect(x + 0.5, y + 0.5, 31, 31)

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
