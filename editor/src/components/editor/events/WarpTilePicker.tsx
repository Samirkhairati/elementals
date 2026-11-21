// A small preview of the warp's destination map: its tiles and pictures (lib/mapScenery.ts, the same drawing as the resize
// preview), the entities' sprites and a tile grid. Hovering highlights the tile under the cursor (or, with Snap to tiles
// off, the exact pixel), clicking it sets the warp position.

import { useEffect, useMemo, useRef, useState } from 'react'
import { TILE_SIZE } from '../../../../../shared/engine/constants'
import { useTilesetImages } from '@/hooks/editor/useTilesetImages'
import { drawResolvedSprite, resolveSprite, useSpriteImagesVersion } from '@/lib/spriteImages'
import { drawMapScenery } from '@/lib/mapScenery'
import { prepareCanvas } from '@/lib/canvas2d'
import type { EntityData, MapData } from '@/types/editor'
import { drawPlan, sceneIndex } from '@/lib/sceneIndex'
import { useEventEnv } from './eventEnv'

/** Longest side of the preview in CSS px; a cell is at least 4px so big maps stay legible when scrolled. */
const MAX_PREVIEW = 300
const MIN_CELL = 4
const MAX_CELL = 32
/** Longest side of the full-size picture of the map the preview is shrunk from (bigger maps are drawn smaller first). */
const MAX_SOURCE_PX = 4096

/**
 * The size of one tile in the preview, CSS px. Where a tile is shown at 32 device pixels or more, a whole multiple of
 * 32 device pixels, so the pixel art is copied pixel for pixel (sharp) instead of stretched by an odd factor.
 */
export function previewCellSize(map: Pick<MapData, 'width' | 'height'>, dpr = 1): number {
  const longest = Math.max(map.width, map.height, 1)
  const fit = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(MAX_PREVIEW / longest)))
  const device = fit * dpr
  if (device < TILE_SIZE) return fit
  // The nearest whole multiple, unless that makes the preview much wider than it should be.
  let m = Math.max(1, Math.round(device / TILE_SIZE))
  if (m > 1 && ((m * TILE_SIZE) / dpr) * longest > MAX_PREVIEW * 1.15) m--
  return (m * TILE_SIZE) / dpr
}

/** The tile under a pointer position inside the preview, or null when it is outside the map. */
export function tileAt(map: Pick<MapData, 'width' | 'height'>, clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): { col: number; row: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null
  const col = Math.floor(((clientX - rect.left) / rect.width) * map.width)
  const row = Math.floor(((clientY - rect.top) / rect.height) * map.height)
  return col >= 0 && row >= 0 && col < map.width && row < map.height ? { col, row } : null
}

/** The map pixel under a pointer position (whole pixels, the bottom and right edge included), or null when it is outside the map. */
export function pixelAt(map: Pick<MapData, 'width' | 'height'>, clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null
  const fx = (clientX - rect.left) / rect.width
  const fy = (clientY - rect.top) / rect.height
  if (fx < 0 || fy < 0 || fx > 1 || fy > 1) return null
  return { x: Math.round(fx * map.width * TILE_SIZE), y: Math.round(fy * map.height * TILE_SIZE) }
}

interface Props {
  mapId: string
  /** Current warp position: a tile (column, row), or pixels when `free`. */
  x: number
  y: number
  /** Pixel positions (Snap to tiles off): hover and click work on pixels, and `onPick` gets pixels. */
  free?: boolean
  onPick: (x: number, y: number) => void
}

