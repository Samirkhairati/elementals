// Decoded sprite sheets (from the data: URLs the sprite IPC returns), shared by the canvas, the inspector
// previews and the Sprites panel. Images are cached by URL; `useSpriteImagesVersion` re-renders consumers
// whenever one finishes loading so a draw that found no image yet can run again.

import { useSyncExternalStore } from 'react'
import type { SpriteAssetInfo, SpriteAssetMeta, SpriteProps } from '../../../shared/engine/types'
import { resolveSpriteFrame, spriteLocalRect, type Rect } from './entityVisuals'

interface Entry {
  img: HTMLImageElement
  loaded: boolean
  failed: boolean
}

const cache = new Map<string, Entry>()
const listeners = new Set<() => void>()
let version = 0

function bump() {
  version++
  listeners.forEach((l) => l())
}

/** The decoded image for a data/URL, or null while it loads (or if it failed). Starts loading on first use. */
export function getSpriteImage(url: string | undefined | null): HTMLImageElement | null {
  if (!url) return null
  const hit = cache.get(url)
  if (hit) return hit.loaded ? hit.img : null
  if (typeof Image === 'undefined') return null
  const img = new Image()
  const entry: Entry = { img, loaded: false, failed: false }
  cache.set(url, entry)
  img.onload = () => {
    entry.loaded = true
    bump()
  }
  img.onerror = () => {
    entry.failed = true
    bump()
  }
  img.src = url
  return null
}

/** Natural width of a loaded sheet, or undefined while it is loading. */
export function getSpriteImageWidth(url: string | undefined | null): number | undefined {
  const img = getSpriteImage(url)
  return img ? img.naturalWidth || img.width : undefined
}

/** Natural size of a loaded sheet, or undefined while it is loading. */
export function getSpriteImageSize(url: string | undefined | null): { width: number; height: number } | undefined {
  const img = getSpriteImage(url)
  return img ? { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height } : undefined
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
const getVersion = () => version

/** Changes whenever any sprite image finished loading; use it as a render dependency. */
export function useSpriteImagesVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion)
}

/** Test hook: forget every cached image. */
export function clearSpriteImageCache() {
  cache.clear()
  version++
}

// ── resolving what to draw ──────────────────────────────────────────────────────────────────────

export interface ResolvedSprite {
  img: HTMLImageElement
  /** Source rectangle inside the sheet. */
  src: Rect
  /** Destination rectangle relative to the anchor (scaled, with pivot + offset applied). */
  dest: Rect
  flipX: boolean
}

type SpriteDrawProps = Pick<SpriteProps, 'facing' | 'animation' | 'frame' | 'offsetX' | 'offsetY' | 'scale' | 'flipX'>

/**
 * Everything needed to paint a Sprite component of an asset at time `tick`, or null when the asset
 * has no sheet for the frame or the sheet is still loading.
 */
export function resolveSprite(asset: SpriteAssetInfo | undefined, sprite: Partial<SpriteDrawProps>, tick = 0): ResolvedSprite | null {
  if (!asset) return null
  const meta = asset.meta
  const full = { facing: 'down', animation: '', frame: 0, ...sprite } as SpriteDrawProps
  const pf = resolveSpriteFrame(meta, full, tick, (file) => getSpriteImageWidth(asset.sheets[file]))
  const img = getSpriteImage(asset.sheets[pf.sheetFile])
  if (!img || !pf.rect) return null
  return { img, src: pf.rect, dest: spriteLocalRect(meta, full), flipX: !!full.flipX }
}

/** Sprite frame rectangle (relative to the anchor) from metadata alone: usable before the image loads. */
export function spriteBoundsFromMeta(meta: SpriteAssetMeta, sprite: Partial<SpriteDrawProps>): Rect {
  return spriteLocalRect(meta, sprite)
}

// ── drawing ─────────────────────────────────────────────────────────────────────────────────────

const tintCache = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>()

function tintedSource(img: HTMLImageElement, src: Rect, tint: string): HTMLCanvasElement | null {
  const key = `${src.x},${src.y},${src.w},${src.h}:${tint}`
  let perImage = tintCache.get(img)
  if (!perImage) {
    perImage = new Map()
    tintCache.set(img, perImage)
  }
  const hit = perImage.get(key)
  if (hit) return hit
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = src.w
  canvas.height = src.h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, src.x, src.y, src.w, src.h, 0, 0, src.w, src.h)
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = tint
  ctx.fillRect(0, 0, src.w, src.h)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(img, src.x, src.y, src.w, src.h, 0, 0, src.w, src.h)
  if (perImage.size > 64) perImage.clear()
  perImage.set(key, canvas)
  return canvas
}

export interface DrawSpriteOptions {
  /** Where the anchor is on the target context (already-transformed units). */
  anchorX: number
  anchorY: number
  opacity?: number
  tint?: string
}

/** Paints a resolved sprite pixel-perfectly (no smoothing), honouring flip, opacity and tint. */
export function drawResolvedSprite(ctx: CanvasRenderingContext2D, r: ResolvedSprite, opts: DrawSpriteOptions) {
  const { src, dest } = r
  const dx = opts.anchorX + dest.x
  const dy = opts.anchorY + dest.y
  ctx.save()
  ctx.imageSmoothingEnabled = false
  if (opts.opacity !== undefined && opts.opacity < 1) ctx.globalAlpha *= Math.max(0, opts.opacity)
  const source: CanvasImageSource = (opts.tint ? tintedSource(r.img, src, opts.tint) : null) ?? r.img
  const sx = source === r.img ? src.x : 0
  const sy = source === r.img ? src.y : 0
  if (r.flipX) {
    ctx.translate(dx + dest.w, dy)
    ctx.scale(-1, 1)
    ctx.drawImage(source, sx, sy, src.w, src.h, 0, 0, dest.w, dest.h)
  } else {
    ctx.drawImage(source, sx, sy, src.w, src.h, dx, dy, dest.w, dest.h)
  }
  ctx.restore()
}
