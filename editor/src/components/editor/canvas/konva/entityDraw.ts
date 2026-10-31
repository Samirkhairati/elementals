// Canvas 2D drawing helpers for entity visuals. Plain functions over a CanvasRenderingContext2D so the
// entity nodes, the placement ghost and the overlays all draw the same way. Everything that must stay a
// fixed size on screen takes `scale` (the stage zoom) and divides by it; nothing here allocates per call
// except short-lived strings, so panning with many entities stays smooth.

import { ICON_PATHS } from '@/lib/iconPaths'
import type { Rect } from '@/lib/entityVisuals'

export const SOLID_RGB = '239,68,68'
export const TRIGGER_RGB = '45,212,191'
export const EVENT_RGB = '96,165,250'
export const MOVE_RGB = '52,211,153'

const pathCache = new Map<string, Path2D[]>()

function iconPaths(name: string): Path2D[] | null {
  if (typeof Path2D === 'undefined') return null
  let paths = pathCache.get(name)
  if (!paths) {
    const defs = ICON_PATHS[name]
    if (!defs) return null
    paths = defs.map((d) => new Path2D(d))
    pathCache.set(name, paths)
  }
  return paths
}

/** Draws a lucide icon (24x24 stroke icon) with its top-left at (x, y), `size` px wide. */
export function drawIcon(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, size: number, color: string, lineWidth = 2) {
  const paths = iconPaths(name)
  if (!paths) return
  const k = size / 24
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(k, k)
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const p of paths) ctx.stroke(p)
  ctx.restore()
}

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.arcTo(x + w, y, x + w, y + rr, rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr)
  ctx.lineTo(x + rr, y + h)
  ctx.arcTo(x, y + h, x, y + h - rr, rr)
  ctx.lineTo(x, y + rr)
  ctx.arcTo(x, y, x + rr, y, rr)
  ctx.closePath()
}

/**
 * The stand-in for an entity without a (loadable) sprite: an icon in a rounded tile on the entity's tile.
 * Origin = the entity anchor (bottom-centre of the tile).
 */
export function drawPlaceholder(ctx: CanvasRenderingContext2D, iconName: string, tone: 'default' | 'event' | 'trigger', alpha = 1) {
  ctx.save()
  ctx.globalAlpha *= alpha
  const rgb = tone === 'event' ? EVENT_RGB : tone === 'trigger' ? TRIGGER_RGB : '148,163,184'
  roundRectPath(ctx, -13, -29, 26, 26, 6)
  ctx.fillStyle = 'rgba(15,23,42,0.88)'
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = `rgba(${rgb},0.85)`
  ctx.stroke()
  drawIcon(ctx, iconName, -8, -24, 16, `rgba(${rgb},1)`, 2)
  ctx.restore()
}

/** Collider outline: solid = red fill + solid stroke, trigger = teal fill + dashed stroke. */
export function drawFootprint(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, solid: boolean, scale: number, strong: boolean) {
  const rgb = solid ? SOLID_RGB : TRIGGER_RGB
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.fillStyle = `rgba(${rgb},${strong ? 0.26 : 0.1})`
  ctx.fill()
  ctx.lineWidth = (strong ? 1.5 : 1) / scale
  ctx.strokeStyle = `rgba(${rgb},${strong ? 1 : 0.55})`
  if (!solid) ctx.setLineDash([5 / scale, 3 / scale])
  ctx.stroke()
  if (!solid) ctx.setLineDash([])
}

export function drawAnchorCross(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  const a = 5 / scale
  ctx.beginPath()
  ctx.moveTo(x - a, y)
  ctx.lineTo(x + a, y)
  ctx.moveTo(x, y - a)
  ctx.lineTo(x, y + a)
  ctx.lineWidth = 2.5 / scale
  ctx.strokeStyle = 'rgba(0,0,0,0.7)'
  ctx.stroke()
  ctx.lineWidth = 1.25 / scale
  ctx.strokeStyle = '#fbbf24'
  ctx.stroke()
}

