import React, { useMemo } from 'react'
import { Group, Rect, Shape } from 'react-konva'
import type { ImageItem, Layer } from '@/types/editor'
import type { SpriteAssetInfo } from '../../../../../../shared/engine/types'
import { drawResolvedSprite, useSpriteImagesVersion } from '@/lib/spriteImages'
import { itemBounds, resolveImageItem } from '@/lib/imageItems'
import { sortedImages } from '@/lib/layerOrder'
import type { ImagePick } from '@/lib/graphicAssets'
import { setStageCursor } from '../canvasUtils'

const NO_ASSETS: Record<string, SpriteAssetInfo> = {}

interface KonvaImageItemsProps {
  /** The active image layer: only its images can be picked and dragged. */
  layer: Layer | null
  mapWidthPx: number
  mapHeightPx: number
  selectedImageId: string | null
  setSelectedImageId: (id: string | null) => void
  moveImage: (layerId: string, imageId: string, x: number, y: number) => void
  snapToGrid: boolean
  snapEntityPos: (rawX: number, rawY: number) => { x: number; y: number }
  spriteAssets?: Record<string, SpriteAssetInfo>
  /** While an image waits to be placed the items stay out of the way so a click lands on the map. */
  placing?: boolean
  /** Written while an image is dragged so the layer that draws it can follow the mouse (see KonvaTilemapLayer). */
  dragRef?: React.MutableRefObject<{ id: string; x: number; y: number } | null>
}

/** Pick/drag handles and the selection frame for the images of the active image layer. */
export const KonvaImageItems = React.memo(function KonvaImageItems({
  layer,
  mapWidthPx,
  mapHeightPx,
  selectedImageId,
  setSelectedImageId,
  moveImage,
  snapToGrid,
  snapEntityPos,
  spriteAssets = NO_ASSETS,
  placing = false,
  dragRef,
}: KonvaImageItemsProps) {
  const items = useMemo(() => sortedImages(layer?.images), [layer?.images])
  if (!layer || layer.type !== 'image' || !layer.visible) return null

  const interactive = !layer.locked && !placing

  const place = (x: number, y: number) => {
    const bx = Math.max(0, Math.min(mapWidthPx, x))
    const by = Math.max(0, Math.min(mapHeightPx, y))
    return snapToGrid ? snapEntityPos(bx, by) : { x: Math.round(bx), y: Math.round(by) }
  }

  return (
    <Group>
      {items.map((item) => (
        <ImageHandle
          key={item.id}
          item={item}
          layerId={layer.id}
          assets={spriteAssets}
          selected={item.id === selectedImageId}
          interactive={interactive}
          place={place}
          setSelectedImageId={setSelectedImageId}
          moveImage={moveImage}
          dragRef={dragRef}
        />
      ))}
    </Group>
  )
})

function ImageHandle({
  item,
  layerId,
  assets,
  selected,
  interactive,
  place,
  setSelectedImageId,
  moveImage,
  dragRef,
}: {
  item: ImageItem
  layerId: string
  assets: Record<string, SpriteAssetInfo>
  selected: boolean
  interactive: boolean
  place: (x: number, y: number) => { x: number; y: number }
  setSelectedImageId: (id: string | null) => void
  moveImage: (layerId: string, imageId: string, x: number, y: number) => void
  dragRef?: React.MutableRefObject<{ id: string; x: number; y: number } | null>
}) {
  // Without the picture (deleted or still loading) itemBounds falls back to a tile-sized box so the item can still be picked.
  const unflipped = itemBounds(item, assets)
  // Flipping mirrors the frame around the anchor.
  const bounds = {
    ...unflipped,
    x: item.flipX ? -(unflipped.x + unflipped.w) : unflipped.x,
    y: item.flipY ? -(unflipped.y + unflipped.h) : unflipped.y,
  }

  return (
    <Group
      x={item.x}
      y={item.y}
      listening={interactive}
      draggable={interactive}
      onMouseDown={(e) => {
        if (e.evt.button === 0) {
          e.cancelBubble = true
          setSelectedImageId(item.id)
        }
      }}
      onDragStart={(e) => {
        e.cancelBubble = true
        setSelectedImageId(item.id)
        if (dragRef) dragRef.current = { id: item.id, x: item.x, y: item.y }
        setStageCursor(e.target.getStage(), 'grabbing')
      }}
      onDragMove={(e) => {
        e.cancelBubble = true
        const p = place(e.target.x(), e.target.y())
        e.target.x(p.x)
        e.target.y(p.y)
        // The picture is drawn by its layer: tell it where the mouse has the image (Konva redraws while dragging).
        if (dragRef) dragRef.current = { id: item.id, x: p.x, y: p.y }
      }}
      onDragEnd={(e) => {
        e.cancelBubble = true
        const p = place(e.target.x(), e.target.y())
        e.target.x(p.x)
        e.target.y(p.y)
        setStageCursor(e.target.getStage(), 'move')
        moveImage(layerId, item.id, p.x, p.y)
        if (dragRef) dragRef.current = null
      }}
      onMouseEnter={(e) => interactive && setStageCursor(e.target.getStage(), 'move')}
      onMouseLeave={(e) => setStageCursor(e.target.getStage(), '')}
      onContextMenu={(e) => {
        e.evt.preventDefault()
        e.cancelBubble = true
      }}
    >
      <Rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.w}
        height={bounds.h}
        fill="rgba(0,0,0,0.001)"
        stroke={selected ? '#facc15' : undefined}
        strokeWidth={selected ? 1.5 : 0}
        strokeScaleEnabled={false}
        dash={selected ? [4, 3] : undefined}
      />
      {selected && <Rect x={-3} y={-3} width={6} height={6} fill="#facc15" listening={false} />}
    </Group>
  )
}

interface KonvaGhostImageProps {
  pending: ImagePick | null
  pointerPos: { x: number; y: number } | null
  snapToGrid: boolean
  snapEntityPos: (rawX: number, rawY: number) => { x: number; y: number }
  spriteAssets?: Record<string, SpriteAssetInfo>
}

/** Translucent preview of the image about to be placed, snapped (or not) exactly like the placement itself. */
export const KonvaGhostImage = React.memo(function KonvaGhostImage({
  pending,
  pointerPos,
  snapToGrid,
  snapEntityPos,
  spriteAssets = NO_ASSETS,
}: KonvaGhostImageProps) {
  const version = useSpriteImagesVersion()
  if (!pending || !pointerPos) return null
  const at = snapToGrid ? snapEntityPos(pointerPos.x, pointerPos.y) : { x: Math.round(pointerPos.x), y: Math.round(pointerPos.y) }
  const resolved = resolveImageItem(pending, spriteAssets)
  return (
    <Shape
      key={version}
      listening={false}
      sceneFunc={(context) => {
        if (resolved) drawResolvedSprite(context._context as CanvasRenderingContext2D, resolved, { anchorX: at.x, anchorY: at.y, opacity: 0.6 })
      }}
    />
  )
})
