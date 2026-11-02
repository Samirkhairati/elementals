import { useMemo, useState } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import type { TilesetData } from '@/types/editor'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { NumberField } from '../ui/controls'
import { ResizePreview } from './ResizePreview'
import {
  MAX_MAP_SIZE,
  NO_RESIZE,
  describeLoss,
  hasLoss,
  isNoResize,
  resizeLoss,
  resizeProblem,
  resizedSize,
  type ResizableMap,
  type ResizeEdges,
} from '@/lib/mapResize'

interface Props {
  /** The map to resize with its current layers and entities; null keeps the dialog closed. */
  map: (ResizableMap & { name: string }) | null
  tilesets: TilesetData[]
  onClose: () => void
  onConfirm: (edges: ResizeEdges) => void
}

const SIDES: { key: keyof ResizeEdges; label: string }[] = [
  { key: 'top', label: 'Top' },
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
  { key: 'bottom', label: 'Bottom' },
]

export function ResizeMapDialog({ map, tilesets, onClose, onConfirm }: Props) {
  return (
    <Dialog open={map !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        {map && <ResizeBody map={map} tilesets={tilesets} onClose={onClose} onConfirm={onConfirm} />}
      </DialogContent>
    </Dialog>
  )
}

function ResizeBody({ map, tilesets, onClose, onConfirm }: Props & { map: ResizableMap & { name: string } }) {
  const [edges, setEdges] = useState<ResizeEdges>(NO_RESIZE)
  const problem = resizeProblem(map, edges)
  const next = resizedSize(map, edges)
  const loss = useMemo(() => (problem ? null : resizeLoss(map, edges)), [map, edges, problem])
  const lossy = loss !== null && hasLoss(loss)
  const unchanged = isNoResize(edges)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!problem && !unchanged) onConfirm(edges)
      }}
    >
      <DialogHeader>
        <DialogTitle>Resize “{map.name}”</DialogTitle>
        <DialogDescription>
          Drag the edges or corners of the frame to grow or crop the map, or type the number of tiles for each side.
          Tiles snap to the grid.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-3 md:grid-cols-[minmax(0,1fr)_220px]">
        <ResizePreview map={map} tilesets={tilesets} edges={edges} onEdgesChange={setEdges} />

        <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
          <div className="rounded-md border border-border p-2 text-xs">
            <div className="text-muted-foreground">Size</div>
            <div className="mt-0.5 text-sm font-medium" data-testid="resize-size">
              {map.width} × {map.height} <span className="text-muted-foreground">→</span>{' '}
              <span className={problem ? 'text-red-400' : undefined}>
                {next.width} × {next.height}
              </span>{' '}
              <span className="text-xs font-normal text-muted-foreground">tiles</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {SIDES.map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="ed-label" title="Positive adds tiles, negative removes them">
                  {label}
                </label>
                <NumberField
                  aria-label={`${label} (tiles)`}
                  min={-MAX_MAP_SIZE}
                  max={MAX_MAP_SIZE}
                  integer
                  value={edges[key]}
                  onCommit={(v) => setEdges((cur) => ({ ...cur, [key]: v }))}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Positive adds empty tiles on that side, negative crops them away.
          </p>

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
              <AlertTriangle className="h-3.5 w-3.5" /> This removes {describeLoss(loss)}.
            </div>
            <ul className="mt-1 list-disc pl-5 text-amber-100/90">
              {loss.layers.map((l) => (
                <li key={l.layerId}>
                  {l.name}:{' '}
                  {[l.tiles ? `${l.tiles} tile${l.tiles === 1 ? '' : 's'}` : '', l.images ? `${l.images} picture${l.images === 1 ? '' : 's'}` : '']
                    .filter(Boolean)
                    .join(', ')}
                </li>
              ))}
              {loss.entities.length > 0 && (
                <li>
                  Entities: {loss.entities.slice(0, 6).map((e) => e.name).join(', ')}
                  {loss.entities.length > 6 ? `, and ${loss.entities.length - 6} more` : ''}
                </li>
              )}
            </ul>
            <p className="mt-1 text-amber-100/80">Cut cells are shown in red. You can undo this with Ctrl/⌘+Z while the map is open.</p>
          </div>
        )}
        </div>
      </div>

      <DialogFooter className="mt-3 gap-2 sm:space-x-0">
        <button type="button" onClick={onClose} className="ed-btn">Cancel</button>
        <button
          type="submit"
          className="ed-btn"
          data-variant={lossy ? 'danger' : 'primary'}
          disabled={Boolean(problem) || unchanged}
        >
          {lossy ? 'Resize and remove content' : 'Resize'}
        </button>
      </DialogFooter>
    </form>
  )
}
