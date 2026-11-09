import { describe, expect, it } from 'vitest'
import { decodeGif, isGif, readGifSize } from '../../../shared/gif'
import { encodeGif } from '../../../shared/fixtures/gifEncode'

const PALETTE: [number, number, number][] = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255]]
const px = (frame: { rgba: Uint8ClampedArray }, width: number, x: number, y: number) => Array.from(frame.rgba.slice((y * width + x) * 4, (y * width + x) * 4 + 4))

describe('decodeGif', () => {
  it('reads the size and every frame with its delay', () => {
    const bytes = encodeGif({
      width: 3,
      height: 2,
      palette: PALETTE,
      frames: [
        { indices: [0, 0, 0, 0, 0, 0], delayCs: 5 },
        { indices: [1, 1, 1, 2, 2, 2], delayCs: 20 },
      ],
    })
    expect(isGif(bytes)).toBe(true)
    expect(readGifSize(bytes)).toEqual({ width: 3, height: 2 })
    const gif = decodeGif(bytes)
    expect([gif.width, gif.height, gif.frames.length]).toEqual([3, 2, 2])
    expect(gif.frames.map((f) => f.delayMs)).toEqual([50, 200])
    expect(px(gif.frames[0], 3, 1, 1)).toEqual([255, 0, 0, 255])
    expect(px(gif.frames[1], 3, 0, 0)).toEqual([0, 255, 0, 255])
    expect(px(gif.frames[1], 3, 2, 1)).toEqual([0, 0, 255, 255])
  })

  it('decodes long, repetitive and noisy images (the LZW dictionary fills and resets)', () => {
    const w = 64
    const h = 64
    let seed = 7
    const noise = Array.from({ length: w * h }, () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 16) & 3)
    const flat = new Array(w * h).fill(2)
    const gif = decodeGif(encodeGif({ width: w, height: h, palette: PALETTE, frames: [{ indices: noise }, { indices: flat }] }))
    for (let i = 0; i < w * h; i += 97) expect(px(gif.frames[0], w, i % w, Math.floor(i / w)).slice(0, 3)).toEqual([...PALETTE[noise[i]]])
    expect(px(gif.frames[1], w, 10, 10)).toEqual([0, 0, 255, 255])
  })

  it('leaves transparent pixels showing the frame below, and sub-rectangles over it', () => {
    const gif = decodeGif(
      encodeGif({
        width: 2,
        height: 2,
        palette: PALETTE,
        frames: [
          { indices: [0, 0, 0, 0] },
          // a 1x1 frame at (1,1) that is drawn over the first one
          { indices: [2], left: 1, top: 1, width: 1, height: 1 },
          // transparent index 3 = leave what is there
          { indices: [3, 1, 3, 3], transparent: 3 },
        ],
      }),
    )
    expect(px(gif.frames[1], 2, 1, 1)).toEqual([0, 0, 255, 255])
    expect(px(gif.frames[1], 2, 0, 0)).toEqual([255, 0, 0, 255])
    expect(px(gif.frames[2], 2, 0, 0)).toEqual([255, 0, 0, 255]) // transparent: first frame still shows
    expect(px(gif.frames[2], 2, 1, 0)).toEqual([0, 255, 0, 255])
    expect(px(gif.frames[2], 2, 1, 1)).toEqual([0, 0, 255, 255]) // from the earlier frame
  })

  it('honours the disposal methods: restore to background and restore to previous', () => {
    const gif = decodeGif(
      encodeGif({
        width: 2,
        height: 1,
        palette: PALETTE,
        frames: [
          { indices: [0, 0] },
          { indices: [1, 1], disposal: 2 }, // cleared to transparent afterwards
          { indices: [2], left: 0, width: 1, height: 1, disposal: 3 }, // undone afterwards
          { indices: [3], left: 1, width: 1, height: 1 },
        ],
      }),
    )
    expect(px(gif.frames[1], 2, 0, 0)).toEqual([0, 255, 0, 255])
    expect(px(gif.frames[2], 2, 1, 0)).toEqual([0, 0, 0, 0]) // frame 2 was disposed to the background
    expect(px(gif.frames[2], 2, 0, 0)).toEqual([0, 0, 255, 255])
    expect(px(gif.frames[3], 2, 0, 0)).toEqual([0, 0, 0, 0]) // frame 3 was undone: back to what it covered
    expect(px(gif.frames[3], 2, 1, 0)).toEqual([255, 255, 255, 255])
  })

  it('puts interlaced rows back in order', () => {
    const rows = 9
    const indices = Array.from({ length: rows }, (_, y) => [y % 4, y % 4]).flat()
    const gif = decodeGif(encodeGif({ width: 2, height: rows, palette: PALETTE, frames: [{ indices, interlaced: true }] }))
    for (let y = 0; y < rows; y++) expect(px(gif.frames[0], 2, 0, y).slice(0, 3)).toEqual([...PALETTE[y % 4]])
  })

  it('refuses what is not a GIF, and stops at truncated files', () => {
    expect(isGif(new Uint8Array([1, 2, 3]))).toBe(false)
    expect(() => readGifSize(new Uint8Array(20))).toThrow(/Not a usable GIF/)
    expect(() => decodeGif(new Uint8Array([...Buffer.from('GIF89a'), 1, 0]))).toThrow(/Not a usable GIF/)
    const ok = encodeGif({ width: 2, height: 2, palette: PALETTE, frames: [{ indices: [0, 1, 2, 3] }] })
    expect(() => decodeGif(ok.slice(0, ok.length - 6))).toThrow(/Not a usable GIF/)
  })

  it('does not accept a picture with no images or an absurd size', () => {
    const empty = encodeGif({ width: 2, height: 2, palette: PALETTE, frames: [] })
    expect(() => decodeGif(empty)).toThrow(/no images/)
    const huge = Uint8Array.from(encodeGif({ width: 2, height: 2, palette: PALETTE, frames: [{ indices: [0, 0, 0, 0] }] }))
    huge[6] = 0xff
    huge[7] = 0xff
    expect(() => decodeGif(huge)).toThrow(/larger than/)
  })
})

