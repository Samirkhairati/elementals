import { useMemo, useState } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import type { TilesetData } from '@/types/editor'
import type { SpriteAssetInfo } from '../../../../../shared/engine/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { InfoTip, NumberField, Segmented, Toggle } from '../ui/controls'
import { ResizePreview } from './ResizePreview'
import { TILE_SIZE } from '../../../../../shared/engine/constants'
import {
  MAX_MAP_SIZE,
  NO_RESIZE,
  describeLoss,
  hasLoss,
  isNoResize,
  mapPixelSize,
  resizeLoss,
  resizeProblem,
  resizedSize,
  tilesFor,
  type ResizableMap,
  type ResizeEdges,
} from '@/lib/mapResize'

interface Props {
  /** The map to resize with its current layers and entities; null keeps the dialog closed. */
  map: (ResizableMap & { name: string }) | null
  tilesets: TilesetData[]
  spriteAssets?: Record<string, SpriteAssetInfo>
  onClose: () => void
  /** The edges in pixels (left / top in whole tiles). */
  onConfirm: (edges: ResizeEdges) => void
}

type Unit = 'tiles' | 'pixels'

const SIDES: { key: keyof ResizeEdges; label: string }[] = [
  { key: 'top', label: 'Top' },
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
  { key: 'bottom', label: 'Bottom' },
]

