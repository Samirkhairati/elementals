// Drawing with looks on the editor canvas: graded pictures (cached per look and placement), graded tile layers
// (the visible part, at map-pixel resolution), and the placement maths the game uses too (shared/look/shader.ts).

import { pictureSubject, WORLD_SUBJECT, type LookPlacement } from '../../../../shared/look/shader'
import type { CompiledLook, LookLayer } from '../../../../shared/look/compile'
import type { ShaderInfo, ShaderUse } from '../../../../shared/look/index'
import { lookGL, type ShaderPass } from './lookGL'
import { compileCached } from './lookSubjects'
import { getLookLibrary } from './lookLibrary'
import { getLookView, type LookViewState } from './lookView'

type Box = { x: number; y: number; w: number; h: number }

/** The time animated shaders and grain see (frozen at 0 unless the view animates). */
export const lookTime = (view: LookViewState = getLookView()): number => (view.animate ? performance.now() / 1000 : 0)

/** The mask preview of a subject, when its mask is the one being edited. */
export function previewFor(subject: string, compiled: CompiledLook, view: LookViewState = getLookView()): LookPlacement['preview'] {
  const m = view.mask
  if (!m || m.subject !== subject || view.overlay === 'off') return null
  const index = compiled.maskIndex[m.maskId]
  return index === undefined ? null : { mask: index, mode: view.overlay === 'bw' ? 'bw' : 'overlay' }
}

/** The shader passes of a compiled look (shaders the library does not have are skipped). */
export function shaderPasses(uses: readonly ShaderUse[], uvToWorld: [number, number, number, number], time: number): ShaderPass[] {
  const lib = getLookLibrary().shaders
  return uses.flatMap((u) => {
    const info: ShaderInfo | undefined = lib.find((s) => s.id === u.shader)
    return info ? [{ info, params: u.params, uvToWorld, time }] : []
  })
}

export const shadersAnimated = (uses: readonly ShaderUse[]): boolean => {
  const lib = getLookLibrary().shaders
  return uses.some((u) => lib.find((s) => s.id === u.shader)?.animated)
}

// ── pictures ───────────────────────────────────────────────────────────────────────────────────────

let scratch: HTMLCanvasElement | null = null
function scratchCanvas(w: number, h: number): CanvasRenderingContext2D {
  scratch ??= document.createElement('canvas')
  if (scratch.width !== w) scratch.width = w
  if (scratch.height !== h) scratch.height = h
  const ctx = scratch.getContext('2d')!
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = false
  return ctx
}

const pictureCache = new Map<string, { canvas: HTMLCanvasElement; pad: number }>()
let cachedPixels = 0
const CACHE_PIXELS = 48_000_000

function remember(key: string, entry: { canvas: HTMLCanvasElement; pad: number }) {
  pictureCache.set(key, entry)
  cachedPixels += entry.canvas.width * entry.canvas.height
  while (cachedPixels > CACHE_PIXELS && pictureCache.size > 1) {
    const [k, old] = pictureCache.entries().next().value!
    cachedPixels -= old.canvas.width * old.canvas.height
    pictureCache.delete(k)
  }
}

export interface PictureDraw {
  img: CanvasImageSource
  /** Source rectangle (the picture's own pixels). */
  src: Box
  /** Where it is drawn, in map pixels, before mirroring. */
  box: Box
  mirrorX: boolean
  mirrorY: boolean
  opacity?: number
  /** Picture key (graphic / asset + crop) for the cache. */
  key: string
}

/**
 * Draws a picture with its looks (own look in its own pixels, layer look in map pixels). Returns false when there is
 * nothing to grade (the caller draws it plainly).
 */