import { deflateSync } from 'node:zlib'
import { gifSheetFile, gifToSheet, suggestedGifFps } from '../../../shared/gifSheet'
import { encodePng } from '../../../shared/pngEncode'
import { readPngSize } from '../../../shared/png'

describe('encodePng', () => {
  it('writes a PNG the header reader and zlib agree on', () => {
    const rgba = new Uint8Array(2 * 3 * 4).map((_, i) => i)
    const png = encodePng(2, 3, rgba, deflateSync)
    expect(readPngSize(png)).toEqual({ width: 2, height: 3 })
    expect(() => encodePng(2, 2, rgba, deflateSync)).toThrow(/does not match/)
    expect(() => encodePng(0, 1, new Uint8Array(0), deflateSync)).toThrow(/positive/)
  })
})

describe('gifToSheet', () => {
  const frames = (n: number) => Array.from({ length: n }, (_, i) => ({ indices: [i % 4, i % 4, i % 4, i % 4], delayCs: 10 }))

  it('lays frames out left to right, wrapping into rows, frame 0 first', () => {
    const gif = decodeGif(encodeGif({ width: 2, height: 2, palette: PALETTE, frames: frames(3) }))
    const sheet = gifToSheet(gif)
    expect([sheet.width, sheet.height, sheet.frameWidth, sheet.frameHeight, sheet.frames, sheet.columns]).toEqual([6, 2, 2, 2, 3, 3])
    expect(Array.from(sheet.rgba.slice(2 * 4, 2 * 4 + 3))).toEqual([...PALETTE[1]]) // frame 1 starts at x = 2
  })

  it('wraps at 4096 px and refuses a GIF that cannot fit one texture', () => {
    const wide = decodeGif(encodeGif({ width: 2000, height: 1, palette: PALETTE, frames: frames(3).map((f) => ({ ...f, indices: new Array(2000).fill(f.indices[0]) })) }))
    const sheet = gifToSheet(wide)
    expect([sheet.columns, sheet.width, sheet.height]).toEqual([2, 4000, 2])
    expect(() => gifToSheet({ width: 4000, height: 4000, frames: [{ rgba: new Uint8ClampedArray(0), delayMs: 10 }, { rgba: new Uint8ClampedArray(0), delayMs: 10 }, { rgba: new Uint8ClampedArray(0), delayMs: 10 }] })).toThrow(/too many pixels/)
  })

  it('gifSheetFile gives the PNG with the sheet size', () => {
    const file = gifSheetFile(encodeGif({ width: 2, height: 2, palette: PALETTE, frames: frames(4) }), deflateSync)
    expect(readPngSize(file.png)).toEqual({ width: file.width, height: file.height })
    expect([file.frames, file.frameWidth, file.frameHeight]).toEqual([4, 2, 2])
    expect(file.delaysMs).toEqual([100, 100, 100, 100])
  })
})

describe('suggestedGifFps', () => {
  it('follows the average delay, treats tiny delays as browsers do and stays within 1..60', () => {
    expect(suggestedGifFps([100, 100])).toBe(10)
    expect(suggestedGifFps([40, 40, 40])).toBe(25)
    expect(suggestedGifFps([0, 0])).toBe(10)
    expect(suggestedGifFps([20])).toBe(50)
    expect(suggestedGifFps([5000])).toBe(1)
    expect(suggestedGifFps([])).toBe(10)
  })
})
