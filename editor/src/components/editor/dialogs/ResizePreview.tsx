import { useEffect, useMemo, useRef, useState } from 'react'
import type { TilesetData } from '@/types/editor'
import type { SpriteAssetInfo } from '../../../../../shared/engine/types'
import { drawResolvedSprite, useSpriteImagesVersion } from '@/lib/spriteImages'
import { resolveImageItem } from '@/lib/imageItems'
import { sortedImages } from '@/lib/layerOrder'
import { TILE_SIZE, anchorToTile } from '../../../../../shared/engine/constants'
import { occupiedCells, type ResizableMap, type ResizeEdges } from '@/lib/mapResize'
import {
  HANDLES,
  edgesFromDrag,
  fitView,
  newRect,
  toScreenX,
  toScreenY,
  toWorldX,
  toWorldY,
  type Handle,
  type ResizeView,
} from '@/lib/mapResizeView'

interface Props {
  map: ResizableMap
  tilesets: TilesetData[]
  /** Sprites and pictures, so placed images show as themselves; without them they are blue markers. */
  spriteAssets?: Record<string, SpriteAssetInfo>
  edges: ResizeEdges
  onEdgesChange: (e: ResizeEdges) => void
}

const DEFAULT_SIZE = { w: 640, h: 420 }

const CURSORS: Record<Handle, string> = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
}

/** Loads the tileset images the map uses; `version` changes whenever another one arrives so the canvas redraws. */
function useTilesetImages(tilesets: TilesetData[], map: ResizableMap) {
  const images = useRef(new Map<string, HTMLImageElement>())
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const used = new Set<string>()
    for (const l of map.layers) for (const t of Object.values(l.data ?? {})) used.add(t.tilesetId)
    for (const ts of tilesets) {
      if (!used.has(ts.fileName) || images.current.has(ts.fileName)) continue
      const img = new Image()
      images.current.set(ts.fileName, img)
      img.onload = () => setVersion((v) => v + 1)
      img.src = ts.dataUrl
    }
  }, [tilesets, map.layers])
  return { images: images.current, version }
}