export function drawGradedPicture(ctx: CanvasRenderingContext2D, p: PictureDraw, stack: LookLayer[], subject: string, mapSize: { w: number; h: number }): boolean {
  const view = getLookView()
  if (!view.enabled || stack.length === 0) return false
  const gl = lookGL()
  if (!gl) return false
  const own = { w: p.src.w, h: p.src.h }
  const compiled = compileCached(stack, { subjectSize: own, mapSize })
  if (compiled.neutral && compiled.shaders.length === 0) return false
  const lib = getLookLibrary().shaders
  const pad = Math.max(0, ...compiled.shaders.map((u) => lib.find((s) => s.id === u.shader)?.pad ?? 0))
  // padding in the picture's own pixels (glows and outlines need room around it)
  const kx = own.w / p.box.w
  const padOwn = Math.ceil(pad * kx)
  const padWorld = padOwn / kx
  const animated = view.animate && (shadersAnimated(compiled.shaders) || compiled.grain[2] > 0)
  const preview = previewFor(subject, compiled, view)
  const key = `${p.key}|${compiled.key}|${p.box.x},${p.box.y},${p.box.w},${p.box.h}|${p.mirrorX ? 1 : 0}${p.mirrorY ? 1 : 0}|${preview ? `${preview.mask}${preview.mode}` : ''}|${lib.length}`
  let entry = animated ? undefined : pictureCache.get(key)
  if (!entry) {
    const w = own.w + padOwn * 2
    const h = own.h + padOwn * 2
    const sctx = scratchCanvas(w, h)
    sctx.drawImage(p.img, p.src.x, p.src.y, p.src.w, p.src.h, padOwn, padOwn, own.w, own.h)
    const padded = { x: p.box.x - padWorld, y: p.box.y - padWorld, w: p.box.w + padWorld * 2, h: p.box.h + padWorld * 2 }
    // The source is the picture unflipped: texel u lands at the mirrored place when the picture is flipped.
    const uvToWorld: [number, number, number, number] = [
      p.mirrorX ? padded.x + padded.w : padded.x,
      p.mirrorY ? padded.y + padded.h : padded.y,
      p.mirrorX ? -padded.w : padded.w,
      p.mirrorY ? -padded.h : padded.h,
    ]
    const time = lookTime(view)
    const ok = gl.render(
      scratch!,
      w,
      h,
      { compiled, uvToWorld, snap: false, placement: { subject: pictureSubject(p.box, own, p.mirrorX, p.mirrorY), frame: p.box, time, preview } },
      shaderPasses(compiled.shaders, uvToWorld, time)
    )
    if (!ok) return false
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(gl.canvas, 0, 0)
    entry = { canvas, pad: padWorld }
    if (!animated) remember(key, entry)
  }
  ctx.save()
  ctx.imageSmoothingEnabled = false
  if (p.opacity !== undefined && p.opacity < 1) ctx.globalAlpha *= Math.max(0, p.opacity)
  const dx = p.box.x - entry.pad
  const dy = p.box.y - entry.pad
  const dw = p.box.w + entry.pad * 2
  const dh = p.box.h + entry.pad * 2
  if (p.mirrorX || p.mirrorY) {
    ctx.translate(p.mirrorX ? dx * 2 + dw : 0, p.mirrorY ? dy * 2 + dh : 0)
    ctx.scale(p.mirrorX ? -1 : 1, p.mirrorY ? -1 : 1)
  }
  ctx.drawImage(entry.canvas, dx, dy, dw, dh)
  ctx.restore()
  return true
}

// ── tile layers ────────────────────────────────────────────────────────────────────────────────────

let tileCanvas: HTMLCanvasElement | null = null
const MAX_SIDE = 4096

/**
 * Draws a tile layer with its look: `paint` draws the tiles (map pixels) into an offscreen canvas covering `area`
 * (the visible part of the map), which is graded and drawn back. False = nothing to grade.
 */
export function drawGradedArea(
  ctx: CanvasRenderingContext2D,
  area: Box,
  stack: LookLayer[],
  subject: string,
  mapSize: { w: number; h: number },
  view: Box,
  paint: (c: CanvasRenderingContext2D) => void
): boolean {
  const lv = getLookView()
  if (!lv.enabled || stack.length === 0 || area.w < 1 || area.h < 1) return false
  const gl = lookGL()
  if (!gl) return false
  const compiled = compileCached(stack, { subjectSize: mapSize, mapSize })
  if (compiled.neutral && compiled.shaders.length === 0) return false
  // one canvas pixel per map pixel (masks are evaluated per map pixel, like the game), less when zoomed far out
  const k = Math.min(1, MAX_SIDE / Math.max(area.w, area.h))
  const w = Math.max(1, Math.ceil(area.w * k))
  const h = Math.max(1, Math.ceil(area.h * k))
  tileCanvas ??= document.createElement('canvas')
  if (tileCanvas.width !== w) tileCanvas.width = w
  if (tileCanvas.height !== h) tileCanvas.height = h
  const tctx = tileCanvas.getContext('2d')!
  tctx.setTransform(1, 0, 0, 1, 0, 0)
  tctx.clearRect(0, 0, w, h)
  tctx.imageSmoothingEnabled = false
  tctx.setTransform(k, 0, 0, k, -area.x * k, -area.y * k)
  paint(tctx)
  const uvToWorld: [number, number, number, number] = [area.x, area.y, w / k, h / k]
  const time = lookTime(lv)
  const ok = gl.render(
    tileCanvas,
    w,
    h,
    { compiled, uvToWorld, snap: true, placement: { subject: WORLD_SUBJECT, frame: view, time, preview: previewFor(subject, compiled, lv) } },
    shaderPasses(compiled.shaders, uvToWorld, time)
  )
  if (!ok) return false
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(gl.canvas, area.x, area.y, w / k, h / k)
  ctx.restore()
  return true
}

/** Forgets every graded picture (the shader library changed). */
export function clearGradedPictures(): void {
  pictureCache.clear()
  cachedPixels = 0
}
