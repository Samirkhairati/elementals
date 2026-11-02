import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ChevronDown, ChevronUp, Map as MapIcon } from 'lucide-react'
import type { EntityData, Layer } from '@/types/editor'
import { ZoomControls } from '@/components/editor/ui/controls'
import { TILE_SIZE } from '../../../../../shared/engine/constants'
import {
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  fitView,
  minimapLayout,
  sameView,
  visibleWorldRect,
  type CanvasView,
  type Size,
} from '@/hooks/editor/canvas/viewMath'
import { colorLookup, rasterizeMap } from '@/lib/minimapRaster'

const MINIMAP_MAX_W = 160
const MINIMAP_MAX_H = 120
const STORAGE_KEY = 'elementals.minimapOpen'

/** What the navigator needs from the canvas viewport hook. */
export interface ViewportHandle {
  viewStore: { subscribe: (l: () => void) => () => void; getSnapshot: () => CanvasView }
  zoomTo: (scale: number) => void
  zoomBy: (factor: number) => void
  panToWorld: (wx: number, wy: number) => void
  reset: () => void
}

interface Props {
  viewport: ViewportHandle
  /** Size of the canvas area in screen pixels. */
  dimensions: Size
  mapWidth: number
  mapHeight: number
  layers: Layer[]
  entities: EntityData[]
  images: Record<string, HTMLImageElement>
}

function readOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

/** Top-right of the canvas: the zoom slider with reset, and a minimap whose frame is the visible part of the map. */
export const CanvasNavigator = React.memo(function CanvasNavigator({
  viewport,
  dimensions,
  mapWidth,
  mapHeight,
  layers,
  entities,
  images,
}: Props) {
  const view = useSyncExternalStore(viewport.viewStore.subscribe, viewport.viewStore.getSnapshot)
  const [open, setOpen] = useState(readOpen)
  const toggle = () =>
    setOpen((o) => {
      try {
        localStorage.setItem(STORAGE_KEY, String(!o))
      } catch {
        /* storage unavailable: the choice just is not remembered */
      }
      return !o
    })

  const fit = useMemo(() => fitView(dimensions, mapWidth, mapHeight), [dimensions, mapWidth, mapHeight])
  const fitted = sameView(view, fit)

  return (
    <>
      {/* Zoom bar bottom-left, minimap (and its show/hide button) bottom-right. */}
      <div
        data-testid="canvas-zoom"
        className="absolute bottom-3 left-3 z-40 max-w-[calc(100%-6rem)]"
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
      >
        <ZoomControls
          zoom={view.scale}
          minZoom={MIN_CANVAS_ZOOM}
          maxZoom={MAX_CANVAS_ZOOM}
          onZoomIn={() => viewport.zoomBy(1.25)}
          onZoomOut={() => viewport.zoomBy(1 / 1.25)}
          onZoomTo={viewport.zoomTo}
          onActualSize={() => viewport.zoomTo(1)}
          onFit={viewport.reset}
          fitted={fitted}
          fitLabel="Reset view (fit the whole map)"
        />
      </div>
      <div
        data-testid="canvas-navigator"
        className="absolute bottom-3 right-3 z-40 flex flex-col items-end gap-2"
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
      >
        {open && (
          <Minimap
            view={view}
            dimensions={dimensions}
            mapWidth={mapWidth}
            mapHeight={mapHeight}
            layers={layers}
            entities={entities}
            images={images}
            onCenter={viewport.panToWorld}
          />
        )}
        <button
          type="button"
          className="ed-btn"
          aria-label={open ? 'Hide minimap' : 'Show minimap'}
          aria-pressed={open}
          title={open ? 'Hide the minimap' : 'Show the minimap'}
          onClick={toggle}
        >
          <MapIcon />
          {open ? <ChevronUp /> : <ChevronDown />}
        </button>
      </div>
    </>
  )
})

interface MinimapProps {
  view: CanvasView
  dimensions: Size
  mapWidth: number
  mapHeight: number
  layers: Layer[]
  entities: EntityData[]
  images: Record<string, HTMLImageElement>
  onCenter: (wx: number, wy: number) => void
}

function Minimap({ view, dimensions, mapWidth, mapHeight, layers, entities, images, onCenter }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const layout = useMemo(() => minimapLayout(mapWidth, mapHeight, MINIMAP_MAX_W, MINIMAP_MAX_H), [mapWidth, mapHeight])

  // One pixel per tile, redrawn shortly after the map changes (painting would otherwise redraw it on every stroke).
  const loaded = Object.values(images).filter((i) => i.complete && i.naturalWidth > 0).length
  useEffect(() => {
    const timer = setTimeout(() => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext?.('2d')
      if (!canvas || !ctx) return
      canvas.width = mapWidth
      canvas.height = mapHeight
      const pixels = rasterizeMap({ width: mapWidth, height: mapHeight, layers }, entities, colorLookup(images))
      ctx.putImageData(new ImageData(pixels, mapWidth, mapHeight), 0, 0)
    }, 80)
    return () => clearTimeout(timer)
  }, [mapWidth, mapHeight, layers, entities, images, loaded])

  const centerAt = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const tx = ((e.clientX - rect.left) / rect.width) * mapWidth
      const ty = ((e.clientY - rect.top) / rect.height) * mapHeight
      onCenter(Math.min(Math.max(tx, 0), mapWidth) * TILE_SIZE, Math.min(Math.max(ty, 0), mapHeight) * TILE_SIZE)
    },
    [mapWidth, mapHeight, onCenter]
  )

  // The visible part of the map, in minimap pixels.
  const vis = visibleWorldRect(view, dimensions)
  const k = layout.scale / TILE_SIZE
  const frame = { left: vis.x * k, top: vis.y * k, width: vis.width * k, height: vis.height * k }

  return (
    <div
      role="group"
      aria-label="Minimap"
      data-testid="minimap"
      className="relative cursor-crosshair overflow-hidden rounded-md border border-border bg-background/80 shadow-lg backdrop-blur"
      style={{ width: layout.width, height: layout.height, touchAction: 'none' }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        centerAt(e)
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) centerAt(e)
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ imageRendering: layout.scale >= 2 ? 'pixelated' : 'auto' }}
        width={mapWidth}
        height={mapHeight}
      />
      <div
        data-testid="minimap-frame"
        className="pointer-events-none absolute border border-white bg-white/10 shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
        style={frame}
      />
    </div>
  )
}
