// What an image-layer item looks like. A sprite item shows its asset's frame; a picture item shows the whole picture
// or just its `crop`. Crops are regions of the one decoded picture (the canvas draws a sub-rectangle of it): showing
// ten parts of a sheet costs one image, never ten copies. The asset map holds one entry per picture (`graphic:<id>`).

import type { SpriteAssetInfo } from '../../../shared/engine/types'
import type { ImageItem } from '@/types/editor'
import { imagePickKey } from './graphicAssets'
import { effectiveCrop } from './cropRect'
import type { Rect } from './entityVisuals'
import { wholePixelDest } from './imageScale'
import { getSpriteImage, resolveSprite, spriteBoundsFromMeta, type ResolvedSprite } from './spriteImages'

type ItemLike = Pick<ImageItem, 'assetId' | 'graphicId' | 'crop' | 'scale'>

/** The tile-sized box used while an item's picture is missing or loading, so it can still be picked. */
const FALLBACK: Rect = { x: -16, y: -32, w: 32, h: 32 }

const croppedPicture = (item: ItemLike): boolean => !!item.graphicId && !!item.crop

/** Size in picture pixels of what the item shows (its crop, or its frame), or null when its picture is unknown. */
export function itemSourceSize(item: ItemLike, assets: Record<string, SpriteAssetInfo>): { w: number; h: number } | null {
  const asset = assets[imagePickKey(item)]
  if (!asset) return null
  if (croppedPicture(item)) return { w: item.crop!.w, h: item.crop!.h }
  return { w: asset.meta.frameWidth, h: asset.meta.frameHeight }
}

/** Rectangle of the item relative to its anchor (bottom-centre), unflipped; known before the picture has loaded. */
export function itemBounds(item: ItemLike, assets: Record<string, SpriteAssetInfo>): Rect {
  const asset = assets[imagePickKey(item)]
  if (!asset) return FALLBACK
  const scale = item.scale ?? 1
  if (croppedPicture(item)) {
    return wholePixelDest({ x: (-item.crop!.w * scale) / 2, y: -item.crop!.h * scale, w: item.crop!.w * scale, h: item.crop!.h * scale }, scale)
  }
  return wholePixelDest(spriteBoundsFromMeta(asset.meta, { scale }), scale)
}

/** What to draw for an item right now, or null while its picture loads. */
export function resolveImageItem(item: ItemLike, assets: Record<string, SpriteAssetInfo>): ResolvedSprite | null {
  const asset = assets[imagePickKey(item)]
  if (!asset) return null
  const scale = item.scale ?? 1
  if (!croppedPicture(item)) {
    const sprite = resolveSprite(asset, { scale })
    return sprite && { ...sprite, dest: wholePixelDest(sprite.dest, scale) }
  }
  const img = getSpriteImage(Object.values(asset.sheets)[0])
  if (!img) return null
  const src = effectiveCrop(item.crop, { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height })
  const dest = { x: (-src.w * scale) / 2, y: -src.h * scale, w: src.w * scale, h: src.h * scale }
  return { img, src, dest: wholePixelDest(dest, scale), flipX: false }
}

/** "Tree", "Tree 2", "Tree 3"...: the first of these not in `taken`, starting from `base` itself. */
export function nextImageName(base: string, taken: readonly string[]): string {
  const stem = base.replace(/ \d+$/, '')
  const used = new Set(taken)
  if (!used.has(base)) return base
  for (let n = 2; ; n++) if (!used.has(`${stem} ${n}`)) return `${stem} ${n}`
}
