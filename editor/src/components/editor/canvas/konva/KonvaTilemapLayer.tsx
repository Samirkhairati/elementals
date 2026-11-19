import type { ImageDrag } from './imageDrag'
import React from 'react'
import { Shape, Group } from 'react-konva'
import type Konva from 'konva'
import type { MapData, ImageItem } from '@/types/editor'
import { isDataLayer, ownLook, shownCollisionCells, type DataLayerNode } from '../../../../../../shared/sceneTree'
import type { LookSet } from '../../../../../../shared/look/types'
import type { SpriteAssetInfo } from '../../../../../../shared/engine/types'
import { drawResolvedSprite, useSpriteImagesVersion } from '@/lib/spriteImages'
import type { DrawLayer } from '@/lib/sceneIndex'
import { resolveImageItem } from '@/lib/imageItems'
import { imagePickKey } from '@/lib/graphicAssets'
import { mapPixelSize } from '../../../../../../shared/mapSize'
import { useLookView, subjectKey, setCanvasViewRect, type LookViewState } from '@/lib/look/lookView'
import { useLookLibrary } from '@/lib/look/lookLibrary'
import { pictureStack, worldStack } from '@/lib/look/lookSubjects'
import { drawGradedArea, drawGradedPicture } from '@/lib/look/lookDraw'
import { pictureBox } from '@/lib/look/pictureBox'
import { drawLayerShadow, drawPictureShadow } from '@/lib/look/shadowDraw'
import { shadowFor } from '../../../../../../shared/look/shadow'

const NO_ASSETS: Record<string, SpriteAssetInfo> = {}

interface KonvaTilemapLayerProps {
  /** The layers to draw, bottom first (a run of the tree's draw order, hidden nodes already left out): layer nodes and runs of sprites. */
  layers: readonly DrawLayer[]
  images: Record<string, HTMLImageElement>
  activeMap: MapData
  spriteAssets?: Record<string, SpriteAssetInfo>
  /** The image being dragged and where the mouse has it right now; drawn there instead of at its saved position. */
  dragRef?: React.MutableRefObject<ImageDrag | null>
}

/** Looks to draw a picture with: the Node it sits in and the look it passes down, the map size and the profile in view (absent = drawn plainly). */
export interface PictureLookContext {
  layer: { id: string; look?: LookSet }
  mapSize: { w: number; h: number }
  view: LookViewState
}

/** One placed picture on the canvas: the dragged picture at the mouse, and the rest of a dragged group moved along with it. */
export function drawImageItem(ctx: CanvasRenderingContext2D, item: ImageItem, spriteAssets: Record<string, SpriteAssetInfo>, drag: ImageDrag | null, looks?: PictureLookContext) {
  const resolved = resolveImageItem(drag && drag.id === item.id && drag.scale !== undefined ? { ...item, scale: drag.scale } : item, spriteAssets)
  if (!resolved) return
  const at = drag && drag.id === item.id ? drag : drag?.along?.ids.includes(item.id) ? { x: item.x + drag.along.dx, y: item.y + drag.along.dy } : item
  if (looks && looks.view.enabled) {
    const own = ownLook(item)
    const shadow = shadowFor([own, looks.layer.look], looks.view.profile)
    const { src } = resolved
    const { box, mirrorX, mirrorY } = pictureBox(item, resolved, at)
    if (shadow) drawPictureShadow(ctx, shadow, { img: resolved.img, src, box, mirrorX, mirrorY, opacity: item.opacity })
    const stack = pictureStack({ look: own }, looks.layer, looks.view.profile)
    if (stack.length > 0) {
      const key = `${imagePickKey(item)}@${src.x},${src.y},${src.w},${src.h}`
      const subject = subjectKey({ kind: 'picture', layerId: looks.layer.id, imageId: item.id })
      if (drawGradedPicture(ctx, { img: resolved.img, src, box, mirrorX, mirrorY, opacity: item.opacity, key }, stack, subject, looks.mapSize)) return
    }
  }
  drawResolvedSprite(ctx, resolved, {
    anchorX: at.x,
    anchorY: at.y,
    opacity: item.opacity,
    mirrorX: !!item.flipX,
    mirrorY: !!item.flipY,
  })
}

/** The tiles of a tile layer between two tile columns / rows (inclusive). */
function drawTiles(ctx: CanvasRenderingContext2D, data: NonNullable<DataLayerNode['data']>, images: Record<string, HTMLImageElement>, mapWidth: number, x0: number, y0: number, x1: number, y1: number) {
  for (let ty = y0; ty <= y1; ty++) {
    const rowOffset = ty * mapWidth
    const y = ty * 32
    for (let tx = x0; tx <= x1; tx++) {
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
        ctx.drawImage(img, tile.x * 32, tile.y * 32, 32, 32, x, y, 32, 32)
      }
    }
  }
}

