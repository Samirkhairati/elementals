import React, { useEffect, useRef } from 'react'
import type { SpriteAssetInfo } from '../../../../../shared/engine/types'
import type { ImageItem } from '@/types/editor'
import { itemSourceSize, resolveImageItem } from '@/lib/imageItems'
import { scaledSize } from '@/lib/imageScale'
import { drawResolvedSprite, useSpriteImagesVersion } from '@/lib/spriteImages'
import { centredRect, fitZoom, prepareCanvas } from '@/lib/canvas2d'

interface Props {
  item: Pick<ImageItem, 'assetId' | 'graphicId' | 'crop'>
  assets: Record<string, SpriteAssetInfo>
  /** Fit a square box of this many px (whole-number zoom while it is magnified)... */
  size?: number
  /** ...or draw at exactly this zoom (1 = actual pixels). */
  zoom?: number
  /** The item's scale: the view then has the size the item gets on the map (exact size, nearest neighbour). */
  itemScale?: number
  className?: string
}

/** An image item as it shows on the map (the crop of a picture, or a sprite's idle frame), pixelated. */
export const ImageItemView = React.memo(function ImageItemView({ item, assets, size = 32, zoom, itemScale = 1, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const version = useSpriteImagesVersion()
  const { assetId, graphicId } = item
  const cx = item.crop?.x
  const cy = item.crop?.y
  const cw = item.crop?.w
  const ch = item.crop?.h
  const unscaled = itemSourceSize(item, assets)
  const source = unscaled && scaledSize(unscaled, itemScale)
  const scale = zoom ?? (source ? fitZoom(source.w, source.h, size) : 1)
  const width = zoom && source ? Math.max(1, Math.round(source.w * zoom)) : size
  const height = zoom && source ? Math.max(1, Math.round(source.h * zoom)) : size

  useEffect(() => {
    const ctx = ref.current && prepareCanvas(ref.current, width, height)
    if (!ctx) return
    const crop = cx === undefined ? undefined : { x: cx, y: cy!, w: cw!, h: ch! }
    const resolved = resolveImageItem({ assetId, graphicId, crop, scale: itemScale }, assets)
    if (!resolved) return
    const { w, h } = scaledSize(resolved.src, itemScale)
    const dest = centredRect(w, h, scale, width, height)
    drawResolvedSprite(ctx, { ...resolved, dest }, { anchorX: 0, anchorY: 0 })
  }, [assetId, graphicId, cx, cy, cw, ch, assets, itemScale, width, height, scale, version])

  return <canvas ref={ref} className={`ed-pixelated shrink-0 ${className ?? ''}`} style={{ width, height }} aria-hidden />
})
