import { InfoTip, NumberField, Segmented } from '../ui/controls'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

const TILE = 32
const MAX_TILES = 500

export type MapSizeUnit = 'tiles' | 'pixels'

interface CreateMapDialogProps {
  open: boolean
  name: string
  /** Tiles. */
  width: number
  height: number
  unit?: MapSizeUnit
  pixelWidth?: number
  pixelHeight?: number
  setName: (v: string) => void
  setWidth: (v: number) => void
  setHeight: (v: number) => void
  setUnit?: (u: MapSizeUnit) => void
  setPixelWidth?: (v: number) => void
  setPixelHeight?: (v: number) => void
  onClose: () => void
  onConfirm: () => void
}

/** New map: a name and a size, given in tiles or as a resolution in pixels (the tile grid then covers it). */
export function CreateMapDialog({
  open, name, width, height, unit = 'tiles', pixelWidth = width * TILE, pixelHeight = height * TILE,
  setName, setWidth, setHeight, setUnit, setPixelWidth, setPixelHeight, onClose, onConfirm,
}: CreateMapDialogProps) {
  const byPixels = unit === 'pixels'
  const summary = byPixels
    ? `${Math.ceil(pixelWidth / TILE)} × ${Math.ceil(pixelHeight / TILE)} tiles of ${TILE} px`
    : `${width * TILE} × ${height * TILE} px`
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={(e) => { e.preventDefault(); onConfirm(); }}>
          <DialogHeader>
            <DialogTitle>New Map</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-3">
            <div className="flex flex-col gap-1">
              <label className="ed-label">Map Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} autoFocus />
            </div>
            {setUnit && (
              <div className="flex items-center gap-2">
                <span className="ed-label">Size in</span>
                <Segmented<MapSizeUnit> aria-label="Size in" value={unit} options={[{ value: 'tiles', label: 'Tiles' }, { value: 'pixels', label: 'Resolution' }]} onChange={setUnit} />
                <InfoTip>
                  A map is a picture-sized area with a grid of {TILE} px tiles over it for painting, collision and tile-based movement.
                  Give its size as a number of tiles, or as a resolution in pixels (any size: the grid covers it).
                </InfoTip>
              </div>
            )}
            {byPixels ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="ed-label">Width (px)</label>
                  <NumberField aria-label="Width (pixels)" min={1} max={MAX_TILES * TILE} integer value={pixelWidth} onCommit={(v) => setPixelWidth?.(v)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="ed-label">Height (px)</label>
                  <NumberField aria-label="Height (pixels)" min={1} max={MAX_TILES * TILE} integer value={pixelHeight} onCommit={(v) => setPixelHeight?.(v)} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="ed-label">Width (Tiles)</label>
                  <NumberField aria-label="Width (tiles)" min={1} max={MAX_TILES} value={width} onCommit={setWidth} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="ed-label">Height (Tiles)</label>
                  <NumberField aria-label="Height (tiles)" min={1} max={MAX_TILES} value={height} onCommit={setHeight} />
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="ed-label flex items-center gap-1" htmlFor="new-map-tile-size">
                Tile size (px)
                <InfoTip>Every map uses {TILE} px tiles for now; other tile sizes are not supported yet.</InfoTip>
              </label>
              <Input id="new-map-tile-size" value={TILE} disabled readOnly className="w-24" />
            </div>
            <div className="ed-hint" data-testid="new-map-size">{summary}</div>
          </div>
          <DialogFooter className="gap-2 sm:space-x-0">
            <button type="button" onClick={onClose} className="ed-btn">Cancel</button>
            <button type="submit" className="ed-btn" data-variant="primary" data-dialog-confirm>Create</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
