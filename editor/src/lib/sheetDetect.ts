// Guesses how a sprite sheet is cut into frames by looking at its transparent gaps. Pure: it only needs the pixels
// (RGBA, like canvas ImageData), so it is tested with tiny hand-made images; `imagePixels.ts` reads real ones.
//
// The cut is always an even grid (the SheetDef contract). A cut line is believed when no sprite pixel straddles it
// and every column / row of cells holds something. Sheets whose frames touch each other have no gap to find: that
// axis comes back as null and the caller keeps what it had.

export interface PixelData {
  /** RGBA, 4 bytes per pixel. */
  data: ArrayLike<number>
  width: number
  height: number
}

export interface DetectedGrid {
  /** null = no gaps found on that axis (frames touch, or one big picture). */
  columns: number | null
  rows: number | null
}

/** Frames smaller than this are never proposed: they are noise, not sprites. */
const MIN_FRAME = 4
const MAX_CELLS = 64
/** A pixel counts as drawn when its alpha is above this. */
const ALPHA = 8

/** Opaque pixels per column (`axis` 'x') or per row ('y'). */
function profile(px: PixelData, axis: 'x' | 'y'): number[] {
  const out = new Array<number>(axis === 'x' ? px.width : px.height).fill(0)
  for (let y = 0; y < px.height; y++) {
    for (let x = 0; x < px.width; x++) {
      if (px.data[(y * px.width + x) * 4 + 3] > ALPHA) out[axis === 'x' ? x : y]++
    }
  }
  return out
}

/** The most cells `length` splits into evenly with clean cut lines and no empty column of cells; null when none (or only 1). */
function bestSplit(counts: number[]): number | null {
  const length = counts.length
  for (let n = Math.min(MAX_CELLS, Math.floor(length / MIN_FRAME)); n >= 2; n--) {
    if (length % n !== 0) continue
    const cell = length / n
    let ok = true
    for (let k = 0; k < n && ok; k++) {
      let filled = false
      for (let i = k * cell; i < (k + 1) * cell; i++) if (counts[i] > 0) filled = true
      if (!filled) ok = false
      // a sprite straddling the line before this cell: drawn pixels on both sides of it
      if (k > 0 && counts[k * cell - 1] > 0 && counts[k * cell] > 0) ok = false
    }
    if (ok) return n
  }
  return null
}

export function detectSheetGrid(px: PixelData): DetectedGrid {
  if (px.width < MIN_FRAME || px.height < MIN_FRAME || px.data.length < px.width * px.height * 4) return { columns: null, rows: null }
  return { columns: bestSplit(profile(px, 'x')), rows: bestSplit(profile(px, 'y')) }
}

/** One line for the UI: what was found and what still needs a hand. */
export function describeDetection(found: DetectedGrid, applied: { columns: number; rows: number; frameWidth: number; frameHeight: number }): string {
  const cut = `${applied.columns}×${applied.rows} frames of ${applied.frameWidth}×${applied.frameHeight} px`
  if (found.columns !== null && found.rows !== null) return `Found ${cut}.`
  if (found.columns !== null) return `Found ${applied.columns} columns; rows could not be told apart (frames touch), so rows stay at ${applied.rows}. Now ${cut}.`
  if (found.rows !== null) return `Found ${applied.rows} rows; columns could not be told apart (frames touch), so columns stay at ${applied.columns}. Now ${cut}.`
  return 'No gaps between frames were found, so the cut is unchanged. Set the columns and rows by hand.'
}
