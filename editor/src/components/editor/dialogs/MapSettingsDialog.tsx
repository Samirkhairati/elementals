import { useEffect, useState } from 'react'
import { Scaling } from 'lucide-react'
import type { MapData, MapSettings } from '@/types/editor'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { InfoTip, NumberField } from '../ui/controls'
import { mapPixelSize } from '../../../../../shared/mapSize'

/** The player's draw depth when a map does not set one (the game's character depth). */
export const DEFAULT_PLAYER_Z = 20

interface Props {
  /** The map whose settings are open; null keeps the dialog closed. */
  map: MapData | null
  onClose: () => void
  onSave: (settings: MapSettings) => void
  /** Opens Resize… for this map. */
  onResize?: () => void
}

/** Right-click a map › Settings…: what the game should know about this map. */
export function MapSettingsDialog({ map, onClose, onSave, onResize }: Props) {
  const [playerZ, setPlayerZ] = useState(DEFAULT_PLAYER_Z)
  useEffect(() => {
    if (map) setPlayerZ(map.settings?.playerZ ?? DEFAULT_PLAYER_Z)
  }, [map])
  if (!map) return <Dialog open={false} />
  const px = mapPixelSize(map)
  // Layers drawn over the player (a higher z) and under it, so the number means something.
  const imageAndTile = map.layers.filter((l) => l.type === 'tile' || l.type === 'image')
  const above = imageAndTile.filter((l) => (l.z ?? 0) > playerZ).length
  const save = () => {
    const { playerZ: _old, ...rest } = map.settings ?? {}
    onSave(playerZ === DEFAULT_PLAYER_Z ? rest : { ...rest, playerZ })
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={(e) => { e.preventDefault(); save() }}>
          <DialogHeader>
            <DialogTitle>Settings · {map.name}</DialogTitle>
            <DialogDescription className="sr-only">Settings the game uses for this map.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-3">
            <div className="flex flex-col gap-1">
              <span className="ed-label flex items-center gap-1">
                Player z-index
                <InfoTip>
                  The depth the player draws at in the game. Tile and image layers with a higher z draw over the player, lower ones under it.
                  Y-sorted pictures sort among the characters at this depth. Default {DEFAULT_PLAYER_Z}.
                </InfoTip>
              </span>
              <NumberField aria-label="Player z-index" integer min={-999} max={999} value={playerZ} onCommit={setPlayerZ} />
              <span className="ed-hint" data-testid="player-z-layers">
                {above} of {imageAndTile.length} tile and image layers draw over the player
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="ed-label">Size</span>
              <span className="text-ed-body" data-testid="map-size">
                {px.width} × {px.height} px · {map.width} × {map.height} tiles
              </span>
              {onResize && (
                <button type="button" className="ed-btn ml-auto" data-size="sm" onClick={onResize}>
                  <Scaling />
                  Resize…
                </button>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:space-x-0">
            <button type="button" className="ed-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="ed-btn" data-variant="primary" data-dialog-confirm>Save</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
