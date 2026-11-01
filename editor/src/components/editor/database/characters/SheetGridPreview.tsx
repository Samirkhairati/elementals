import type { SheetDef } from '../../../../../../shared/engine/characters'
import { sheetFrameRect } from '../../../../../../shared/engine/characters'
import { sheetGrid } from '../../../../../../shared/engine/sprites'

/** Whole-number zoom that fits a picture of this size in a box (never below 1). */
export function fitZoom(width: number, height: number, maxWidth = 420, maxHeight = 420, cap = 4): number {
  return Math.max(1, Math.min(cap, Math.floor(maxWidth / Math.max(1, width)), Math.floor(maxHeight / Math.max(1, height))))
}

/** The sheet with its cut drawn over it and every frame numbered, so a change of frame size or spacing is visible at once. */
export function SheetGridPreview({ url, sheet, size }: { url: string; sheet: SheetDef; size: { width: number; height: number } }) {
  const grid = sheetGrid(sheet, size.width, size.height)
  const zoom = fitZoom(size.width, size.height)
  const cells = Array.from({ length: grid.count }, (_, i) => ({ i, rect: sheetFrameRect(sheet, i, size.width) }))
  return (
    <div
      data-testid="sheet-grid-preview"
      className="ed-checker relative shrink-0 select-none overflow-hidden rounded border border-border"
      style={{ width: size.width * zoom, height: size.height * zoom, backgroundImage: `url(${url})`, backgroundSize: '100% 100%', imageRendering: 'pixelated' }}
    >
      {cells.map(({ i, rect }) => (
        <div key={i} data-frame={i} className="absolute border border-white/40 text-[9px] leading-none text-white" style={{ left: rect.x * zoom, top: rect.y * zoom, width: rect.w * zoom, height: rect.h * zoom }}>
          <span className="absolute left-0.5 top-0.5 rounded bg-black/50 px-0.5">{i}</span>
        </div>
      ))}
    </div>
  )
}