/** Name pill centred on `cx`, sitting above `top` (all in map space, constant size on screen). */
export function drawLabel(ctx: CanvasRenderingContext2D, text: string, cx: number, top: number, scale: number, emphasis: 'selected' | 'hover' | 'plain') {
  const fs = 11 / scale
  ctx.font = `${fs}px "JetBrains Mono", ui-monospace, monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const padX = 6 / scale
  const h = 16 / scale
  const w = ctx.measureText(text).width + padX * 2
  const x = cx - w / 2
  const y = top - h - 4 / scale
  roundRectPath(ctx, x, y, w, h, 3 / scale)
  ctx.fillStyle = emphasis === 'plain' ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.88)'
  ctx.fill()
  ctx.lineWidth = 1 / scale
  ctx.strokeStyle = emphasis === 'selected' ? 'rgba(255,255,255,0.95)' : emphasis === 'hover' ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)'
  ctx.stroke()
  ctx.fillStyle = emphasis === 'plain' ? 'rgba(255,255,255,0.75)' : '#ffffff'
  ctx.fillText(text, cx, y + h / 2 + 0.5 / scale)
}

/** Small round-rect badge with an icon, top-left at (x, y), 16 screen px. */
export function drawBadge(ctx: CanvasRenderingContext2D, icon: string, x: number, y: number, scale: number, rgb: string) {
  const s = 16 / scale
  roundRectPath(ctx, x, y, s, s, 4 / scale)
  ctx.fillStyle = 'rgba(10,14,24,0.92)'
  ctx.fill()
  ctx.lineWidth = 1 / scale
  ctx.strokeStyle = `rgba(${rgb},0.95)`
  ctx.stroke()
  drawIcon(ctx, icon, x + 3 / scale, y + 3 / scale, 10 / scale, `rgba(${rgb},1)`, 2.4)
}

/** Selection frame: thin white outline with L-shaped corner ticks. */
export function drawSelectionFrame(ctx: CanvasRenderingContext2D, r: Rect, scale: number) {
  ctx.lineWidth = 1 / scale
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.setLineDash([3 / scale, 3 / scale])
  ctx.strokeRect(r.x, r.y, r.w, r.h)
  ctx.setLineDash([])
  const t = Math.min(6 / scale, r.w / 3, r.h / 3)
  ctx.lineWidth = 2 / scale
  ctx.strokeStyle = '#ffffff'
  ctx.beginPath()
  const { x, y, w, h } = r
  ctx.moveTo(x, y + t)
  ctx.lineTo(x, y)
  ctx.lineTo(x + t, y)
  ctx.moveTo(x + w - t, y)
  ctx.lineTo(x + w, y)
  ctx.lineTo(x + w, y + t)
  ctx.moveTo(x + w, y + h - t)
  ctx.lineTo(x + w, y + h)
  ctx.lineTo(x + w - t, y + h)
  ctx.moveTo(x + t, y + h)
  ctx.lineTo(x, y + h)
  ctx.lineTo(x, y + h - t)
  ctx.stroke()
}

export function drawHoverFrame(ctx: CanvasRenderingContext2D, r: Rect, scale: number) {
  roundRectPath(ctx, r.x, r.y, r.w, r.h, 3 / scale)
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.fill()
  ctx.lineWidth = 1 / scale
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.stroke()
}

/** Dashed ring showing the roaming area of a wandering entity (radius in tiles around its tile centre). */
export function drawWanderRing(ctx: CanvasRenderingContext2D, anchorX: number, anchorY: number, radiusTiles: number, scale: number) {
  const r = radiusTiles * 32 + 16
  ctx.beginPath()
  ctx.arc(anchorX, anchorY - 16, r, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(${MOVE_RGB},0.07)`
  ctx.fill()
  ctx.lineWidth = 1.5 / scale
  ctx.strokeStyle = `rgba(${MOVE_RGB},0.85)`
  ctx.setLineDash([6 / scale, 4 / scale])
  ctx.stroke()
  ctx.setLineDash([])
}

/** Resize handle square (8 screen px) centred on (x, y). */
export function drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, solid: boolean) {
  const s = 8 / scale
  ctx.beginPath()
  ctx.rect(x - s / 2, y - s / 2, s, s)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.lineWidth = 1.5 / scale
  ctx.strokeStyle = `rgb(${solid ? SOLID_RGB : TRIGGER_RGB})`
  ctx.stroke()
}

/** Size read-out next to a rect while dragging, e.g. "32x32  offset 0,0". */
export function drawReadout(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number) {
  const fs = 11 / scale
  ctx.font = `${fs}px "JetBrains Mono", ui-monospace, monospace`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const padX = 6 / scale
  const h = 18 / scale
  const w = ctx.measureText(text).width + padX * 2
  roundRectPath(ctx, x, y, w, h, 3 / scale)
  ctx.fillStyle = 'rgba(0,0,0,0.88)'
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, x + padX, y + h / 2 + 0.5 / scale)
}
