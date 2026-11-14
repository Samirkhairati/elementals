// Drop shadows (Look.shadow): which shadow a picture or a tile layer casts in a profile, and the blurred silhouette
// both renderers draw it with. Pure: the editor and the game draw the silhouette into a canvas themselves, hand its
// pixels here and draw the result tinted, offset and blended (see docs/looks.md).

import { hexToRgb } from './bake.ts'
import { resolveLook } from './schema.ts'
import type { LookSet, LookShadow, ShadowBlend } from './types.ts'

/** A shadow with every default filled in: what a renderer draws. */
export interface ResolvedShadow {
  x: number
  y: number
  softness: number
  /** 0..1. */
  opacity: number
  color: string
  blend: ShadowBlend
}

export function resolvedShadow(s: LookShadow | undefined): ResolvedShadow | null {
  if (!s || s.off) return null
  const opacity = (s.opacity ?? 50) / 100
  if (opacity <= 0) return null
  return { x: s.x, y: s.y, softness: s.softness ?? 0, opacity, color: s.color ?? '#000000', blend: s.blend ?? 'multiply' }
}

/**
 * The shadow of a subject in a profile. `sets` is inner first (a picture's own look set, then its layer's): the first
 * look that has a shadow decides, so a picture's own shadow replaces its layer's and an `off` one removes it.
 */
export function shadowFor(sets: readonly (LookSet | undefined)[], profile: string | null): ResolvedShadow | null {
  for (const set of sets) {
    const shadow = resolveLook(set, profile)?.shadow
    if (shadow) return resolvedShadow(shadow)
  }
  return null
}

/** Room around a silhouette for a blur of this radius (pixels on each side). */
export const shadowPad = (radius: number): number => (radius > 0 ? Math.ceil(radius * 1.5) + 1 : 0)

/** Box widths of three passes that together approximate a gaussian of sigma = radius / 2. */
function boxSizes(radius: number): number[] {
  const sigma = radius / 2
  let lo = Math.floor(Math.sqrt(4 * sigma * sigma + 1))
  if (lo % 2 === 0) lo--
  const m = Math.round((12 * sigma * sigma - 3 * lo * lo - 12 * lo - 9) / (-4 * lo - 4))
  return [0, 1, 2].map((i) => (i < m ? lo : lo + 2))
}

/** One box blur pass of half-width `r` along the rows or the columns of `src`, written into `dst` (zeros outside). */
function boxPass(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, horizontal: boolean): void {
  const lines = horizontal ? h : w
  const len = horizontal ? w : h
  const step = horizontal ? 1 : w
  const inv = 1 / (2 * r + 1)
  for (let l = 0; l < lines; l++) {
    const base = horizontal ? l * w : l
    let acc = 0
    for (let i = 0; i <= r && i < len; i++) acc += src[base + i * step]
    for (let i = 0; i < len; i++) {
      dst[base + i * step] = acc * inv
      const add = i + r + 1
      const drop = i - r
      if (add < len) acc += src[base + add * step]
      if (drop >= 0) acc -= src[base + drop * step]
    }
  }
}

/**
 * The silhouette of an RGBA image (`w` x `h`), blurred by `radius` pixels, with `shadowPad(radius)` of room on each
 * side: one alpha byte per pixel of the padded size. Radius 0 copies the alpha.
 */
export function shadowMask(rgba: ArrayLike<number>, w: number, h: number, radius: number): { alpha: Uint8ClampedArray; w: number; h: number; pad: number } {
  const pad = shadowPad(radius)
  const W = w + pad * 2
  const H = h + pad * 2
  const a = new Float32Array(W * H)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[(y + pad) * W + x + pad] = rgba[(y * w + x) * 4 + 3]
  if (radius > 0) {
    const tmp = new Float32Array(W * H)
    for (const size of boxSizes(radius)) {
      const r = (size - 1) / 2
      if (r < 1) continue
      boxPass(a, tmp, W, H, r, true)
      boxPass(tmp, a, W, H, r, false)
    }
  }
  return { alpha: Uint8ClampedArray.from(a), w: W, h: H, pad }
}

