// A zoomed, pixel-perfect view of ONE entity around its anchor: tile grid, the sprite exactly as the
// game draws it, the anchor cross and (optionally) the collider with draggable handles. Used by the
// Sprite and Collider component editors so both show the same picture.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ColliderProps, SpriteAssetInfo, SpriteProps } from '../../../../../shared/engine/types'
import { TILE_SIZE } from '../../../../../shared/engine/constants'
import { previewFrame } from '../../../../../shared/engine/sprites'
import {
  COLLIDER_SNAP,
  HANDLES,
  TILE_RECT_LOCAL,
  colliderLocalRect,
  formatColliderRect,
  handleCursor,
  handlePoint,
  moveRect,
  rectToColliderProps,
  resizeRect,
  sameCollider,
  snapTo,
  spriteLocalRect,
  unionRect,
  type ColliderPatch,
  type Handle,
  type Rect,
} from '@/lib/entityVisuals'
import { drawResolvedSprite, resolveSprite, useSpriteImagesVersion } from '@/lib/spriteImages'
import { ZoomControls } from '../ui/controls'

export const VIEWPORT_HEIGHT = 200
const MIN_ZOOM = 0.5
const MAX_ZOOM = 16
const ZOOM_STEP = 1.25
const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))
/** Share of the viewport height above the anchor (the rest is room for sprites hanging below it). */
const ANCHOR_RATIO = 0.76
const DEFAULT_WIDTH = 280

type SpriteView = Pick<SpriteProps, 'facing' | 'animation' | 'frame' | 'offsetX' | 'offsetY' | 'scale' | 'flipX' | 'tint' | 'opacity'>

export interface EntityViewportProps {
  asset?: SpriteAssetInfo
  sprite?: Partial<SpriteView>
  /** Animation clock in ms. */
  tick?: number
  /** Starting zoom: a factor, or 'fit' (default) for the largest whole-number zoom that shows the tile and the sprite.
   *  The user changes it with Ctrl/Cmd + scroll (or pinch), the +/- buttons, and resets it with Fit. */
  zoom?: number | 'fit'
  height?: number
  showTileGrid?: boolean
  showAnchor?: boolean
  showSpriteFrame?: boolean
  showPivot?: boolean
  collider?: ColliderProps | null
  /** Handles + body drag on the collider; commits once per gesture. */
  onColliderChange?: (patch: ColliderPatch) => void
  /** Drag the sprite to change its offset; commits once per gesture. */
  onSpriteOffsetChange?: (offsetX: number, offsetY: number) => void
  /** 1px normally, 8px with Shift. */
  className?: string
  children?: React.ReactNode
}

type Gesture =
  | { kind: 'collider'; handle: Handle | 'body'; startPointer: { x: number; y: number }; startRect: Rect }
  | { kind: 'sprite'; startPointer: { x: number; y: number }; startOffset: { x: number; y: number } }

/** Largest integer zoom at which the tile and sprite fit around the anchor. */
export function fitViewportZoom(bounds: Rect, width: number, height: number, anchorY: number, max = 6): number {
  const pad = 10
  const left = Math.max(Math.abs(bounds.x), Math.abs(bounds.x + bounds.w), 1)
  const above = Math.max(-bounds.y, 1)
  const below = Math.max(bounds.y + bounds.h, 0)
  let z = Math.min((width / 2 - pad) / left, (anchorY - pad) / above)
  if (below > 0) z = Math.min(z, (height - anchorY - pad) / below)
  return Math.max(1, Math.min(max, Math.floor(z)))
}

