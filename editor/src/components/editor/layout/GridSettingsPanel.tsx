import { useEffect, useRef } from 'react'
import { RotateCcw } from 'lucide-react'
import { EdButton, Field, InfoTip, NumberField } from '@/components/editor/ui/controls'
import { GRID_MAX, GRID_MIN, isDefaultGrid } from '@/lib/grid'
import { useGridStore } from '@/store/gridStore'

/**
 * The picture grid's size and offset, opened by a right-click on the grid snapping button. Pictures snap to these lines
 * (an edge of the picture lands on one); the grid drawn in accent colour is this one whenever it is not the 32 px tile grid.
 */
export function GridSettingsPanel({ at, onClose }: { at: { left: number; top: number }; onClose: () => void }) {
  const grid = useGridStore((s) => s.grid)
  const { setGrid, resetGrid } = useGridStore.getState()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key, true)
    }
  }, [onClose])

  return (
    <div
      ref={box}
      role="dialog"
      aria-label="Picture grid settings"
      className="fixed z-50 w-60 rounded-md border bg-popover p-3 text-popover-foreground shadow-lg"
      style={{ left: at.left, top: at.top }}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <span className="ed-section-title flex-1">Picture grid</span>
        <InfoTip>
          Pictures snap by an edge or corner: whichever edge is nearest to a grid line moves onto it. Size is the distance
          between lines; offset moves all the lines. Changing these does not move anything that is already placed, and
          entities keep snapping to the 32 px tiles.
        </InfoTip>
        <EdButton size="sm" aria-label="Reset the picture grid" title="Back to 32 px, no offset" disabled={isDefaultGrid(grid)} onClick={resetGrid}>
          <RotateCcw />
        </EdButton>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Size X">
          <NumberField aria-label="Grid size X" value={grid.sizeX} min={GRID_MIN} max={GRID_MAX} unit="px" onCommit={(v) => setGrid({ sizeX: v })} />
        </Field>
        <Field label="Size Y">
          <NumberField aria-label="Grid size Y" value={grid.sizeY} min={GRID_MIN} max={GRID_MAX} unit="px" onCommit={(v) => setGrid({ sizeY: v })} />
        </Field>
        <Field label="Offset X">
          <NumberField aria-label="Grid offset X" value={grid.offsetX} min={0} max={GRID_MAX} unit="px" onCommit={(v) => setGrid({ offsetX: v })} />
        </Field>
        <Field label="Offset Y">
          <NumberField aria-label="Grid offset Y" value={grid.offsetY} min={0} max={GRID_MAX} unit="px" onCommit={(v) => setGrid({ offsetY: v })} />
        </Field>
      </div>
    </div>
  )
}