/** The stage of the resize dialog: the map drawn small, with a crop rectangle whose edges and corners can be dragged. */
export function ResizePreview({ map, tilesets, spriteAssets, edges, onEdgesChange }: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState(DEFAULT_SIZE)
  // While a handle is held the view stays put, otherwise the handle would run away from the pointer as the view refits.
  const [frozen, setFrozen] = useState<ResizeView | null>(null)
  const dragging = useRef<Handle | null>(null)
  const { images, version } = useTilesetImages(tilesets, map)
  const spriteVersion = useSpriteImagesVersion()
  const occupied = useMemo(() => occupiedCells(map), [map])

  useEffect(() => {
    const el = stageRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setSize({ w: Math.round(r.width), h: Math.round(r.height) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const view = frozen ?? fitView(map, edges, size.w, size.h)
  const rect = newRect(map, edges)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext?.('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size.w * dpr)
    canvas.height = Math.round(size.h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)
    ctx.imageSmoothingEnabled = false

    const sx = (x: number) => toScreenX(view, x)
    const sy = (y: number) => toScreenY(view, y)
    const s = view.scale
    const fill = (x0: number, y0: number, x1: number, y1: number, style: string) => {
      ctx.fillStyle = style
      ctx.fillRect(sx(x0), sy(y0), (x1 - x0) * s, (y1 - y0) * s)
    }

    // New ground (what the map becomes) and the old map's backdrop.
    fill(rect.x0, rect.y0, rect.x1, rect.y1, 'rgba(120,120,140,0.14)')
    fill(0, 0, map.width, map.height, 'rgba(0,0,0,0.35)')

    // Placed pictures that could not be drawn yet (or have no asset) stay as markers.
    const unresolved: { x: number; y: number }[] = []

    // Layers bottom first (the layer list is top first): tiles, and placed pictures at their real size.
    for (const layer of [...map.layers].reverse()) {
      if (!layer.visible) continue
      if (layer.type === 'image') {
        const k = s / TILE_SIZE
        for (const it of sortedImages(layer.images)) {
          const resolved = spriteAssets ? resolveImageItem(it, spriteAssets) : null
          if (!resolved) {
            unresolved.push(it)
            continue
          }
          ctx.save()
          ctx.translate(sx(0), sy(0))
          ctx.scale(k, k)
          drawResolvedSprite(ctx, resolved, { anchorX: it.x, anchorY: it.y, opacity: it.opacity, mirrorX: it.flipX, mirrorY: it.flipY })
          ctx.restore()
        }
        continue
      }
      if (layer.type !== 'tile') continue
      for (const [key, tile] of Object.entries(layer.data ?? {})) {
        const img = images.get(tile.tilesetId)
        if (!img || !img.complete || img.naturalWidth === 0) continue
        const idx = Number(key)
        const x = sx(idx % map.width)
        const y = sy(Math.floor(idx / map.width))
        ctx.drawImage(img, tile.x * TILE_SIZE, tile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE, x, y, s + 0.5, s + 0.5)
      }
    }

    // Entities (amber) and placed pictures (blue) as small markers.
    const marker = (px: number, py: number, color: string) => {
      const { col, row } = anchorToTile(px, py)
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.strokeRect(sx(col) + 2, sy(row) + 2, s - 4, s - 4)
    }
    for (const e of map.entities ?? []) marker(e.x, e.y, 'rgba(251,191,36,0.95)')
    for (const it of unresolved) marker(it.x, it.y, 'rgba(96,165,250,0.95)')

    // Faint tile grid over the new area.
    if (s >= 10) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = rect.x0; x <= rect.x1; x++) { ctx.moveTo(Math.round(sx(x)) + 0.5, sy(rect.y0)); ctx.lineTo(Math.round(sx(x)) + 0.5, sy(rect.y1)) }
      for (let y = rect.y0; y <= rect.y1; y++) { ctx.moveTo(sx(rect.x0), Math.round(sy(y)) + 0.5); ctx.lineTo(sx(rect.x1), Math.round(sy(y)) + 0.5) }
      ctx.stroke()
    }

    // The part of the old map that is cut off: dimmed, and cells that hold something are tinted red.
    const ix0 = Math.max(0, rect.x0), iy0 = Math.max(0, rect.y0)
    const ix1 = Math.min(map.width, rect.x1), iy1 = Math.min(map.height, rect.y1)
    ctx.save()
    ctx.beginPath()
    ctx.rect(sx(0), sy(0), map.width * s, map.height * s)
    if (ix1 > ix0 && iy1 > iy0) ctx.rect(sx(ix0), sy(iy0), (ix1 - ix0) * s, (iy1 - iy0) * s)
    ctx.clip('evenodd')
    fill(0, 0, map.width, map.height, 'rgba(10,10,14,0.68)')
    ctx.restore()
    ctx.fillStyle = 'rgba(239,68,68,0.6)'
    for (let i = 0; i < occupied.length; i++) {
      if (!occupied[i]) continue
      const x = i % map.width
      const y = Math.floor(i / map.width)
      if (x >= rect.x0 && x < rect.x1 && y >= rect.y0 && y < rect.y1) continue
      ctx.fillRect(sx(x), sy(y), s, s)
    }

    // Outline of the original map.
    ctx.setLineDash([5, 4])
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.lineWidth = 1
    ctx.strokeRect(sx(0) + 0.5, sy(0) + 0.5, map.width * s, map.height * s)
    ctx.setLineDash([])
  }, [map, view, size, rect.x0, rect.y0, rect.x1, rect.y1, occupied, images, version, spriteAssets, spriteVersion])

  const startDrag = (handle: Handle) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = handle
    setFrozen(fitView(map, edges, size.w, size.h))
  }
  const moveDrag = (e: React.PointerEvent) => {
    if (!dragging.current || !frozen || !stageRef.current) return
    const r = stageRef.current.getBoundingClientRect()
    const next = edgesFromDrag(
      dragging.current,
      toWorldX(frozen, e.clientX - r.left),
      toWorldY(frozen, e.clientY - r.top),
      map,
      edges
    )
    if (next.left !== edges.left || next.top !== edges.top || next.right !== edges.right || next.bottom !== edges.bottom) {
      onEdgesChange(next)
    }
  }
  const endDrag = () => {
    dragging.current = null
    setFrozen(null)
  }

  const left = toScreenX(view, rect.x0)
  const top = toScreenY(view, rect.y0)
  const width = (rect.x1 - rect.x0) * view.scale
  const height = (rect.y1 - rect.y0) * view.scale

  const handleStyle = (h: Handle): React.CSSProperties => {
    const bar = 10
    const corner = 14
    switch (h) {
      case 'n': return { left: corner / 2, top: -bar / 2, width: Math.max(0, width - corner), height: bar }
      case 's': return { left: corner / 2, bottom: -bar / 2, width: Math.max(0, width - corner), height: bar }
      case 'w': return { top: corner / 2, left: -bar / 2, height: Math.max(0, height - corner), width: bar }
      case 'e': return { top: corner / 2, right: -bar / 2, height: Math.max(0, height - corner), width: bar }
      case 'nw': return { top: -corner / 2, left: -corner / 2, width: corner, height: corner }
      case 'ne': return { top: -corner / 2, right: -corner / 2, width: corner, height: corner }
      case 'sw': return { bottom: -corner / 2, left: -corner / 2, width: corner, height: corner }
      case 'se': return { bottom: -corner / 2, right: -corner / 2, width: corner, height: corner }
    }
  }

  return (
    <div
      ref={stageRef}
      data-testid="resize-stage"
      className="relative h-[420px] w-full select-none overflow-hidden rounded-md border border-border bg-background"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ width: size.w, height: size.h }} />
      <div
        className="pointer-events-none absolute border-2 border-primary"
        style={{ left, top, width, height }}
        data-testid="resize-rect"
      >
        {HANDLES.map((h) => {
          const isCorner = h.length === 2
          return (
            <div
              key={h}
              role="slider"
              aria-label={`Drag ${h} edge`}
              data-handle={h}
              onPointerDown={startDrag(h)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className="pointer-events-auto absolute flex items-center justify-center"
              style={{ ...handleStyle(h), cursor: CURSORS[h], touchAction: 'none' }}
            >
              <span
                className={
                  isCorner
                    ? 'block h-3 w-3 rounded-[2px] border border-primary-foreground bg-primary'
                    : 'block rounded-full bg-primary ' + (h === 'n' || h === 's' ? 'h-1 w-8' : 'h-8 w-1')
                }
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