export function WarpTilePicker({ mapId, x, y, free = false, onPick }: Props) {
  const env = useEventEnv()
  const preview = env.mapPreview
  const map = mapId ? preview?.getMap(mapId) : undefined
  const tilesets = useMemo(() => preview?.tilesets ?? [], [preview])
  const images = useTilesetImages(tilesets)
  const spriteVersion = useSpriteImagesVersion()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<{ col: number; row: number } | null>(null)
  const [hoverPx, setHoverPx] = useState<{ x: number; y: number } | null>(null)

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const cell = map ? previewCellSize(map, dpr) : MIN_CELL
  const width = map ? map.width * cell : 0
  const height = map ? map.height * cell : 0

  useEffect(() => {
    const ctx = map && canvasRef.current ? prepareCanvas(canvasRef.current, width, height) : null
    if (!map || !ctx) return
    ctx.fillStyle = '#16181d'
    ctx.fillRect(0, 0, width, height)

    // The map is drawn once at full size (pixel for pixel, sharp), then copied into the preview in one step: shrunk with
    // proper filtering, or enlarged by a whole factor with smoothing off. Scaling every tile on its own instead is what
    // made the preview blurry (and seamed) on high-density screens.
    const mapW = map.width * TILE_SIZE
    const mapH = map.height * TILE_SIZE
    const k0 = Math.min(1, MAX_SOURCE_PX / Math.max(mapW, mapH, 1))
    const source = typeof document !== 'undefined' ? document.createElement('canvas') : null
    const sctx = source?.getContext?.('2d') ?? null
    if (source && sctx) {
      source.width = Math.max(1, Math.round(mapW * k0))
      source.height = Math.max(1, Math.round(mapH * k0))
      sctx.imageSmoothingEnabled = k0 < 1
      sctx.scale(k0, k0)
      // Tiles and pictures, bottom layer first, at map pixels (the same drawing as the resize preview).
      drawMapScenery(sctx, map, { tileImages: { get: (id) => images[id] }, assets: preview?.spriteAssets, smooth: k0 < 1 })
      // Entities: their sprite, or a dot where they stand.
      for (const entity of drawPlan(sceneIndex(map.nodes)).entities as unknown as EntityData[]) {
        const sprite = entity.components.Sprite
        const asset = sprite && typeof sprite.asset === 'string' && sprite.asset ? env.getSpriteAsset(sprite.asset) : undefined
        const resolved = asset ? resolveSprite(asset, sprite ?? {}, 0) : null
        if (resolved) {
          drawResolvedSprite(sctx, resolved, { anchorX: entity.x, anchorY: entity.y, opacity: sprite?.opacity, tint: sprite?.tint || undefined, rotation: entity.rotation, smooth: k0 < 1 })
        } else {
          sctx.fillStyle = 'rgba(96,165,250,0.85)'
          sctx.beginPath()
          sctx.arc(entity.x, entity.y, TILE_SIZE / 6, 0, Math.PI * 2)
          sctx.fill()
        }
      }
      const shrinking = width * dpr < source.width
      ctx.imageSmoothingEnabled = shrinking
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, width, height)
    }

    // Tile grid: one device pixel wide lines on the cell edges.
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'
    ctx.lineWidth = 1 / dpr
    ctx.beginPath()
    for (let c = 0; c <= map.width; c++) {
      ctx.moveTo(c * cell, 0)
      ctx.lineTo(c * cell, height)
    }
    for (let r = 0; r <= map.height; r++) {
      ctx.moveTo(0, r * cell)
      ctx.lineTo(width, r * cell)
    }
    ctx.stroke()
  }, [map, images, cell, width, height, env, preview, spriteVersion, dpr])

  if (!preview) return null
  if (!mapId) return <p className="rounded border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">Choose a map to pick a tile on it.</p>
  if (!map) return <p className="rounded border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">Map "{mapId}" was not found.</p>

  const selected = !free && x >= 0 && y >= 0 && x < map.width && y < map.height ? { col: x, row: y } : null
  const selectedPx = free && x >= 0 && y >= 0 && x <= map.width * TILE_SIZE && y <= map.height * TILE_SIZE ? { x, y } : null
  const box = (t: { col: number; row: number }) => ({ left: t.col * cell, top: t.row * cell, width: cell, height: cell })
  // A pixel position as a small ring at the feet, in preview pixels.
  const ring = (p: { x: number; y: number }, size = 10) => ({ left: (p.x * cell) / TILE_SIZE - size / 2, top: (p.y * cell) / TILE_SIZE - size / 2, width: size, height: size })

  const move = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (free) {
      const p = pixelAt(map, e.clientX, e.clientY, rect)
      setHoverPx((h) => (h?.x === p?.x && h?.y === p?.y ? h : p))
    } else {
      const t = tileAt(map, e.clientX, e.clientY, rect)
      setHover((h) => (h?.col === t?.col && h?.row === t?.row ? h : t))
    }
  }
  const leave = () => {
    setHover(null)
    setHoverPx(null)
  }
  const pick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (free) {
      const p = pixelAt(map, e.clientX, e.clientY, rect)
      if (p) onPick(p.x, p.y)
    } else {
      const t = tileAt(map, e.clientX, e.clientY, rect)
      if (t) onPick(t.col, t.row)
    }
  }
  const status = free
    ? hoverPx
      ? `Click to warp to (${hoverPx.x}, ${hoverPx.y}) px`
      : selectedPx
        ? `Warps to (${selectedPx.x}, ${selectedPx.y}) px`
        : `(${x}, ${y}) px is outside this ${map.width * TILE_SIZE}×${map.height * TILE_SIZE} px map`
    : hover
      ? `Click to warp to tile (${hover.col}, ${hover.row})`
      : selected
        ? `Warps to tile (${selected.col}, ${selected.row})`
        : `Tile (${x}, ${y}) is outside this ${map.width}×${map.height} map`

  return (
    <div className="space-y-1.5" data-testid="warp-tile-picker">
      <div className="max-h-[280px] overflow-auto rounded-md border border-border bg-black/30 p-1.5">
        <div className="relative mx-auto cursor-crosshair" style={{ width, height }} onMouseMove={move} onMouseLeave={leave} onClick={pick}>
          <canvas ref={canvasRef} style={{ width, height }} className="block" aria-label={`Preview of ${map.name}`} role="img" />
          {selected && <div className="pointer-events-none absolute border-2 border-emerald-400 bg-emerald-400/25" style={box(selected)} data-testid="warp-selected-tile" />}
          {selectedPx && <div className="pointer-events-none absolute rounded-full border-2 border-emerald-400 bg-emerald-400/40" style={ring(selectedPx)} data-testid="warp-selected-point" />}
          {hover && <div className="pointer-events-none absolute border-2 border-white bg-white/25" style={box(hover)} data-testid="warp-hover-tile" />}
          {hoverPx && <div className="pointer-events-none absolute rounded-full border-2 border-white bg-white/30" style={ring(hoverPx)} data-testid="warp-hover-point" />}
        </div>
      </div>
      <p className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>{status}</span>
        <span className="shrink-0 font-mono">{map.width}×{map.height} tiles</span>
      </p>
    </div>
  )
}
