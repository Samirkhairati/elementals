// A picture in the zoom pane with the aids the Database offers: a pixel grid, the tile grid (tilesets) and the cut
// of a sprite that uses the picture, drawn frame by frame and numbered the way animations count them.

import { useState } from 'react'
import { Grid3x3 } from 'lucide-react'
import type { SheetDef } from '../../../../../shared/engine/characters'
import { sheetFrameRect } from '../../../../../shared/engine/characters'
import { sheetGrid } from '../../../../../shared/engine/sprites'
import { Select, Checkbox } from '../ui/fields'
import { InfoTip } from '../ui/controls'
import { ZoomPane } from '../ui/ZoomPane'

/** The pixel grid only draws once a source pixel is this many screen pixels wide (below that it is just noise). */
export const PIXEL_GRID_MIN_ZOOM = 4

export interface SheetCut {
  /** Option value, e.g. `objects/chest:sheet`. */
  key: string
  /** Option label, e.g. `Chest · sheet`. */
  label: string
  sheet: SheetDef
}

interface Props {
  url?: string
  width: number
  height: number
  alt: string
  /** Offers a grid of squares this big (the tileset's tile size). */
  tileSize?: number
  /** Sprite cuts that can be laid over the picture. */
  cuts?: SheetCut[]
  /** Where to edit a cut (shown next to the overlay summary). */
  editCut?: (cut: SheetCut) => React.ReactNode
}

const lines = (step: number, color: string): string[] => [
  `linear-gradient(to right, ${color} 1px, transparent 1px) 0 0 / ${step}px ${step}px`,
  `linear-gradient(to bottom, ${color} 1px, transparent 1px) 0 0 / ${step}px ${step}px`,
]

/** The cut as SVG: one outlined, numbered box per frame, at the zoom the picture is drawn at. */
function CutOverlay({ sheet, width, height, zoom }: { sheet: SheetDef; width: number; height: number; zoom: number }) {
  const grid = sheetGrid(sheet, width, height)
  const frames = Array.from({ length: grid.count }, (_, i) => sheetFrameRect(sheet, i, width))
  const showNumbers = Math.min(sheet.frameWidth, sheet.frameHeight) * zoom >= 22
  return (
    <svg className="pointer-events-none absolute inset-0" width={width * zoom} height={height * zoom} data-testid="cut-overlay" aria-hidden>
      {frames.map((r, i) => (
        <g key={i} data-frame={i}>
          <rect x={r.x * zoom + 0.5} y={r.y * zoom + 0.5} width={Math.max(0, r.w * zoom - 1)} height={Math.max(0, r.h * zoom - 1)} fill={i === 0 ? 'rgba(236,72,153,.16)' : 'rgba(236,72,153,.06)'} stroke="rgba(236,72,153,.9)" strokeWidth={1} />
          {showNumbers && (
            <>
              <rect x={r.x * zoom + 1} y={r.y * zoom + 1} width={String(i).length * 7 + 6} height={13} rx={2} fill="rgba(0,0,0,.65)" />
              <text x={r.x * zoom + 4} y={r.y * zoom + 11} fontSize={10} fill="white" fontFamily="ui-monospace, monospace">{i}</text>
            </>
          )}
        </g>
      ))}
    </svg>
  )
}

export function ImageViewer({ url, width, height, alt, tileSize, cuts = [], editCut }: Props) {
  const [pixelGrid, setPixelGrid] = useState(false)
  const [tileGrid, setTileGrid] = useState(true)
  const [cutKey, setCutKey] = useState('')
  const cut = cuts.find((c) => c.key === cutKey)
  const cutGrid = cut ? sheetGrid(cut.sheet, width, height) : null
  const exact = cut && cutGrid ? cut.sheet.margin * 2 + cutGrid.columns * cut.sheet.frameWidth + (cutGrid.columns - 1) * cut.sheet.spacing === width && cut.sheet.margin * 2 + cutGrid.rows * cut.sheet.frameHeight + (cutGrid.rows - 1) * cut.sheet.spacing === height : true

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <ZoomPane
        width={width}
        height={height}
        toolbar={(zoom) => (
          <>
            <span className="flex items-center gap-1">
              <Checkbox className="ed-hint" checked={pixelGrid} onChange={setPixelGrid} label="Pixel grid" />
              <InfoTip>Draws a thin line around every pixel of the picture, so you can count pixels and line things up. It needs a close zoom to be visible: from {PIXEL_GRID_MIN_ZOOM * 100}% up.</InfoTip>
              {pixelGrid && zoom < PIXEL_GRID_MIN_ZOOM && <span className="ed-hint" data-testid="pixel-grid-hint">zoom in to {PIXEL_GRID_MIN_ZOOM * 100}%</span>}
            </span>
            {tileSize && <Checkbox className="ed-hint" checked={tileGrid} onChange={setTileGrid} label={`${tileSize}px tile grid`} />}
            {cuts.length > 0 && (
              <label className="ed-hint flex items-center gap-1">
                <Grid3x3 className="h-3.5 w-3.5" /> Sprite cut
                <Select className="w-auto min-w-[150px]" value={cutKey} aria-label="Overlay a character's cut" options={[{ value: '', label: 'none' }, ...cuts.map((c) => ({ value: c.key, label: c.label }))]} onChange={setCutKey} />
                <InfoTip>Lays the frame grid a sprite uses on this picture, numbered like its animations count them, so you can check the cut. It changes nothing.</InfoTip>
              </label>
            )}
          </>
        )}
      >
        {(zoom) => (
          <div className="relative" style={{ width: width * zoom, height: height * zoom }}>
            {url ? <img src={url} alt={alt} width={width * zoom} height={height * zoom} draggable={false} style={{ imageRendering: 'pixelated' }} /> : <span className="ed-hint p-3">Preview unavailable.</span>}
            <div
              className="pointer-events-none absolute inset-0"
              data-testid="graphic-grid"
              style={{ background: [
                ...(pixelGrid && zoom >= PIXEL_GRID_MIN_ZOOM ? lines(zoom, 'rgba(128,128,128,.55)') : []),
                ...(tileSize && tileGrid ? lines(tileSize * zoom, 'rgba(0,0,0,.35)') : []),
              ].join(', ') || undefined }}
            />
            {cut && <CutOverlay sheet={cut.sheet} width={width} height={height} zoom={zoom} />}
          </div>
        )}
      </ZoomPane>
      {cut && cutGrid && (
        <p className="ed-hint" data-testid="cut-summary">
          {cut.label}: {cutGrid.columns}×{cutGrid.rows} = {cutGrid.count} frames of {cut.sheet.frameWidth}×{cut.sheet.frameHeight} px
          {cut.sheet.margin ? `, margin ${cut.sheet.margin}` : ''}{cut.sheet.spacing ? `, spacing ${cut.sheet.spacing}` : ''}.
          {!exact && <span className="text-amber-500"> The frames do not fill the picture exactly: some pixels are left over.</span>}
          {editCut?.(cut)}
        </p>
      )}
    </div>
  )
}
