import React, { useRef, useState } from 'react'
import { marqueeFrames, pickFrame, rowFrames } from '@/lib/characterEdit'
import type { SheetDef } from '../../../../../../shared/engine/characters'
import { sheetFrameRect } from '../../../../../../shared/engine/characters'
import { sheetGrid } from '../../../../../../shared/engine/sprites'

interface Props {
  /** data: URL of the sheet's image. */
  url: string
  sheet: SheetDef
  size: { width: number; height: number }
  frames: number[]
  onChange: (frames: number[]) => void
  zoom?: number
}

/**
 * The sheet with its cut drawn over it: click adds a frame, ctrl/cmd-click toggles the last one, shift-click adds a range,
 * dragging draws a marquee, a row header adds the whole row. Selected frames show their order number.
 */
export function FramePicker({ url, sheet, size, frames, onChange, zoom = 2 }: Props) {
  const grid = sheetGrid(sheet, size.width, size.height)
  const anchor = useRef<number | undefined>(undefined)
  const [down, setDown] = useState<{ col: number; row: number } | null>(null)
  const cells = Array.from({ length: grid.count }, (_, i) => ({ i, col: i % Math.max(1, grid.columns), row: Math.floor(i / Math.max(1, grid.columns)) }))
  const orders = new Map<number, number[]>()
  frames.forEach((f, n) => orders.set(f, [...(orders.get(f) ?? []), n + 1]))

  const up = (cell: { col: number; row: number; i: number }, e: React.MouseEvent) => {
    if (down && (down.col !== cell.col || down.row !== cell.row)) {
      onChange([...frames, ...marqueeFrames(grid.columns, down, cell)])
    } else {
      onChange(pickFrame(frames, cell.i, { shift: e.shiftKey, toggle: e.ctrlKey || e.metaKey, anchor: anchor.current }))
    }
    anchor.current = cell.i
    setDown(null)
  }

  if (grid.count === 0) return <p className="ed-hint">This sheet’s frames do not fit its image. Check the frame size on the Sheets tab.</p>
  return (
    <div className="inline-flex flex-col" data-testid="frame-picker">
      <div className="flex">
        <div className="flex flex-col" style={{ paddingTop: sheet.margin * zoom }}>
          {Array.from({ length: grid.rows }, (_, r) => (
            <button
              key={r}
              type="button"
              title={`Add all frames of row ${r + 1}`}
              aria-label={`Row ${r + 1}`}
              className="ed-iconbtn text-ed-label"
              style={{ height: (sheet.frameHeight + sheet.spacing) * zoom }}
              onClick={() => onChange([...frames, ...rowFrames(grid.columns, r)])}
            >
              {r + 1}
            </button>
          ))}
        </div>
        <div className="relative select-none" style={{ width: size.width * zoom, height: size.height * zoom, backgroundImage: `url(${url})`, backgroundSize: '100% 100%', imageRendering: 'pixelated' }}>
          {cells.map((c) => {
            const r = sheetFrameRect(sheet, c.i, size.width)
            const picked = orders.get(c.i)
            return (
              <div
                key={c.i}
                role="button"
                tabIndex={-1}
                aria-label={`Frame ${c.i}`}
                data-frame={c.i}
                data-picked={picked ? 'true' : undefined}
                className="absolute border border-white/30 text-[9px] leading-none text-white hover:bg-white/20"
                style={{ left: r.x * zoom, top: r.y * zoom, width: r.w * zoom, height: r.h * zoom, background: picked ? 'rgba(124,58,237,.45)' : undefined }}
                onMouseDown={() => setDown({ col: c.col, row: c.row })}
                onMouseUp={(e) => up(c, e)}
              >
                <span className="absolute left-0.5 top-0.5 rounded bg-black/50 px-0.5">{picked ? picked.join(',') : c.i}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
