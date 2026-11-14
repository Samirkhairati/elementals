// Drop shadows on the editor canvas: the blurred, tinted silhouette of a picture or of a tile layer, drawn under it
// offset and blended. Silhouettes are baked once (shared/look/shadow.ts blurs them, the game bakes the same way) and
// cached: a picture's by its image, crop, blur and colour; a tile layer's in chunks of tiles, keyed by the tiles in and
// around each chunk, so painting rebakes only the chunks it touched.

import {
  chunkShadowMask,
  maskPixels,
  SHADOW_CHUNK_TILES,
  SHADOW_COMPOSITE,
  shadowChunk,
  shadowChunkCount,
  shadowMask,
  shadowPad,
  shadowRadius,
  type ResolvedShadow,
} from '../../../../shared/look/shadow'
import type { Layer } from '@/types/editor'

const TILE = 32

/** Least recently used first out, so panning a big map does not keep every chunk it ever saw. */
class Lru<V> {
  private map = new Map<string, V>()
  constructor(private limit: number) {}
  get(key: string): V | undefined {
    const v = this.map.get(key)
    if (v !== undefined) {
      this.map.delete(key)
      this.map.set(key, v)
    }
    return v
  }
  set(key: string, v: V): void {
    this.map.delete(key)
    this.map.set(key, v)
    while (this.map.size > this.limit) this.map.delete(this.map.keys().next().value as string)
  }
  clear(): void {
    this.map.clear()
  }
}

/** The RGBA pixels of what `draw` draws on a `w` x `h` canvas; null if they cannot be read (another origin). */
function drawnPixels(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): Uint8ClampedArray | null {
  if (w <= 0 || h <= 0) return null
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.imageSmoothingEnabled = false
  draw(ctx)
  try {
    return ctx.getImageData(0, 0, w, h).data
  } catch {
    return null
  }
}

/** A blurred silhouette as a canvas in the shadow's colour. */
function maskCanvas(mask: { alpha: Uint8ClampedArray; w: number; h: number }, color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = mask.w
  canvas.height = mask.h
  canvas.getContext('2d')?.putImageData(new ImageData(maskPixels(mask.alpha, color) as Uint8ClampedArray<ArrayBuffer>, mask.w, mask.h), 0, 0)
  return canvas
}

/** Draws with the shadow's opacity and blend; `place` sets up the transform and draws the silhouette. */
function withShadowStyle(ctx: CanvasRenderingContext2D, shadow: ResolvedShadow, opacity: number, place: () => void): void {
  ctx.save()
  ctx.globalAlpha *= shadow.opacity * opacity
  ctx.globalCompositeOperation = SHADOW_COMPOSITE[shadow.blend]
  ctx.imageSmoothingEnabled = shadow.softness > 0
  place()
  ctx.restore()
}

// ── Pictures ────────────────────────────────────────────────────────────────────────────────────────

interface BakedPicture {
  canvas: HTMLCanvasElement
  pad: number
}

const pictureCache = new WeakMap<CanvasImageSource, Lru<BakedPicture | null>>()

function pictureSilhouette(img: CanvasImageSource, src: { x: number; y: number; w: number; h: number }, radius: number, color: string): BakedPicture | null {
  let cache = pictureCache.get(img)
  if (!cache) pictureCache.set(img, (cache = new Lru(64)))
  const key = `${src.x},${src.y},${src.w},${src.h}|${radius}|${color}`
  let baked = cache.get(key)
  if (baked === undefined) {
    const rgba = drawnPixels(src.w, src.h, (c) => c.drawImage(img, src.x, src.y, src.w, src.h, 0, 0, src.w, src.h))
    const mask = rgba && shadowMask(rgba, src.w, src.h, radius)
    baked = mask ? { canvas: maskCanvas(mask, color), pad: mask.pad } : null
    cache.set(key, baked)
  }
  return baked
}

export interface PictureShadowDraw {
  img: CanvasImageSource
  /** The part of the image the picture shows. */
  src: { x: number; y: number; w: number; h: number }
  /** Where the picture covers the map (before mirroring) and how it is mirrored (pictureBox). */
  box: { x: number; y: number; w: number; h: number }
  mirrorX: boolean
  mirrorY: boolean
  opacity?: number
}

/** A picture's shadow, drawn just before the picture. */
export function drawPictureShadow(ctx: CanvasRenderingContext2D, shadow: ResolvedShadow, p: PictureShadowDraw): void {
  const sx = p.box.w / p.src.w
  const sy = p.box.h / p.src.h
  const baked = pictureSilhouette(p.img, p.src, shadowRadius(shadow.softness, sx), shadow.color)
  if (!baked) return
  withShadowStyle(ctx, shadow, p.opacity ?? 1, () => {
    ctx.translate(p.box.x + p.box.w / 2 + shadow.x, p.box.y + p.box.h / 2 + shadow.y)
    if (p.mirrorX || p.mirrorY) ctx.scale(p.mirrorX ? -1 : 1, p.mirrorY ? -1 : 1)
    ctx.drawImage(baked.canvas, -p.box.w / 2 - baked.pad * sx, -p.box.h / 2 - baked.pad * sy, baked.canvas.width * sx, baked.canvas.height * sy)
  })
}