export function EntityViewport({
  asset,
  sprite,
  tick = 0,
  zoom: zoomProp = 'fit',
  height = VIEWPORT_HEIGHT,
  showTileGrid = true,
  showAnchor = true,
  showSpriteFrame = false,
  showPivot = false,
  collider = null,
  onColliderChange,
  onSpriteOffsetChange,
  className,
  children,
}: EntityViewportProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const imagesVersion = useSpriteImagesVersion()

  // Live values while a gesture runs; the parent only hears about the final value (one undo step).
  const [liveOffset, setLiveOffset] = useState<{ x: number; y: number } | null>(null)
  const [liveRect, setLiveRect] = useState<Rect | null>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  // Zoom (null = fitted) and pan are the viewer's own; they only affect this preview.
  const [userZoom, setUserZoom] = useState<number | null>(zoomProp === 'fit' ? null : zoomProp)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const ax0 = Math.round(width / 2)
  const ay0 = Math.round(height * ANCHOR_RATIO)
  const ax = ax0 + pan.x
  const ay = ay0 + pan.y
  const fitZoom = useMemo(() => {
    const base = asset && sprite ? unionRect(TILE_RECT_LOCAL, spriteLocalRect(asset.meta, { ...sprite, offsetX: sprite.offsetX ?? 0, offsetY: sprite.offsetY ?? 0 })) : TILE_RECT_LOCAL
    return fitViewportZoom(base, width, height, ay0)
  }, [asset, sprite, width, height, ay0])
  const zoom = userZoom ?? fitZoom
  const fitted = userZoom === null && pan.x === 0 && pan.y === 0
  const view = useRef({ zoom, ax, ay })
  view.current = { zoom, ax, ay }
  const resetView = () => {
    setUserZoom(null)
    setPan({ x: 0, y: 0 })
  }
  /** Zoom to `next`, keeping the point at (px, py) (viewport pixels) where it is. */
  const zoomAround = useCallback((next: number, px: number, py: number) => {
    const v = view.current
    const z = clampZoom(next)
    const wx = (px - v.ax) / v.zoom
    const wy = (py - v.ay) / v.zoom
    setUserZoom(z)
    setPan((p) => ({ x: p.x + (px - wx * z - v.ax), y: p.y + (py - wy * z - v.ay) }))
  }, [])
  const toX = (x: number) => ax + x * zoom
  const toY = (y: number) => ay + y * zoom

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width)
      if (w > 0) setWidth((prev) => (prev === w ? prev : w))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => () => cleanupRef.current?.(), [])

  // Ctrl/Cmd + scroll (this is also what a trackpad pinch sends) zooms around the pointer. A plain scroll is left
  // alone so the inspector keeps scrolling when the pointer happens to be over the preview.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const box = el.getBoundingClientRect()
      zoomAround(view.current.zoom * Math.exp(-e.deltaY * 0.01), e.clientX - box.left, e.clientY - box.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAround])

  // Middle-drag (or Alt-drag) pans.
  const beginPan = (e: React.MouseEvent) => {
    if (!(e.button === 1 || (e.button === 0 && e.altKey))) return
    e.preventDefault()
    e.stopPropagation()
    let lx = e.clientX
    let ly = e.clientY
    const move = (ev: MouseEvent) => {
      const dx = ev.clientX - lx
      const dy = ev.clientY - ly
      lx = ev.clientX
      ly = ev.clientY
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }))
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const effSprite = useMemo(() => {
    if (!sprite) return undefined
    return { ...sprite, ...(liveOffset ? { offsetX: liveOffset.x, offsetY: liveOffset.y } : null) }
  }, [sprite, liveOffset])

  // Which frame of which sheet the preview shows (independent of whether the image has decoded yet).
  const frameChoice = useMemo(() => (asset && effSprite ? previewFrame(asset.meta, { facing: effSprite.facing ?? 'down', animation: effSprite.animation ?? '', frame: effSprite.frame ?? 0 }, tick) : null), [asset, effSprite, tick])

  const frameInfo = useMemo(() => {
    void imagesVersion
    return asset && effSprite ? resolveSprite(asset, effSprite, tick) : null
  }, [asset, effSprite, tick, imagesVersion])

  // ── draw the sprite ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    if (!frameInfo || !effSprite) return
    ctx.save()
    ctx.translate(ax, ay)
    ctx.scale(zoom, zoom)
    drawResolvedSprite(ctx, frameInfo, {
      anchorX: 0,
      anchorY: 0,
      opacity: effSprite.opacity,
      tint: effSprite.tint || undefined,
    })
    ctx.restore()
  }, [frameInfo, effSprite, zoom, width, height, ax, ay])

  // ── geometry ──────────────────────────────────────────────────────────────
  const spriteRect = useMemo(
    () => (asset && effSprite ? spriteLocalRect(asset.meta, effSprite) : null),
    [asset, effSprite],
  )
  const colliderRect = liveRect ?? (collider ? colliderLocalRect(collider) : null)
  const liveCollider: ColliderPatch | null = liveRect ? rectToColliderProps(liveRect) : null

  const toLocal = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const box = rootRef.current?.getBoundingClientRect()
      const left = box?.left ?? 0
      const top = box?.top ?? 0
      return { x: (e.clientX - left - ax) / zoom, y: (e.clientY - top - ay) / zoom }
    },
    [ax, ay, zoom],
  )

  const startGesture = (g: Gesture, onMove: (g: Gesture, p: { x: number; y: number }, e: MouseEvent) => void, onEnd: (g: Gesture, p: { x: number; y: number }, e: MouseEvent) => void, onCancel: () => void) => {
    cleanupRef.current?.()
    gestureRef.current = g
    let last = g.startPointer
    const move = (e: MouseEvent) => {
      last = toLocal(e)
      onMove(g, last, e)
    }
    const up = (e: MouseEvent) => {
      last = toLocal(e)
      stop()
      onEnd(g, last, e)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        stop()
        onCancel()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        stop()
        onEnd(g, last, e as unknown as MouseEvent)
      }
    }
    const stop = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('keydown', key, true)
      gestureRef.current = null
      cleanupRef.current = null
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    window.addEventListener('keydown', key, true)
    cleanupRef.current = stop
  }

  const beginColliderGesture = (handle: Handle | 'body') => (e: React.MouseEvent) => {
    if (e.button !== 0 || !colliderRect || !onColliderChange) return
    e.preventDefault()
    e.stopPropagation()
    const start = toLocal(e)
    const startRect = colliderRect
    const compute = (g: Gesture, p: { x: number; y: number }, ev: { shiftKey?: boolean; altKey?: boolean }): Rect => {
      if (g.kind !== 'collider') return startRect
      const dx = p.x - g.startPointer.x
      const dy = p.y - g.startPointer.y
      const step = ev.shiftKey ? 0 : COLLIDER_SNAP
      return g.handle === 'body'
        ? moveRect(g.startRect, dx, dy, { step })
        : resizeRect(g.startRect, g.handle, dx, dy, { step, fromCenter: !!ev.altKey })
    }
    startGesture(
      { kind: 'collider', handle, startPointer: start, startRect },
      (g, p, ev) => setLiveRect(compute(g, p, ev)),
      (g, p, ev) => {
        const next = rectToColliderProps(compute(g, p, ev))
        setLiveRect(null)
        // A click without a change must not create an undo step.
        if (!collider || !sameCollider(next, collider)) onColliderChange(next)
      },
      () => setLiveRect(null),
    )
    setLiveRect(startRect)
  }

  const beginSpriteGesture = (e: React.MouseEvent) => {
    if (e.button !== 0 || !onSpriteOffsetChange || !sprite) return
    e.preventDefault()
    const start = toLocal(e)
    const startOffset = { x: sprite.offsetX ?? 0, y: sprite.offsetY ?? 0 }
    const compute = (p: { x: number; y: number }, ev: { shiftKey?: boolean }) => {
      const step = ev.shiftKey ? 8 : 1
      return { x: snapTo(startOffset.x + p.x - start.x, step), y: snapTo(startOffset.y + p.y - start.y, step) }
    }
    startGesture(
      { kind: 'sprite', startPointer: start, startOffset },
      (_g, p, ev) => setLiveOffset(compute(p, ev)),
      (_g, p, ev) => {
        const next = compute(p, ev)
        setLiveOffset(null)
        if (next.x !== startOffset.x || next.y !== startOffset.y) onSpriteOffsetChange(next.x, next.y)
      },
      () => setLiveOffset(null),
    )
    setLiveOffset(startOffset)
  }

  // ── grid lines (tile boundaries centred on the anchor tile) ────────────────
  const gridLines = useMemo(() => {
    if (!showTileGrid) return null
    const lines: React.ReactNode[] = []
    const half = TILE_SIZE / 2
    const minX = -ax / zoom
    const maxX = (width - ax) / zoom
    const minY = -ay / zoom
    const maxY = (height - ay) / zoom
    // Tile columns start at x = -16 + 32k, rows at y = 32m (the anchor sits on the bottom edge of its tile).
    for (let k = Math.ceil((minX + half) / TILE_SIZE); k <= Math.floor((maxX + half) / TILE_SIZE); k++) {
      const sx = Math.round(ax + (k * TILE_SIZE - half) * zoom) + 0.5
      lines.push(<line key={`v${k}`} x1={sx} x2={sx} y1={0} y2={height} />)
    }
    for (let m = Math.ceil(minY / TILE_SIZE); m <= Math.floor(maxY / TILE_SIZE); m++) {
      const sy = Math.round(ay + m * TILE_SIZE * zoom) + 0.5
      lines.push(<line key={`h${m}`} x1={0} x2={width} y1={sy} y2={sy} />)
    }
    return lines
  }, [showTileGrid, ax, ay, zoom, width, height])

  const interactiveCollider = !!onColliderChange && !!colliderRect
  const solid = collider?.isSolid !== false
  const colorVar = solid ? 'var(--solid)' : 'var(--trigger)'

  return (
    <div
      ref={rootRef}
      className={`relative select-none overflow-hidden rounded-md border border-border ed-checker ${className ?? ''}`}
      style={{ height }}
      data-testid="entity-viewport"
      onMouseDownCapture={beginPan}
      data-zoom={zoom}
      data-anchor-x={ax}
      data-anchor-y={ay}
      data-width={width}
      data-frame={frameInfo ? `${frameInfo.src.x},${frameInfo.src.y},${frameInfo.src.w},${frameInfo.src.h}` : ''}
      data-frame-index={frameChoice ? frameChoice.frameIndex : ''}
      data-sheet={frameChoice ? frameChoice.sheetFile : ''}
    >
      {/* tile grid under the sprite */}
      <svg className="pointer-events-none absolute inset-0" width={width} height={height} shapeRendering="crispEdges">
        <g stroke="hsl(0 0% 100% / 0.1)" strokeWidth={1}>
          {gridLines}
        </g>
        {showTileGrid && (
          <rect
            x={toX(TILE_RECT_LOCAL.x)}
            y={toY(TILE_RECT_LOCAL.y)}
            width={TILE_RECT_LOCAL.w * zoom}
            height={TILE_RECT_LOCAL.h * zoom}
            fill="hsl(0 0% 100% / 0.05)"
            stroke="hsl(0 0% 100% / 0.28)"
            strokeDasharray="3 3"
          />
        )}
      </svg>

      <canvas ref={canvasRef} className="ed-pixelated pointer-events-none absolute inset-0" style={{ width, height }} />

      <svg className="absolute inset-0" width={width} height={height} shapeRendering="crispEdges">
        {/* sprite frame outline + drag area */}
        {spriteRect && showSpriteFrame && (
          <rect
            x={toX(spriteRect.x)}
            y={toY(spriteRect.y)}
            width={spriteRect.w * zoom}
            height={spriteRect.h * zoom}
            fill="none"
            stroke="hsl(var(--accent-violet) / 0.6)"
            strokeDasharray="2 2"
            pointerEvents="none"
          />
        )}
        {spriteRect && onSpriteOffsetChange && (
          <rect
            data-testid="sprite-drag-area"
            x={toX(spriteRect.x)}
            y={toY(spriteRect.y)}
            width={spriteRect.w * zoom}
            height={spriteRect.h * zoom}
            fill="transparent"
            style={{ cursor: 'move' }}
            onMouseDown={beginSpriteGesture}
          />
        )}

        {/* collider */}
        {colliderRect && (
          <g>
            <rect
              data-testid="collider-body"
              x={toX(colliderRect.x)}
              y={toY(colliderRect.y)}
              width={colliderRect.w * zoom}
              height={colliderRect.h * zoom}
              fill={`hsl(${colorVar} / 0.22)`}
              stroke={`hsl(${colorVar})`}
              strokeWidth={1.5}
              strokeDasharray={solid ? undefined : '5 3'}
              pointerEvents={interactiveCollider ? 'all' : 'none'}
              style={interactiveCollider ? { cursor: 'move' } : undefined}
              onMouseDown={interactiveCollider ? beginColliderGesture('body') : undefined}
            />
            {interactiveCollider &&
              HANDLES.map((h) => {
                const p = handlePoint(colliderRect, h)
                return (
                  <g key={h}>
                    <rect
                      data-testid={`handle-${h}`}
                      x={toX(p.x) - 7}
                      y={toY(p.y) - 7}
                      width={14}
                      height={14}
                      fill="transparent"
                      style={{ cursor: handleCursor(h) }}
                      onMouseDown={beginColliderGesture(h)}
                    />
                    <rect
                      x={toX(p.x) - 3.5}
                      y={toY(p.y) - 3.5}
                      width={7}
                      height={7}
                      fill="hsl(0 0% 100%)"
                      stroke={`hsl(${colorVar})`}
                      pointerEvents="none"
                    />
                  </g>
                )
              })}
          </g>
        )}

        {/* anchor + pivot */}
        {showAnchor && (
          <g pointerEvents="none" stroke="hsl(var(--accent-amber))" strokeWidth={1.5}>
            <line x1={toX(0) - 6} x2={toX(0) + 6} y1={toY(0)} y2={toY(0)} />
            <line x1={toX(0)} x2={toX(0)} y1={toY(0) - 6} y2={toY(0) + 6} />
          </g>
        )}
        {showPivot && spriteRect && asset && (
          <circle
            pointerEvents="none"
            cx={toX(spriteRect.x + asset.meta.pivotX * spriteRect.w)}
            cy={toY(spriteRect.y + asset.meta.pivotY * spriteRect.h)}
            r={3}
            fill="none"
            stroke="hsl(var(--accent-violet))"
            strokeWidth={1.5}
          />
        )}
        {children}
      </svg>

      <ZoomControls
        className="absolute bottom-1.5 right-1.5"
        zoom={zoom}
        fitted={fitted}
        onZoomIn={() => zoomAround(zoom * ZOOM_STEP, width / 2, height / 2)}
        onZoomOut={() => zoomAround(zoom / ZOOM_STEP, width / 2, height / 2)}
        onFit={resetView}
      />

      {(liveCollider || liveOffset) && (
        <div className="pointer-events-none absolute left-2 top-2 rounded-sm bg-black/80 px-2 py-1 text-[10px] text-white">
          {liveCollider ? formatColliderRect(liveCollider) : `offset ${liveOffset!.x},${liveOffset!.y}`}
        </div>
      )}
    </div>
  )
}