export function ResizeMapDialog({ map, tilesets, spriteAssets, onClose, onConfirm }: Props) {
  return (
    <Dialog open={map !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl">
        {map && <ResizeBody map={map} tilesets={tilesets} spriteAssets={spriteAssets} onClose={onClose} onConfirm={onConfirm} />}
      </DialogContent>
    </Dialog>
  )
}

function ResizeBody({ map, tilesets, spriteAssets, onClose, onConfirm }: Props & { map: ResizableMap & { name: string } }) {
  const before = mapPixelSize(map)
  const wholeTiles = before.width % TILE_SIZE === 0 && before.height % TILE_SIZE === 0
  const [unit, setUnit] = useState<Unit>(wholeTiles ? 'tiles' : 'pixels')
  // Always pixels inside; the Tiles view shows and takes them in tiles.
  const [edges, setEdges] = useState<ResizeEdges>(NO_RESIZE)
  // Handles snap to whole tiles; off, the right and bottom ones stop on any pixel (a size in pixels, so Pixels).
  const [snap, setSnap] = useState(true)
  const problem = resizeProblem(map, edges)
  const next = resizedSize(map, edges)
  const loss = useMemo(() => (problem ? null : resizeLoss(map, edges)), [map, edges, problem])
  const lossy = loss !== null && hasLoss(loss)
  const unchanged = isNoResize(edges)
  const inTiles = unit === 'tiles'
  const shown = (px: number) => (inTiles ? px / TILE_SIZE : px)
  const fromShown = (v: number, key: keyof ResizeEdges) => {
    if (inTiles) return Math.round(v) * TILE_SIZE
    // Left and top move in whole tiles so painted tiles stay on the grid.
    return key === 'left' || key === 'top' ? Math.round(v / TILE_SIZE) * TILE_SIZE : Math.round(v)
  }
  const setSize = (axis: 'width' | 'height', value: number) => {
    const px = inTiles ? Math.round(value) * TILE_SIZE : Math.round(value)
    if (axis === 'width') setEdges((e) => ({ ...e, right: px - before.width - e.left }))
    else setEdges((e) => ({ ...e, bottom: px - before.height - e.top }))
  }
  const whole = (s: { width: number; height: number }) => s.width % TILE_SIZE === 0 && s.height % TILE_SIZE === 0
  // Tiles while both sizes are whole tiles, pixels otherwise.
  const tileText = inTiles && whole(before) && whole(next)
  const sizeText = (s: { width: number; height: number }) =>
    tileText ? `${s.width / TILE_SIZE} × ${s.height / TILE_SIZE}` : `${s.width} × ${s.height}`
  const roundToTiles = () =>
    setEdges((e) => ({ ...e, right: Math.round((before.width + e.left + e.right) / TILE_SIZE) * TILE_SIZE - before.width - e.left, bottom: Math.round((before.height + e.top + e.bottom) / TILE_SIZE) * TILE_SIZE - before.height - e.top }))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!problem && !unchanged) onConfirm(edges)
      }}
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-1">
          Resize “{map.name}”
          <InfoTip>
            Drag the edges or corners of the frame, or type the size. Scroll or use the buttons to zoom the preview, and drag the background to move it.
            The handles snap to whole tiles; turn Snap to tiles off and the right and bottom edges stop on any pixel. The left and top edges always move in whole tiles ({TILE_SIZE} px) so painted tiles stay on the grid.
            Pictures and entities are never removed: what ends up outside the map stays there. Only painted tiles that fall off are cropped.
          </InfoTip>
        </DialogTitle>
        <DialogDescription className="sr-only">Grow or crop the map on each side.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-3 md:grid-cols-[minmax(0,1fr)_240px]">
        <ResizePreview
          map={map}
          tilesets={tilesets}
          spriteAssets={spriteAssets}
          size={{ width: before.width / TILE_SIZE, height: before.height / TILE_SIZE }}
          step={snap ? 1 : 1 / TILE_SIZE}
          edges={{ left: edges.left / TILE_SIZE, top: edges.top / TILE_SIZE, right: edges.right / TILE_SIZE, bottom: edges.bottom / TILE_SIZE }}
          onEdgesChange={(e) => setEdges({ left: Math.round(e.left) * TILE_SIZE, top: Math.round(e.top) * TILE_SIZE, right: Math.round(e.right * TILE_SIZE), bottom: Math.round(e.bottom * TILE_SIZE) })}
        />

        <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
          <Segmented<Unit>
            aria-label="Units"
            value={unit}
            options={[{ value: 'tiles', label: 'Tiles' }, { value: 'pixels', label: 'Pixels' }]}
            onChange={(u) => {
              setUnit(u)
              // Tiles only take whole tiles: round the free edges to the grid, and snap the handles.
              if (u === 'tiles') {
                setSnap(true)
                roundToTiles()
              }
            }}
          />
          <label className="flex items-center gap-2 text-xs">
            <Toggle
              aria-label="Snap to tiles"
              checked={snap}
              onChange={(on) => {
                setSnap(on)
                // Off the grid is a size in pixels.
                if (!on && inTiles) setUnit('pixels')
              }}
            />
            Snap to tiles
            <InfoTip>
              On, dragging an edge stops on whole tiles. Off, the right and bottom edges stop on any pixel; the left and top
              edges still move in whole tiles so painted tiles stay on the grid. Typed sizes are never snapped.
            </InfoTip>
          </label>
          <div className="rounded-md border border-border p-2 text-xs">
            <div className="text-muted-foreground">Size</div>
            <div className="mt-0.5 text-sm font-medium" data-testid="resize-size">
              {sizeText(before)} <span className="text-muted-foreground">→</span>{' '}
              <span className={problem ? 'text-red-400' : undefined}>{sizeText(next)}</span>{' '}
              <span className="text-xs font-normal text-muted-foreground">{tileText ? 'tiles' : 'px'}</span>
            </div>
            {!tileText && <div className="mt-0.5 text-muted-foreground" data-testid="resize-grid">{tilesFor(next.width)} × {tilesFor(next.height)} tiles of {TILE_SIZE} px</div>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="ed-label">Width</label>
              <NumberField aria-label={`Width (${unit})`} min={1} max={inTiles ? MAX_MAP_SIZE : MAX_MAP_SIZE * TILE_SIZE} integer value={shown(next.width)} onCommit={(v) => setSize('width', v)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="ed-label">Height</label>
              <NumberField aria-label={`Height (${unit})`} min={1} max={inTiles ? MAX_MAP_SIZE : MAX_MAP_SIZE * TILE_SIZE} integer value={shown(next.height)} onCommit={(v) => setSize('height', v)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {SIDES.map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="ed-label" title={`Positive adds ${unit} on that side, negative crops them${!inTiles && (key === 'left' || key === 'top') ? ` (whole tiles of ${TILE_SIZE} px)` : ''}`}>
                  {label}
                </label>
                <NumberField
                  aria-label={`${label} (${unit})`}
                  min={inTiles ? -MAX_MAP_SIZE : -MAX_MAP_SIZE * TILE_SIZE}
                  max={inTiles ? MAX_MAP_SIZE : MAX_MAP_SIZE * TILE_SIZE}
                  step={!inTiles && (key === 'left' || key === 'top') ? TILE_SIZE : 1}
                  integer
                  value={shown(edges[key])}
                  onCommit={(v) => setEdges((cur) => ({ ...cur, [key]: fromShown(v, key) }))}
                />
              </div>
            ))}
          </div>

          <button type="button" className="ed-btn self-start" disabled={unchanged} onClick={() => setEdges(NO_RESIZE)}>
            <RotateCcw /> Reset
          </button>

          {problem && (
            <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {problem}
            </p>
          )}

          {lossy && loss && (
            <div role="alert" data-testid="resize-warning" className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <div className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" /> This crops {describeLoss(loss)}.
              </div>
              <ul className="mt-1 list-disc pl-5 text-amber-100/90">
                {loss.layers.map((l) => (
                  <li key={l.layerId}>
                    {l.name}: {l.tiles} {l.tiles === 1 ? 'tile' : 'tiles'}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-amber-100/80">Cut cells are shown in red. Pictures and entities stay. Ctrl/⌘+Z undoes it while the map is open.</p>
            </div>
          )}
        </div>
      </div>

      <DialogFooter className="mt-3 gap-2 sm:space-x-0">
        <button type="button" onClick={onClose} className="ed-btn">Cancel</button>
        <button type="submit" className="ed-btn" data-variant={lossy ? 'danger' : 'primary'} data-dialog-confirm disabled={Boolean(problem) || unchanged}>
          {lossy ? 'Resize and crop tiles' : 'Resize'}
        </button>
      </DialogFooter>
    </form>
  )
}
