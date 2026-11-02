// What an image-layer item looks like. A sprite item shows its asset's frame; a picture item shows the whole picture
// or just its `crop`. Crops are regions of the one decoded picture (the canvas draws a sub-rectangle of it): showing
// ten parts of a sheet costs one image, never ten copies. The asset map holds one entry per picture (`graphic:<id>`).

import type { SpriteAssetInfo } from '../../../shared/engine/types'
import type { ImageItem } from '@/types/editor'
import { imagePickKey } from './graphicAssets'
import { effectiveCrop } from './cropRect'
import type { Rect } from './entityVisuals'
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
    const w = item.crop!.w * scale
    const h = item.crop!.h * scale
    return { x: -w / 2, y: -h, w, h }
  }
  return spriteBoundsFromMeta(asset.meta, { scale })
}

/** Where the item stands once flips are applied (a flip mirrors the frame around the anchor). */
export function flippedItemBounds(item: ItemLike & { flipX?: boolean; flipY?: boolean }, assets: Record<string, SpriteAssetInfo>): Rect {
  const b = itemBounds(item, assets)
  return { ...b, x: item.flipX ? -(b.x + b.w) : b.x, y: item.flipY ? -(b.y + b.h) : b.y }
}

/**
 * Snaps an anchor so the item's edges, not its anchor, land on the tile grid: the left edge on a vertical grid line and the bottom edge
 * on a horizontal one. A one-tile picture ends up exactly where the entity snap puts it, but a picture two tiles wide no longer
 * sits half a tile off (its anchor is its bottom-centre, which is a tile line only for even widths).
 */
export function snapImageAnchor(bounds: Rect, rawX: number, rawY: number, tile = 32): { x: number; y: number } {
  const left = Math.round((rawX + bounds.x) / tile) * tile
  const bottom = Math.round((rawY + bounds.y + bounds.h) / tile) * tile
  return { x: left - bounds.x, y: bottom - (bounds.y + bounds.h) }
}

/** What to draw for an item right now, or null while its picture loads. */
export function resolveImageItem(item: ItemLike, assets: Record<string, SpriteAssetInfo>): ResolvedSprite | null {
  const asset = assets[imagePickKey(item)]
  if (!asset) return null
  const scale = item.scale ?? 1
  if (!croppedPicture(item)) return resolveSprite(asset, { scale })
  const img = getSpriteImage(Object.values(asset.sheets)[0])
  if (!img) return null
  const src = effectiveCrop(item.crop, { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height })
  return { img, src, dest: { x: (-src.w * scale) / 2, y: -src.h * scale, w: src.w * scale, h: src.h * scale }, flipX: false }
}

/** "Tree", "Tree 2", "Tree 3"...: the first of these not in `taken`, starting from `base` itself. */
export function nextImageName(base: string, taken: readonly string[]): string {
  const stem = base.replace(/ \d+$/, '')
  const used = new Set(taken)
  if (!used.has(base)) return base
  for (let n = 2; ; n++) if (!used.has(`${stem} ${n}`)) return `${stem} ${n}`
}
