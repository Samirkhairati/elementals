// A small preview of the warp's destination map: its tiles, the entities' sprites and a tile grid.
// Hovering highlights the tile under the cursor, clicking it sets the warp tile.

import { useEffect, useMemo, useRef, useState } from 'react'
import { TILE_SIZE } from '../../../../../shared/engine/constants'
import { useTilesetImages } from '@/hooks/editor/useTilesetImages'
import { drawResolvedSprite, resolveSprite, useSpriteImagesVersion } from '@/lib/spriteImages'
import type { MapData } from '@/types/editor'
import { useEventEnv } from './eventEnv'

/** Longest side of the preview in CSS px; a cell is at least 4px so big maps stay legible when scrolled. */
const MAX_PREVIEW = 300
const MIN_CELL = 4
const MAX_CELL = 20

export function previewCellSize(map: Pick<MapData, 'width' | 'height'>): number {
  const longest = Math.max(map.width, map.height, 1)
  return Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(MAX_PREVIEW / longest)))
}

/** The tile under a pointer position inside the preview, or null when it is outside the map. */
export function tileAt(map: Pick<MapData, 'width' | 'height'>, clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): { col: number; row: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null
  const col = Math.floor(((clientX - rect.left) / rect.width) * map.width)
  const row = Math.floor(((clientY - rect.top) / rect.height) * map.height)
  return col >= 0 && row >= 0 && col < map.width && row < map.height ? { col, row } : null
}

interface Props {
  mapId: string
  /** Current warp tile. */
  x: number
  y: number
  onPick: (col: number, row: number) => void
}

export function WarpTilePicker({ mapId, x, y, onPick }: Props) {
  const env = useEventEnv()
  const preview = env.mapPreview
  const map = mapId ? preview?.getMap(mapId) : undefined
  const tilesets = useMemo(() => preview?.tilesets ?? [], [preview])
  const images = useTilesetImages(tilesets)
  const spriteVersion = useSpriteImagesVersion()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<{ col: number; row: number } | null>(null)

  const cell = map ? previewCellSize(map) : MIN_CELL
  const width = map ? map.width * cell : 0
  const height = map ? map.height * cell : 0

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!map || !canvas || !ctx) return
    // Draw at the screen's pixel density, so nothing is stretched (a plain canvas looks soft on retina screens).
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(width * dpr))
    canvas.height = Math.max(1, Math.round(height * dpr))
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const k = cell / TILE_SIZE
    // Shrinking a 32 px tile to a few pixels: smooth it properly. Smoothing off would drop pixels and look noisy; at
    // full size (or larger) keep the pixel art sharp.
    ctx.imageSmoothingEnabled = cell < TILE_SIZE
    ctx.imageSmoothingQuality = 'high'
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#16181d'
    ctx.fillRect(0, 0, width, height)

    // Bottom layer first, like the map canvas; the collision overlay is not scenery.
    for (const layer of map.layers.slice().reverse()) {
      if (!layer.visible || !layer.data) continue
      for (const [index, tile] of Object.entries(layer.data)) {
        if (tile.tilesetId === '__collision__') continue
        const img = images[tile.tilesetId]
        if (!img || !img.complete || img.naturalWidth === 0) continue
        const i = Number(index)
        const col = i % map.width
        const row = Math.floor(i / map.width)
        ctx.drawImage(img, tile.x * TILE_SIZE, tile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE, col * cell, row * cell, cell, cell)
      }
    }

    // Entities: their sprite, or a dot where they stand.
    for (const entity of map.entities ?? []) {
      if (entity.visible === false) continue
      const sprite = entity.components.Sprite
      const asset = sprite && typeof sprite.asset === 'string' && sprite.asset ? env.getSpriteAsset(sprite.asset) : undefined
      const resolved = asset ? resolveSprite(asset, sprite ?? {}, 0) : null
      ctx.save()
      ctx.scale(k, k)
      if (resolved) {
        drawResolvedSprite(ctx, resolved, { anchorX: entity.x, anchorY: entity.y, opacity: sprite?.opacity, tint: sprite?.tint || undefined })
      } else {
        ctx.fillStyle = 'rgba(96,165,250,0.85)'
        ctx.beginPath()
        ctx.arc(entity.x, entity.y - TILE_SIZE / 2, TILE_SIZE / 4, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
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
  }, [map, images, cell, width, height, env, spriteVersion])

  if (!preview) return null
  if (!mapId) return <p className="rounded border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">Choose a map to pick a tile on it.</p>
  if (!map) return <p className="rounded border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">Map "{mapId}" was not found.</p>

  const selected = x >= 0 && y >= 0 && x < map.width && y < map.height ? { col: x, row: y } : null
  const box = (t: { col: number; row: number }) => ({ left: t.col * cell, top: t.row * cell, width: cell, height: cell })

  return (
    <div className="space-y-1.5" data-testid="warp-tile-picker">
      <div className="max-h-[280px] overflow-auto rounded-md border border-border bg-black/30 p-1.5">
        <div
          className="relative mx-auto cursor-crosshair"
          style={{ width, height }}
          onMouseMove={(e) => {
            const t = tileAt(map, e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
            setHover((h) => (h?.col === t?.col && h?.row === t?.row ? h : t))
          }}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => {
            const t = tileAt(map, e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
            if (t) onPick(t.col, t.row)
          }}
        >
          <canvas ref={canvasRef} style={{ width, height }} className="block" aria-label={`Preview of ${map.name}`} role="img" />
          {selected && <div className="pointer-events-none absolute border-2 border-emerald-400 bg-emerald-400/25" style={box(selected)} data-testid="warp-selected-tile" />}
          {hover && <div className="pointer-events-none absolute border-2 border-white bg-white/25" style={box(hover)} data-testid="warp-hover-tile" />}
        </div>
      </div>
      <p className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>{hover ? `Click to warp to tile (${hover.col}, ${hover.row})` : selected ? `Warps to tile (${selected.col}, ${selected.row})` : `Tile (${x}, ${y}) is outside this ${map.width}×${map.height} map`}</span>
        <span className="shrink-0 font-mono">{map.width}×{map.height} tiles</span>
      </p>
    </div>
  )
}