/** The part of the map the stage shows, in map pixels. */
export function stageViewRect(stage: Konva.Stage | null): { x: number; y: number; w: number; h: number } | null {
  if (!stage) return null
  const scale = stage.scaleX() || 1
  return { x: -stage.x() / scale, y: -stage.y() / scale, w: stage.width() / scale, h: stage.height() / scale }
}

// The same layer: the same node and look, or the same host, look and sprites.
function sameLayer(a: DrawLayer, b: DrawLayer): boolean {
  if (a.kind === 'layer') return b.kind === 'layer' && a.node === b.node && a.look === b.look
  return b.kind === 'sprites' && a.host === b.host && a.look === b.look && a.pictures.length === b.pictures.length && a.pictures.every((p, i) => p === b.pictures[i])
}

/** Same layers in the same order: the tree handed out a new plan but nothing in this run changed. */
const sameLayers = (a: KonvaTilemapLayerProps, b: KonvaTilemapLayerProps) =>
  a.images === b.images && a.activeMap === b.activeMap && a.spriteAssets === b.spriteAssets && a.dragRef === b.dragRef && a.layers.length === b.layers.length && a.layers.every((l, i) => sameLayer(l, b.layers[i]))

export const KonvaTilemapLayer = React.memo(function KonvaTilemapLayer({
  layers,
  images,
  activeMap,
  spriteAssets = NO_ASSETS,
  dragRef,
}: KonvaTilemapLayerProps) {
  // Redraw image layers once a sprite sheet they use finishes loading.
  const imagesVersion = useSpriteImagesVersion()
  // Looks: the profile in view, on / off, the mask being edited; the shaders of the library.
  const view = useLookView()
  // (the library is read while drawing; subscribing redraws when its shaders change)
  useLookLibrary()
  const px = mapPixelSize(activeMap)
  const mapSize = { w: px.width, h: px.height }

  return (
    <Group listening={false}>
      {layers.map((entry) => entry.kind === 'sprites' ? (
        <Shape
          key={`${entry.key}:${imagesVersion}`}
          listening={false}
          perfectDrawEnabled={false}
          shadowForStrokeEnabled={false}
          sceneFunc={(context) => {
            const ctx = context._context as CanvasRenderingContext2D
            const looks = { layer: { id: entry.host.id, look: entry.look }, mapSize, view }
            for (const item of entry.pictures) {
              drawImageItem(ctx, item, spriteAssets, dragRef?.current ?? null, looks)
            }
          }}
        />
      ) : (
        <Shape
          key={entry.key}
          listening={false}
          perfectDrawEnabled={false}
          shadowForStrokeEnabled={false}
          sceneFunc={(context, shape) => {
            const ctx = context._context as CanvasRenderingContext2D
            ctx.imageSmoothingEnabled = false
            const layer = entry.node
            const look = entry.look

            if (!isDataLayer(layer)) return
            const data = layer.type === 'collision' ? shownCollisionCells(layer) : layer.data
            if (!data) return

            const mapWidth = activeMap.width
            const mapHeight = activeMap.height

            // Calculate visible tile bounds to cull offscreen draw calls
            const stage = shape.getStage()
            const rect = stageViewRect(stage)
            setCanvasViewRect(rect)
            let minTileX = 0
            let maxTileX = mapWidth - 1
            let minTileY = 0
            let maxTileY = mapHeight - 1

            if (rect) {
              minTileX = Math.max(0, Math.floor(rect.x / 32) - 1)
              minTileY = Math.max(0, Math.floor(rect.y / 32) - 1)
              maxTileX = Math.min(mapWidth - 1, Math.ceil((rect.x + rect.w) / 32) + 1)
              maxTileY = Math.min(mapHeight - 1, Math.ceil((rect.y + rect.h) / 32) + 1)
            }
            if (maxTileX < minTileX || maxTileY < minTileY) return

            // Its drop shadow first, under the tiles.
            const shadow = view.enabled && layer.type === 'tile' ? shadowFor([look], view.profile) : null
            if (shadow) drawLayerShadow(ctx, shadow, { layerId: layer.id, data, tilesets: images, mapW: mapWidth, mapH: mapHeight, view: rect ?? { x: 0, y: 0, w: mapSize.w, h: mapSize.h } })

            // A layer with a look: the visible tiles are drawn offscreen, graded with the game's shader, drawn back.
            if (view.enabled && layer.type === 'tile' && look) {
              const stack = worldStack(look, view.profile)
              const area = { x: minTileX * 32, y: minTileY * 32, w: (maxTileX - minTileX + 1) * 32, h: (maxTileY - minTileY + 1) * 32 }
              const subject = subjectKey({ kind: 'layer', layerId: layer.id })
              const frame = rect ?? { x: 0, y: 0, w: mapSize.w, h: mapSize.h }
              if (drawGradedArea(ctx, area, stack, subject, mapSize, frame, (c) => drawTiles(c, data, images, mapWidth, minTileX, minTileY, maxTileX, maxTileY))) return
            }

            drawTiles(ctx, data, images, mapWidth, minTileX, minTileY, maxTileX, maxTileY)
          }}
        />
      ))}
    </Group>
  )
}, sameLayers)
