// What an image-layer item looks like. A sprite item shows its asset's frame; a picture item shows the whole picture
// or just its `crop`. Crops are regions of the one decoded picture (the canvas draws a sub-rectangle of it): showing
// ten parts of a sheet costs one image, never ten copies. The asset map holds one entry per picture (`graphic:<id>`).

import type { SpriteAssetInfo } from '../../../shared/engine/types'
import type { ImageItem } from '@/types/editor'
import { imagePickKey } from './graphicAssets'
import { effectiveCrop } from './cropRect'
import { DEFAULT_GRID, nearestLine, type GridSpec } from './grid'
import type { Rect } from './entityVisuals'
import { getSpriteImage, resolveSprite, spriteBoundsFromMeta, type ResolvedSprite } from './spriteImages'

type ItemLike = Pick<ImageItem, 'assetId' | 'graphicId' | 'crop' | 'scale'>

/**
 * Size the game shows a picture at: whole pixels, never below 1 (`displaySize` in the game's imageLayers). The editor draws
 * the exact size, but snaps with this one, so the edges that land on the grid land there in the game too.
 */
const shownSize = (w: number, h: number, scale: number): { w: number; h: number } =>
  scale === 1 ? { w, h } : { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) }

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
export function itemBounds(item: ItemLike, assets: Record<string, SpriteAssetInfo>, gameSize = false): Rect {
  const asset = assets[imagePickKey(item)]
  if (!asset) return FALLBACK
  const scale = item.scale ?? 1
  if (croppedPicture(item)) {
    const { w, h } = gameSize ? shownSize(item.crop!.w, item.crop!.h, scale) : { w: item.crop!.w * scale, h: item.crop!.h * scale }
    return { x: -w / 2, y: -h, w, h }
  }
  if (gameSize && item.graphicId) {
    const { w, h } = shownSize(asset.meta.frameWidth, asset.meta.frameHeight, scale)
    return { x: -w / 2, y: -h, w, h }
  }
  return spriteBoundsFromMeta(asset.meta, { scale })
}

/** Where the item stands once flips are applied (a flip mirrors the frame around the anchor). */
export function flippedItemBounds(item: ItemLike & { flipX?: boolean; flipY?: boolean }, assets: Record<string, SpriteAssetInfo>, gameSize = false): Rect {
  const b = itemBounds(item, assets, gameSize)
  return { ...b, x: item.flipX ? -(b.x + b.w) : b.x, y: item.flipY ? -(b.y + b.h) : b.y }
}

/**
 * Snaps an anchor so one of the item's edges, not its anchor, lands on a grid line: on each axis the edge (left or right,
 * top or bottom) that is nearest to a line moves onto it, so a picture sticks by whichever corner you bring close to the
 * grid. A tie prefers the left and the bottom edge, which is where a one-tile picture ends up exactly like an entity.
 * `grid` is a size in px (square, no offset) or a full grid.
 */
export function snapImageAnchor(bounds: Rect, rawX: number, rawY: number, grid: number | GridSpec = DEFAULT_GRID): { x: number; y: number } {
  const g: GridSpec = typeof grid === 'number' ? { ...DEFAULT_GRID, sizeX: grid, sizeY: grid } : grid
  const left = rawX + bounds.x
  const right = left + bounds.w
  const top = rawY + bounds.y
  const bottom = top + bounds.h
  const lineL = nearestLine(left, g.sizeX, g.offsetX)
  const lineR = nearestLine(right, g.sizeX, g.offsetX)
  const lineT = nearestLine(top, g.sizeY, g.offsetY)
  const lineB = nearestLine(bottom, g.sizeY, g.offsetY)
  const dx = Math.abs(lineL - left) <= Math.abs(lineR - right) ? lineL - left : lineR - right
  const dy = Math.abs(lineB - bottom) <= Math.abs(lineT - top) ? lineB - bottom : lineT - top
  return { x: rawX + dx, y: rawY + dy }
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
