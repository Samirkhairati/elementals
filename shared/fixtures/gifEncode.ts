// A small GIF encoder for tests and fixtures (shared/gif.ts is the decoder). Real LZW, global palette, optional
// per-frame sub-rectangles, delays, disposal and a transparent index; no interlacing.

export interface GifFrameInput {
  /** Palette indices, row by row for the frame's own rectangle (default: the whole screen). */
  indices: number[]
  delayCs?: number
  disposal?: number
  transparent?: number
  left?: number
  top?: number
  width?: number
  height?: number
  interlaced?: boolean
}

export interface GifInput {
  width: number
  height: number
  /** [r, g, b] entries; padded to a power of two. */
  palette: [number, number, number][]
  frames: GifFrameInput[]
}

function lzwEncode(indices: number[], minCodeSize: number): number[] {
  const clear = 1 << minCodeSize
  const eoi = clear + 1
  const out: number[] = []
  let acc = 0
  let accBits = 0
  let size = minCodeSize + 1
  const put = (code: number) => {
    acc |= code << accBits
    accBits += size
    while (accBits >= 8) {
      out.push(acc & 255)
      acc >>>= 8
      accBits -= 8
    }
  }
  let dict = new Map<string, number>()
  let next = eoi + 1
  const reset = () => {
    dict = new Map()
    next = eoi + 1
    size = minCodeSize + 1
  }
  put(clear)
  let current = ''
  for (const index of indices) {
    const key = current === '' ? String(index) : `${current},${index}`
    if (current === '' || dict.has(key)) {
      current = key
      continue
    }
    put(current.includes(',') ? (dict.get(current) as number) : Number(current))
    if (next < 4096) {
      dict.set(key, next++)
      if (next > 1 << size && size < 12) size++
    } else {
      put(clear)
      reset()
    }
    current = String(index)
  }
  if (current !== '') put(current.includes(',') ? (dict.get(current) as number) : Number(current))
  put(eoi)
  if (accBits > 0) out.push(acc & 255)
  return out
}

const word = (n: number) => [n & 255, (n >> 8) & 255]

function subBlocks(data: number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < data.length; i += 255) {
    const chunk = data.slice(i, i + 255)
    out.push(chunk.length, ...chunk)
  }
  out.push(0)
  return out
}

const INTERLACE: readonly [number, number][] = [[0, 8], [4, 8], [2, 4], [1, 2]]

export function encodeGif(input: GifInput): Uint8Array {
  let bitsPerEntry = 1
  while (1 << bitsPerEntry < input.palette.length) bitsPerEntry++
  const entries = 1 << bitsPerEntry
  const palette = Array.from({ length: entries }, (_, i) => input.palette[i] ?? [0, 0, 0])
  const out: number[] = [...Buffer.from('GIF89a'), ...word(input.width), ...word(input.height), 0x80 | (7 << 4) | (bitsPerEntry - 1), 0, 0]
  for (const c of palette) out.push(...c)
  for (const f of input.frames) {
    const w = f.width ?? input.width
    const h = f.height ?? input.height
    out.push(0x21, 0xf9, 4, ((f.disposal ?? 0) << 2) | (f.transparent !== undefined ? 1 : 0), ...word(f.delayCs ?? 10), f.transparent ?? 0, 0)
    out.push(0x2c, ...word(f.left ?? 0), ...word(f.top ?? 0), ...word(w), ...word(h), f.interlaced ? 0x40 : 0)
    let indices = f.indices
    if (f.interlaced) {
      // the file stores rows in pass order; `indices` are in picture order
      const rows: number[][] = []
      for (const [start, step] of INTERLACE) for (let y = start; y < h; y += step) rows.push(f.indices.slice(y * w, (y + 1) * w))
      indices = rows.flat()
    }
    const minCode = Math.max(2, bitsPerEntry)
    out.push(minCode, ...subBlocks(lzwEncode(indices, minCode)))
  }
  out.push(0x3b)
  return Uint8Array.from(out)
}
