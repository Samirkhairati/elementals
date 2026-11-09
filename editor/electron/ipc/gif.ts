// TWIN of shared/gif.ts (the main process cannot import shared/); electron/ipc/gifSheet.test.ts pins the copies together.
// GIF decoder (no dependencies, no DOM or Node APIs: the editor, the Electron main process and the asset sync all use it).
// It turns a GIF into full RGBA frames: every frame is composited onto the logical screen the way a browser draws it
// (disposal methods, transparency, local palettes, interlacing), so a frame can be drawn or cut on its own.
//
// The game never decodes GIFs: `assets:sync` converts a GIF graphic into a PNG sheet with one frame next to the other
// (shared/gifSheet.ts) and the game plays that sheet like any other.

export interface GifFrame {
  /** width * height * 4 bytes, straight (non-premultiplied) RGBA: what the frame shows once drawn over the earlier ones. */
  rgba: Uint8ClampedArray
  /** How long the frame stays, in ms (as stored: GIF counts in 1/100 s). */
  delayMs: number
}

export interface DecodedGif {
  width: number
  height: number
  frames: GifFrame[]
}

/** Guards against files that would need absurd amounts of memory. */
export const GIF_LIMITS = { maxSide: 4096, maxFrames: 1000, maxPixels: 100_000_000 }

const fail = (message: string): never => {
  throw new Error(`Not a usable GIF: ${message}`)
}

/** Whether the bytes start like a GIF (`GIF87a` / `GIF89a`). */
export function isGif(bytes: Uint8Array): boolean {
  return bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
}

/** Size of the logical screen (what every frame is cut to); reads only the header. Throws on anything that is not a GIF. */
export function readGifSize(bytes: Uint8Array): { width: number; height: number } {
  if (!isGif(bytes)) return fail('bad signature')
  if (bytes.length < 10) return fail('the file is too short')
  return { width: bytes[6] | (bytes[7] << 8), height: bytes[8] | (bytes[9] << 8) }
}

/** The pixel indices of one image block (LZW with the given minimum code size); `count` = width * height of the block. */
function lzwDecode(data: Uint8Array, minCodeSize: number, count: number): Uint8Array {
  if (minCodeSize < 2 || minCodeSize > 8) return fail(`bad LZW code size ${minCodeSize}`)
  const clear = 1 << minCodeSize
  const eoi = clear + 1
  const out = new Uint8Array(count)
  // the dictionary as prefix links: entry = (prefix code, last byte); `first` is the first byte of the entry's string
  const prefix = new Int16Array(4096)
  const suffix = new Uint8Array(4096)
  const length = new Uint16Array(4096)
  let size = minCodeSize + 1
  let next = eoi + 1
  let previous = -1
  let written = 0
  let bits = 0
  let bitCount = 0
  let at = 0

  const reset = () => {
    size = minCodeSize + 1
    next = eoi + 1
    previous = -1
  }
  for (let i = 0; i < clear; i++) {
    prefix[i] = -1
    suffix[i] = i
    length[i] = 1
  }
  // writes the string of `code` ending at out[written + length - 1]
  const emit = (code: number) => {
    const n = length[code]
    let p = written + n - 1
    for (let c = code; c !== -1 && p >= written; c = prefix[c]) out[p--] = suffix[c]
    written += n
  }
  const firstByte = (code: number) => {
    let c = code
    while (prefix[c] !== -1) c = prefix[c]
    return suffix[c]
  }

  while (written < count) {
    while (bitCount < size && at < data.length) {
      bits |= data[at++] << bitCount
      bitCount += 8
    }
    if (bitCount < size) break
    const code = bits & ((1 << size) - 1)
    bits >>>= size
    bitCount -= size
    if (code === clear) {
      reset()
      continue
    }
    if (code === eoi) break
    if (previous === -1) {
      if (code >= clear) return fail('corrupt image data')
      if (length[code] > count - written) break
      emit(code)
      previous = code
      continue
    }
    let entry: number
    if (code < next) {
      entry = code
    } else if (code === next) {
      entry = -1 // the string of `previous` plus its own first byte
    } else {
      return fail('corrupt image data')
    }
    const added = entry === -1 ? firstByte(previous) : firstByte(entry)
    if (next < 4096) {
      prefix[next] = previous
      suffix[next] = added
      length[next] = length[previous] + 1
    }
    const target = entry === -1 ? next : entry
    if (length[target] > count - written) {
      // the data runs past the image: keep what fits
      const room = count - written
      const tmp = new Uint8Array(length[target])
      let p = length[target] - 1
      for (let c = target; c !== -1 && p >= 0; c = prefix[c]) tmp[p--] = suffix[c]
      out.set(tmp.subarray(0, room), written)
      written = count
      break
    }
    emit(target)
    if (next < 4096) next++
    if (next === 1 << size && size < 12) size++
    previous = code
  }
  return out
}

