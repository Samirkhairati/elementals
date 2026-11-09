// A GIF as a sprite sheet. The game plays sheets, not GIFs, so a GIF graphic ("sprites/boss.gif") is laid out as a grid
// of its frames (left to right, then top to bottom, frame 0 first) in a PNG that `assets:sync` writes next to the
// copies of the other graphics ("graphics/sprites/boss.gif.png"). A character sheet that names the GIF is cut from that
// grid like any other sheet: frameWidth x frameHeight = the GIF's size, margin 0, spacing 0, frames 0..n-1.

import { decodeGif, type DecodedGif } from './gif.ts'
import { encodePng } from './pngEncode.ts'

/** Widest the generated sheet gets (a texture size every GPU takes); frames wrap onto more rows beyond it. */
export const GIF_SHEET_MAX_WIDTH = 4096
/** Tallest the generated sheet may get; a GIF that needs more is refused with a message. */
export const GIF_SHEET_MAX_HEIGHT = 8192

export interface GifSheet {
  /** Size of the whole sheet picture. */
  width: number
  height: number
  frameWidth: number
  frameHeight: number
  frames: number
  columns: number
  delaysMs: number[]
  rgba: Uint8ClampedArray
}

/** Lays the frames of a decoded GIF out as a grid. Throws when the grid would not fit in one texture. */
export function gifToSheet(gif: DecodedGif): GifSheet {
  const { width: fw, height: fh } = gif
  const frames = gif.frames.length
  const columns = Math.max(1, Math.min(frames, Math.floor(GIF_SHEET_MAX_WIDTH / fw)))
  const rows = Math.ceil(frames / columns)
  const width = columns * fw
  const height = rows * fh
  if (height > GIF_SHEET_MAX_HEIGHT) throw new Error(`The GIF has too many pixels for one sheet (${frames} frames of ${fw}×${fh}); shorten it or make it smaller`)
  const rgba = new Uint8ClampedArray(width * height * 4)
  gif.frames.forEach((frame, i) => {
    const ox = (i % columns) * fw
    const oy = Math.floor(i / columns) * fh
    for (let y = 0; y < fh; y++) rgba.set(frame.rgba.subarray(y * fw * 4, (y + 1) * fw * 4), ((oy + y) * width + ox) * 4)
  })
  return { width, height, frameWidth: fw, frameHeight: fh, frames, columns, delaysMs: gif.frames.map((f) => f.delayMs), rgba }
}

export interface GifSheetFile {
  png: Uint8Array
  /** Size of the sheet picture (what the character sheet is validated against). */
  width: number
  height: number
  frameWidth: number
  frameHeight: number
  frames: number
  delaysMs: number[]
}

/** The sheet PNG of a GIF file's bytes, plus what is known about it. */
export function gifSheetFile(bytes: Uint8Array, deflate: (data: Uint8Array) => Uint8Array): GifSheetFile {
  const sheet = gifToSheet(decodeGif(bytes))
  return {
    png: encodePng(sheet.width, sheet.height, sheet.rgba, deflate),
    width: sheet.width,
    height: sheet.height,
    frameWidth: sheet.frameWidth,
    frameHeight: sheet.frameHeight,
    frames: sheet.frames,
    delaysMs: sheet.delaysMs,
  }
}

/**
 * The fps that plays a GIF at about the speed it was made for: from the average frame delay, whole numbers from 1 to 60.
 * (Browsers show delays under 20 ms as 100 ms; so does this.)
 */
export function suggestedGifFps(delaysMs: readonly number[]): number {
  if (delaysMs.length === 0) return 10
  const shown = delaysMs.map((d) => (d < 20 ? 100 : d))
  const average = shown.reduce((a, b) => a + b, 0) / shown.length
  return Math.max(1, Math.min(60, Math.round(1000 / average)))
}
