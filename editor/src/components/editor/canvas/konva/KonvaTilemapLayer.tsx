import type { ImageDrag } from './imageDrag'
import React from 'react'
import { Shape, Group } from 'react-konva'
import { Layer as MapLayer, MapData } from '@/types/editor'
import type { SpriteAssetInfo } from '../../../../../../shared/engine/types'
import { drawResolvedSprite, useSpriteImagesVersion } from '@/lib/spriteImages'
import { renderOrder, sortedImages } from '@/lib/layerOrder'
import { resolveImageItem } from '@/lib/imageItems'

const NO_ASSETS: Record<string, SpriteAssetInfo> = {}

interface KonvaTilemapLayerProps {
  layers: MapLayer[]
  images: Record<string, HTMLImageElement>
  activeMap: MapData
  spriteAssets?: Record<string, SpriteAssetInfo>
  /** The image being dragged and where the mouse has it right now; drawn there instead of at its saved position. */
  dragRef?: React.MutableRefObject<ImageDrag | null>
}

export const KonvaTilemapLayer = React.memo(function KonvaTilemapLayer({
  layers,
  images,
  activeMap,
  spriteAssets = NO_ASSETS,
  dragRef,
}: KonvaTilemapLayerProps) {
  // Redraw image layers once a sprite sheet they use finishes loading.
  const imagesVersion = useSpriteImagesVersion()

  // Bottom layer of the list first: what the layer list shows is what draws.
  const visibleLayers = renderOrder(layers).filter(l => l.visible)

  return (
    <Group listening={false}>
      {visibleLayers.map(layer => layer.type === 'image' ? (
        <Shape
          key={`${layer.id}:${imagesVersion}`}
          listening={false}
          perfectDrawEnabled={false}
          shadowForStrokeEnabled={false}
          sceneFunc={(context) => {
            const ctx = context._context as CanvasRenderingContext2D
            for (const item of sortedImages(layer.images)) {
              const drag = dragRef?.current
              const resolved = resolveImageItem(drag && drag.id === item.id && drag.scale !== undefined ? { ...item, scale: drag.scale } : item, spriteAssets)
              if (!resolved) continue
              // The dragged picture is at the mouse, and the rest of a dragged group moves by the same amount.
              const at = drag && drag.id === item.id ? drag : drag?.along?.ids.includes(item.id) ? { x: item.x + drag.along.dx, y: item.y + drag.along.dy } : item
              drawResolvedSprite(ctx, resolved, {
                anchorX: at.x,
                anchorY: at.y,
                opacity: item.opacity,
                mirrorX: !!item.flipX,
                mirrorY: !!item.flipY,
              })
            }
          }}
        />
      ) : (
        <Shape
          key={layer.id}
          listening={false}
          perfectDrawEnabled={false}
          shadowForStrokeEnabled={false}
          sceneFunc={(context, shape) => {
            const ctx = context._context as CanvasRenderingContext2D
            ctx.imageSmoothingEnabled = false

            const data = layer.data
            if (!data) return

            const mapWidth = activeMap.width
            const mapHeight = activeMap.height

            // Calculate visible tile bounds to cull offscreen draw calls
            const stage = shape.getStage()
            let minTileX = 0
            let maxTileX = mapWidth - 1
            let minTileY = 0
            let maxTileY = mapHeight - 1

            if (stage) {
              const scale = stage.scaleX() || 1
              const stageX = stage.x()
              const stageY = stage.y()
              const viewW = stage.width()
              const viewH = stage.height()

              minTileX = Math.max(0, Math.floor((-stageX / scale) / 32) - 1)
              minTileY = Math.max(0, Math.floor((-stageY / scale) / 32) - 1)
              maxTileX = Math.min(mapWidth - 1, Math.ceil(((-stageX + viewW) / scale) / 32) + 1)
              maxTileY = Math.min(mapHeight - 1, Math.ceil(((-stageY + viewH) / scale) / 32) + 1)
            }

            // Iterate only visible rows and columns
            for (let ty = minTileY; ty <= maxTileY; ty++) {
              const rowOffset = ty * mapWidth
              const y = ty * 32
              for (let tx = minTileX; tx <= maxTileX; tx++) {
                const tile = data[rowOffset + tx]
                if (!tile) continue
                const x = tx * 32

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
            }
          }}
        />
      ))}
    </Group>
  )
})
