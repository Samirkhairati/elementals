import { describe, expect, it } from 'vitest'
import { describeDetection, detectSheetGrid, type PixelData } from './sheetDetect'

/** A sheet of `cols`×`rows` cells of `cell` px with a `sprite`-px square drawn in each cell (offset by `pad`), skipping `empty` cell indexes. */
function sheet(cols: number, rows: number, cell: number, sprite: number, pad = 1, empty: number[] = []): PixelData {
  const width = cols * cell
  const height = rows * cell
  const data = new Uint8ClampedArray(width * height * 4)
  for (let c = 0; c < cols * rows; c++) {
    if (empty.includes(c)) continue
    const ox = (c % cols) * cell + pad
    const oy = Math.floor(c / cols) * cell + pad
    for (let y = 0; y < sprite; y++) for (let x = 0; x < sprite; x++) data[((oy + y) * width + ox + x) * 4 + 3] = 255
  }
  return { data, width, height }
}

describe('detectSheetGrid', () => {
  it('finds a grid whose sprites are separated by transparent gaps', () => {
    expect(detectSheetGrid(sheet(4, 4, 8, 6))).toEqual({ columns: 4, rows: 4 })
    expect(detectSheetGrid(sheet(3, 2, 16, 10, 3))).toEqual({ columns: 3, rows: 2 })
  })

  it('finds a single row or column of frames', () => {
    expect(detectSheetGrid(sheet(6, 1, 8, 6))).toEqual({ columns: 6, rows: null })
    expect(detectSheetGrid(sheet(1, 5, 8, 6))).toEqual({ columns: null, rows: 5 })
  })

  it('does not split where frames touch, and reports that axis as unknown', () => {
    expect(detectSheetGrid(sheet(4, 4, 8, 8, 0))).toEqual({ columns: null, rows: null })
    // columns separated, rows touching
    const px = sheet(4, 2, 8, 6)
    for (let x = 0; x < px.width; x++) for (let y = 6; y < 10; y++) if (x % 8 > 0 && x % 8 < 7) (px.data as Uint8ClampedArray)[(y * px.width + x) * 4 + 3] = 255
    expect(detectSheetGrid(px)).toEqual({ columns: 4, rows: null })
  })

  it('keeps empty cells at the end of the sheet (a grid that is not full)', () => {
    expect(detectSheetGrid(sheet(4, 4, 8, 6, 1, [14, 15]))).toEqual({ columns: 4, rows: 4 })
  })

  it('does not over-split a sprite that is one blob', () => {
    expect(detectSheetGrid(sheet(1, 1, 32, 28, 2))).toEqual({ columns: null, rows: null })
  })

  it('reports nothing for an empty or tiny image', () => {
    expect(detectSheetGrid({ data: new Uint8ClampedArray(16 * 16 * 4), width: 16, height: 16 })).toEqual({ columns: null, rows: null })
    expect(detectSheetGrid({ data: new Uint8ClampedArray(4), width: 1, height: 1 })).toEqual({ columns: null, rows: null })
    expect(detectSheetGrid({ data: new Uint8ClampedArray(3), width: 4, height: 4 })).toEqual({ columns: null, rows: null })
  })
})

describe('describeDetection', () => {
  const applied = { columns: 4, rows: 4, frameWidth: 32, frameHeight: 48 }
  it('says what was found and what was left alone', () => {
    expect(describeDetection({ columns: 4, rows: 4 }, applied)).toBe('Found 4×4 frames of 32×48 px.')
    expect(describeDetection({ columns: 4, rows: null }, applied)).toMatch(/Found 4 columns; rows could not be told apart/)
    expect(describeDetection({ columns: null, rows: 4 }, applied)).toMatch(/Found 4 rows; columns could not be told apart/)
    expect(describeDetection({ columns: null, rows: null }, applied)).toMatch(/No gaps between frames/)
  })
})