/** RGBA pixels of a silhouette with this alpha in one colour (default white, for a renderer that tints it). */
export function maskPixels(alpha: Uint8ClampedArray, color = '#ffffff'): Uint8ClampedArray {
  const [r, g, b] = hexToRgb(color).map((v) => Math.round(v * 255))
  const out = new Uint8ClampedArray(alpha.length * 4)
  for (let i = 0; i < alpha.length; i++) {
    out[i * 4] = r
    out[i * 4 + 1] = g
    out[i * 4 + 2] = b
    out[i * 4 + 3] = alpha[i]
  }
  return out
}

/** The canvas 2D composite operation of a blend mode (Phaser's canvas renderer uses the same names). */
export const SHADOW_COMPOSITE: Record<ShadowBlend, 'source-over' | 'multiply' | 'screen' | 'lighter'> = { normal: 'source-over', multiply: 'multiply', screen: 'screen', add: 'lighter' }

/** Blur radius in a picture's own pixels for a softness in map pixels (it is drawn scaled), to half pixels. */
export const shadowRadius = (softness: number, scale: number): number => Math.round((softness / (scale || 1)) * 2) / 2

/** Tiles a layer shadow is baked in: square chunks of this many tiles (each blurred with its neighbours' edge tiles). */
export const SHADOW_CHUNK_TILES = 16

/** One chunk of a tile layer's shadow: which tiles go into its silhouette and where the blurred result is drawn. */
export interface ShadowChunk {
  cx: number
  cy: number
  /** The tile cell at the silhouette canvas's top-left (may be outside the map: nothing is drawn there). */
  col: number
  row: number
  /** The silhouette canvas is `size` x `size` pixels: the chunk and `margin` tiles of its neighbours on every side. */
  size: number
  /** Inclusive tile range to draw, clamped to the map. */
  x0: number
  y0: number
  x1: number
  y1: number
  /** Map pixels of the blurred silhouette's top-left (before the shadow's offset). */
  at: { x: number; y: number }
}

/** How many chunks a `mapW` x `mapH` tile layer has across and down. */
export const shadowChunkCount = (mapW: number, mapH: number): { cols: number; rows: number } => ({ cols: Math.ceil(mapW / SHADOW_CHUNK_TILES), rows: Math.ceil(mapH / SHADOW_CHUNK_TILES) })

/** The chunk (cx, cy) of a `mapW` x `mapH` tile layer (`tile` pixel cells) for a blur of `radius` pixels. */
export function shadowChunk(cx: number, cy: number, mapW: number, mapH: number, tile: number, radius: number): ShadowChunk {
  const C = SHADOW_CHUNK_TILES
  const pad = shadowPad(radius)
  const margin = Math.ceil(pad / tile)
  const col = cx * C - margin
  const row = cy * C - margin
  return {
    cx,
    cy,
    col,
    row,
    size: (C + margin * 2) * tile,
    x0: Math.max(0, col),
    y0: Math.max(0, row),
    x1: Math.min(mapW - 1, cx * C + C - 1 + margin),
    y1: Math.min(mapH - 1, cy * C + C - 1 + margin),
    at: { x: col * tile - pad, y: row * tile - pad },
  }
}

/**
 * The blurred silhouette of a chunk from the RGBA pixels of its tiles (`chunk.size` square), keeping only the chunk's
 * own cells (plus the blur past the map's edge): the chunks then tile the shadow without overlapping, and every pixel
 * kept saw all the tiles its blur reaches. Null when nothing of it is left.
 */
export function chunkShadowMask(rgba: ArrayLike<number>, chunk: ShadowChunk, mapW: number, mapH: number, tile: number, radius: number): ReturnType<typeof shadowMask> | null {
  const C = SHADOW_CHUNK_TILES
  const mask = shadowMask(rgba, chunk.size, chunk.size, radius)
  const p = mask.pad
  const left = chunk.cx === 0 ? 0 : (chunk.cx * C - chunk.col) * tile + p
  const top = chunk.cy === 0 ? 0 : (chunk.cy * C - chunk.row) * tile + p
  const right = (chunk.cx + 1) * C >= mapW ? mask.w : ((chunk.cx + 1) * C - chunk.col) * tile + p
  const bottom = (chunk.cy + 1) * C >= mapH ? mask.h : ((chunk.cy + 1) * C - chunk.row) * tile + p
  let any = false
  for (let y = 0; y < mask.h; y++) {
    for (let x = 0; x < mask.w; x++) {
      const i = y * mask.w + x
      if (x < left || x >= right || y < top || y >= bottom) mask.alpha[i] = 0
      else if (mask.alpha[i]) any = true
    }
  }
  return any ? mask : null
}