/** Reads a chain of data sub-blocks starting at `at`; returns the joined bytes and where the chain ended. */
function readSubBlocks(bytes: Uint8Array, at: number): { data: Uint8Array; end: number } {
  const parts: Uint8Array[] = []
  let total = 0
  let p = at
  for (;;) {
    if (p >= bytes.length) return fail('the file ends inside a block')
    const n = bytes[p++]
    if (n === 0) break
    if (p + n > bytes.length) return fail('the file ends inside a block')
    parts.push(bytes.subarray(p, p + n))
    total += n
    p += n
  }
  const data = new Uint8Array(total)
  let o = 0
  for (const part of parts) {
    data.set(part, o)
    o += part.length
  }
  return { data, end: p }
}

const INTERLACE_PASSES: readonly [start: number, step: number][] = [
  [0, 8],
  [4, 8],
  [2, 4],
  [1, 2],
]

/** Decodes every frame of a GIF (animated or not) into composited RGBA frames. Throws an Error with a plain message when it cannot. */
export function decodeGif(bytes: Uint8Array): DecodedGif {
  const { width, height } = readGifSize(bytes)
  if (width < 1 || height < 1) return fail('the picture has no size')
  if (width > GIF_LIMITS.maxSide || height > GIF_LIMITS.maxSide) return fail(`the picture is larger than ${GIF_LIMITS.maxSide} px`)

  const packed = bytes[10]
  let p = 13
  let globalPalette: Uint8Array | null = null
  if (packed & 0x80) {
    const n = 3 * (1 << ((packed & 7) + 1))
    if (p + n > bytes.length) return fail('the file ends inside the palette')
    globalPalette = bytes.subarray(p, p + n)
    p += n
  }

  const frames: GifFrame[] = []
  let canvas = new Uint8ClampedArray(width * height * 4)
  // the state set by the Graphic Control Extension for the next image
  let delayMs = 100
  let disposal = 0
  let transparent = -1

  while (p < bytes.length) {
    const block = bytes[p++]
    if (block === 0x3b) break
    if (block === 0x21) {
      const label = bytes[p++]
      if (label === 0xf9 && bytes[p] >= 4) {
        const flags = bytes[p + 1]
        disposal = (flags >> 2) & 7
        transparent = flags & 1 ? bytes[p + 4] : -1
        delayMs = (bytes[p + 2] | (bytes[p + 3] << 8)) * 10
      }
      p = readSubBlocks(bytes, p).end
      continue
    }
    if (block !== 0x2c) return fail(`unknown block 0x${block.toString(16)}`)

    if (p + 9 > bytes.length) return fail('the file ends inside an image')
    const left = bytes[p] | (bytes[p + 1] << 8)
    const top = bytes[p + 2] | (bytes[p + 3] << 8)
    const w = bytes[p + 4] | (bytes[p + 5] << 8)
    const h = bytes[p + 6] | (bytes[p + 7] << 8)
    const flags = bytes[p + 8]
    p += 9
    let palette = globalPalette
    if (flags & 0x80) {
      const n = 3 * (1 << ((flags & 7) + 1))
      if (p + n > bytes.length) return fail('the file ends inside the palette')
      palette = bytes.subarray(p, p + n)
      p += n
    }
    if (!palette) return fail('an image has no palette')
    if (frames.length + 1 > GIF_LIMITS.maxFrames) return fail(`more than ${GIF_LIMITS.maxFrames} frames`)
    if (width * height * (frames.length + 1) > GIF_LIMITS.maxPixels) return fail('too many pixels in all (a smaller or shorter GIF is needed)')
    const minCode = bytes[p++]
    const { data, end } = readSubBlocks(bytes, p)
    p = end
    const indices = lzwDecode(data, minCode, w * h)

    // draw the image block over the canvas (keeping a copy first when the frame asks to be undone afterwards)
    const before = disposal === 3 ? canvas.slice() : null
    const rowOf = (y: number) => {
      if (!(flags & 0x40)) return y
      let seen = 0
      for (const [start, step] of INTERLACE_PASSES) {
        const rows = Math.max(0, Math.ceil((h - start) / step))
        if (y < seen + rows) return start + (y - seen) * step
        seen += rows
      }
      return y
    }
    for (let y = 0; y < h; y++) {
      const cy = top + rowOf(y)
      if (cy >= height) continue
      for (let x = 0; x < w; x++) {
        const cx = left + x
        if (cx >= width) continue
        const index = indices[y * w + x]
        if (index === transparent) continue
        const o = (cy * width + cx) * 4
        const c = index * 3
        canvas[o] = palette[c] ?? 0
        canvas[o + 1] = palette[c + 1] ?? 0
        canvas[o + 2] = palette[c + 2] ?? 0
        canvas[o + 3] = 255
      }
    }
    frames.push({ rgba: canvas.slice(), delayMs })

    if (disposal === 2) {
      for (let y = top; y < Math.min(height, top + h); y++) {
        for (let x = left; x < Math.min(width, left + w); x++) canvas.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 4)
      }
    } else if (before) {
      canvas = before
    }
    // the extension only applies to the next image
    delayMs = 100
    disposal = 0
    transparent = -1
  }
  if (frames.length === 0) return fail('it has no images')
  return { width, height, frames }
}