// ── Tile layers ─────────────────────────────────────────────────────────────────────────────────────

type TileData = NonNullable<Layer['data']>

interface ChunkEntry {
  data: TileData
  sig: string
  canvas: HTMLCanvasElement | null
}

const chunkCache = new Lru<ChunkEntry>(48)

const isPainted = (t: TileData[number]): t is NonNullable<TileData[number]> => !!t && t.tilesetId !== '__collision__'

export interface LayerShadowDraw {
  layerId: string
  data: TileData
  tilesets: Record<string, HTMLImageElement>
  mapW: number
  mapH: number
  /** The part of the map in view (map pixels); chunks whose shadow cannot reach it are skipped. */
  view: { x: number; y: number; w: number; h: number }
}

/** A tile layer's shadow, drawn just before its tiles. */
export function drawLayerShadow(ctx: CanvasRenderingContext2D, shadow: ResolvedShadow, l: LayerShadowDraw): void {
  const radius = shadowRadius(shadow.softness, 1)
  const span = SHADOW_CHUNK_TILES * TILE
  const reach = shadowPad(radius) + TILE * 2
  const { cols, rows } = shadowChunkCount(l.mapW, l.mapH)
  const cx0 = Math.max(0, Math.floor((l.view.x - shadow.x - reach) / span))
  const cy0 = Math.max(0, Math.floor((l.view.y - shadow.y - reach) / span))
  const cx1 = Math.min(cols - 1, Math.floor((l.view.x + l.view.w - shadow.x + reach) / span))
  const cy1 = Math.min(rows - 1, Math.floor((l.view.y + l.view.h - shadow.y + reach) / span))
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const chunk = shadowChunk(cx, cy, l.mapW, l.mapH, TILE, radius)
      const canvas = chunkSilhouette(l, chunk, radius, shadow.color)
      if (canvas) withShadowStyle(ctx, shadow, 1, () => ctx.drawImage(canvas, chunk.at.x + shadow.x, chunk.at.y + shadow.y))
    }
  }
}

/** The tiles a chunk's silhouette is drawn from, as one string. */
function chunkSignature(l: LayerShadowDraw, c: ReturnType<typeof shadowChunk>): string {
  const parts: string[] = []
  for (let ty = c.y0; ty <= c.y1; ty++) {
    for (let tx = c.x0; tx <= c.x1; tx++) {
      const t = l.data[ty * l.mapW + tx]
      parts.push(isPainted(t) ? `${t.tilesetId}:${t.x}:${t.y}` : '')
    }
  }
  return parts.join(',')
}

function chunkSilhouette(l: LayerShadowDraw, chunk: ReturnType<typeof shadowChunk>, radius: number, color: string): HTMLCanvasElement | null {
  const key = `${l.layerId}|${chunk.cx},${chunk.cy}|${radius}|${color}`
  const entry = chunkCache.get(key)
  if (entry && entry.data === l.data) return entry.canvas
  const sig = chunkSignature(l, chunk)
  if (entry && entry.sig === sig) {
    entry.data = l.data
    return entry.canvas
  }
  let ready = true
  let any = false
  const rgba = drawnPixels(chunk.size, chunk.size, (c) => {
    for (let ty = chunk.y0; ty <= chunk.y1; ty++) {
      for (let tx = chunk.x0; tx <= chunk.x1; tx++) {
        const t = l.data[ty * l.mapW + tx]
        if (!isPainted(t)) continue
        const img = l.tilesets[t.tilesetId]
        if (!img || !img.complete || img.naturalWidth === 0) {
          ready = false
          continue
        }
        any = true
        c.drawImage(img, t.x * TILE, t.y * TILE, TILE, TILE, (tx - chunk.col) * TILE, (ty - chunk.row) * TILE, TILE, TILE)
      }
    }
  })
  const mask = any && rgba ? chunkShadowMask(rgba, chunk, l.mapW, l.mapH, TILE, radius) : null
  const canvas = mask ? maskCanvas(mask, color) : null
  // A tileset still loading: draw what there is, bake again next time.
  if (ready) chunkCache.set(key, { data: l.data, sig, canvas })
  return canvas
}

/** Forget every baked layer silhouette (tests). */
export function clearShadowCache(): void {
  chunkCache.clear()
}
