#!/usr/bin/env node
// Placeholder sprite generator. Writes small, deterministic pixel-art assets under project/sprites so the
// engine has real content to show in the editor and game (see docs/engine-design.md, section 2).
//
//   node scripts/tools/gen-placeholder-sprites.mjs          write (idempotent: unchanged files are left alone)
//   node scripts/tools/gen-placeholder-sprites.mjs --check  exit 1 if any generated file is missing or differs
//
// Objects (sign, chest, item-ball, door, flower) are drawn procedurally from the small pixel maps below.
// NPC characters are recolours of the player's walk/run sheets (see `recolourCharacter`).
// No dependencies: PNG decode/encode use node:zlib. Output is byte-stable for a given Node/zlib build.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const PROJECT_SPRITES = path.resolve(HERE, '../../project/sprites')

// ── tiny PNG codec ──────────────────────────────────────────────────────────────────────────────

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}

/** Encodes `{width,height,data}` (RGBA, 8 bit) as a non-interlaced RGBA PNG with no filtering. */
export function encodePng({ width, height, data }) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  return Buffer.concat([PNG_SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

/** Decodes a non-interlaced 8-bit RGBA / RGB / grey(+alpha) / palette PNG to `{width,height,data}` (RGBA). */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('not a PNG')
  let pos = 8
  let ihdr = null
  let palette = null
  let trns = null
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const body = buf.subarray(pos + 8, pos + 8 + len)
    pos += 12 + len
    if (type === 'IHDR') ihdr = body
    else if (type === 'PLTE') palette = body
    else if (type === 'tRNS') trns = body
    else if (type === 'IDAT') idat.push(body)
    else if (type === 'IEND') break
  }
  if (!ihdr) throw new Error('PNG has no IHDR')
  const width = ihdr.readUInt32BE(0)
  const height = ihdr.readUInt32BE(4)
  const depth = ihdr[8]
  const colorType = ihdr[9]
  if (depth !== 8) throw new Error(`unsupported PNG bit depth ${depth}`)
  if (ihdr[12] !== 0) throw new Error('interlaced PNGs are not supported')
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
  if (!channels) throw new Error(`unsupported PNG colour type ${colorType}`)
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const px = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const src = y * (stride + 1) + 1
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? px[y * stride + x - channels] : 0
      const b = y > 0 ? px[(y - 1) * stride + x] : 0
      const c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels] : 0
      let v = raw[src + x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else if (filter !== 0) throw new Error(`bad PNG filter ${filter}`)
      px[y * stride + x] = v & 0xff
    }
  }
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const s = i * channels
    let r, g, b, a = 255
    if (colorType === 6) [r, g, b, a] = [px[s], px[s + 1], px[s + 2], px[s + 3]]
    else if (colorType === 2) [r, g, b] = [px[s], px[s + 1], px[s + 2]]
    else if (colorType === 0) r = g = b = px[s]
    else if (colorType === 4) { r = g = b = px[s]; a = px[s + 1] }
    else {
      const idx = px[s]
      if (!palette) throw new Error('palette PNG without PLTE')
      r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2]
      a = trns && idx < trns.length ? trns[idx] : 255
    }
    data.set([r, g, b, a], i * 4)
  }
  return { width, height, data }
}

// ── tiny raster helpers ─────────────────────────────────────────────────────────────────────────

const OUTLINE = [24, 18, 30]

function canvas(width, height) {
  return { width, height, data: new Uint8Array(width * height * 4) }
}

function put(c, x, y, col) {
  if (x < 0 || y < 0 || x >= c.width || y >= c.height) return
  c.data.set([col[0], col[1], col[2], col[3] ?? 255], (y * c.width + x) * 4)
}

function erase(c, x, y) {
  if (x < 0 || y < 0 || x >= c.width || y >= c.height) return
  c.data.fill(0, (y * c.width + x) * 4, (y * c.width + x) * 4 + 4)
}

const alphaAt = (c, x, y) => (x < 0 || y < 0 || x >= c.width || y >= c.height ? 0 : c.data[(y * c.width + x) * 4 + 3])

/** Inclusive rectangle. */
function rect(c, x0, y0, x1, y1, col) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(c, x, y, col)
}

/** Filled ellipse centred on (cx, cy) in pixel-centre coordinates; `colorAt(x, y)` may return null to skip. */
function ellipse(c, cx, cy, rx, ry, colorAt) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const dx = (x + 0.5 - cx) / rx
      const dy = (y + 0.5 - cy) / ry
      if (dx * dx + dy * dy > 1) continue
      const col = typeof colorAt === 'function' ? colorAt(x, y, dx, dy) : colorAt
      if (col) put(c, x, y, col)
    }
  }
}

/** Adds a 1px outline (4-neighbourhood) around everything currently opaque. */
function outline(c, col = OUTLINE) {
  const todo = []
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (alphaAt(c, x, y)) continue
      if (alphaAt(c, x - 1, y) || alphaAt(c, x + 1, y) || alphaAt(c, x, y - 1) || alphaAt(c, x, y + 1)) todo.push([x, y])
    }
  }
  for (const [x, y] of todo) put(c, x, y, col)
}

/** Copies `src` into `dst` at (ox, oy). */
function blit(dst, src, ox, oy) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const i = (y * src.width + x) * 4
      if (src.data[i + 3]) put(dst, ox + x, oy + y, [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]])
    }
  }
}

/** Lays frames out left to right. */
function strip(frames) {
  const out = canvas(frames[0].width * frames.length, frames[0].height)
  frames.forEach((f, i) => blit(out, f, i * f.width, 0))
  return out
}

/** Stamps an ASCII map: each char looks up `key`; space and '.' are transparent. */
function stamp(c, ox, oy, rows, key) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = key[row[x]]
      if (col) put(c, ox + x, oy + y, col)
    }
  })
}

// ── palettes (shared so every object reads as one family) ───────────────────────────────────────

const WOOD = { dk: [88, 48, 44], d: [128, 76, 52], m: [184, 120, 68], l: [224, 168, 100], h: [248, 208, 140] }
const GOLD = { d: [168, 120, 48], m: [216, 168, 56], l: [248, 216, 96] }
const STONE = { dk: [64, 64, 92], d: [108, 108, 140], m: [152, 152, 184], l: [200, 200, 222] }
const EARTH = { d: [92, 66, 56], m: [128, 96, 68] }
const LEAF = { dk: [40, 104, 64], d: [64, 144, 72], m: [96, 184, 88], l: [152, 224, 112] }

const SIZE = 32

// ── objects ─────────────────────────────────────────────────────────────────────────────────────

function drawSign() {
  const c = canvas(SIZE, SIZE)
  // dirt mound the post stands in
  ellipse(c, 16, 29.5, 6.5, 1.8, (x, y, dx, dy) => (dy < -0.1 || dx < -0.3 ? EARTH.m : EARTH.d))
  // post
  rect(c, 14, 17, 17, 29, WOOD.m)
  rect(c, 14, 17, 14, 29, WOOD.l)
  rect(c, 17, 17, 17, 29, WOOD.d)
  // board
  rect(c, 4, 5, 27, 17, WOOD.m)
  rect(c, 4, 5, 27, 5, WOOD.h)
  rect(c, 4, 6, 27, 6, WOOD.l)
  rect(c, 4, 6, 4, 17, WOOD.l)
  rect(c, 27, 6, 27, 17, WOOD.d)
  rect(c, 5, 16, 27, 16, WOOD.d)
  rect(c, 5, 17, 27, 17, WOOD.dk)
  for (const [x, y] of [[4, 5], [27, 5], [4, 17], [27, 17]]) erase(c, x, y)
  // nails and "writing"
  for (const [x, y] of [[6, 8], [25, 8], [6, 14], [25, 14]]) put(c, x, y, WOOD.dk)
  rect(c, 9, 9, 22, 9, WOOD.d)
  rect(c, 9, 11, 18, 11, WOOD.d)
  rect(c, 9, 13, 21, 13, WOOD.d)
  outline(c)
  return c
}

function chestBody(c) {
  // body y16..28, planks, gold bands and the lower half of the lock
  rect(c, 4, 16, 27, 28, WOOD.m)
  rect(c, 4, 16, 4, 28, WOOD.l)
  rect(c, 27, 16, 27, 28, WOOD.d)
  rect(c, 5, 28, 26, 28, WOOD.dk)
  rect(c, 4, 28, 4, 28, WOOD.d)
  rect(c, 12, 18, 12, 27, WOOD.d)
  rect(c, 19, 18, 19, 27, WOOD.d)
  for (const x of [8, 22]) {
    rect(c, x, 16, x + 1, 28, GOLD.m)
    rect(c, x, 16, x, 28, GOLD.l)
    rect(c, x + 1, 16, x + 1, 28, GOLD.d)
  }
}

function drawChest(open) {
  const c = canvas(SIZE, SIZE)
  chestBody(c)
  if (!open) {
    // rounded lid y8..15
    const lidRows = [[7, 24], [5, 26], [4, 27], [4, 27], [4, 27], [4, 27], [4, 27], [4, 27]]
    lidRows.forEach(([x0, x1], i) => rect(c, x0, 8 + i, x1, 8 + i, WOOD.m))
    rect(c, 7, 8, 24, 8, WOOD.h)
    rect(c, 5, 9, 26, 9, WOOD.l)
    rect(c, 4, 10, 4, 14, WOOD.l)
    rect(c, 27, 10, 27, 14, WOOD.d)
    rect(c, 5, 15, 26, 15, WOOD.dk)
    for (const x of [8, 22]) {
      rect(c, x, 9, x + 1, 15, GOLD.m)
      rect(c, x, 9, x, 15, GOLD.l)
      rect(c, x + 1, 9, x + 1, 15, GOLD.d)
    }
    // lock plate across the seam
    rect(c, 14, 13, 17, 19, GOLD.m)
    rect(c, 14, 13, 17, 13, GOLD.l)
    rect(c, 14, 13, 14, 19, GOLD.l)
    rect(c, 17, 14, 17, 19, GOLD.d)
    rect(c, 14, 19, 17, 19, GOLD.d)
    rect(c, 15, 16, 16, 17, WOOD.dk)
  } else {
    // front rim, then dark inside with a few gold glints, lid tipped back above
    rect(c, 4, 16, 27, 16, WOOD.h)
    rect(c, 5, 10, 26, 15, [52, 32, 52])
    rect(c, 5, 10, 26, 10, [36, 22, 40])
    rect(c, 4, 10, 4, 15, WOOD.l)
    rect(c, 27, 10, 27, 15, WOOD.d)
    for (const [x, y] of [[8, 14], [9, 15], [12, 13], [15, 14], [16, 15], [20, 14], [22, 15], [23, 13]]) put(c, x, y, GOLD.l)
    for (const [x, y] of [[13, 14], [14, 15], [21, 15]]) put(c, x, y, GOLD.m)
    // lid underside
    const lidRows = [[8, 23], [6, 25], [5, 26], [5, 26], [5, 26], [5, 26], [5, 26], [5, 26]]
    lidRows.forEach(([x0, x1], i) => rect(c, x0, 2 + i, x1, 2 + i, [112, 64, 48]))
    rect(c, 8, 2, 23, 2, WOOD.d)
    rect(c, 5, 9, 26, 9, WOOD.dk)
    rect(c, 5, 4, 5, 8, WOOD.d)
    rect(c, 26, 4, 26, 8, WOOD.dk)
    for (const x of [8, 22]) rect(c, x, 3, x + 1, 9, GOLD.d)
    // half lock on the body
    rect(c, 14, 17, 17, 19, GOLD.m)
    rect(c, 14, 17, 14, 19, GOLD.l)
    rect(c, 17, 17, 17, 19, GOLD.d)
    rect(c, 14, 19, 17, 19, GOLD.d)
    rect(c, 15, 18, 16, 18, WOOD.dk)
  }
  outline(c)
  return c
}

function drawItemBall() {
  const c = canvas(SIZE, SIZE)
  const cx = 16
  const cy = 21
  const R = 9
  const RED = { dk: [152, 36, 56], d: [196, 48, 60], m: [236, 76, 64], l: [255, 148, 120] }
  const WHITE = { dk: [128, 132, 176], d: [180, 184, 218], m: [232, 234, 250], l: [255, 255, 255] }
  const DARK = [44, 34, 56]
  ellipse(c, cx, cy, R, R, (x, y, dx, dy) => {
    const top = y + 0.5 < cy
    const pal = top ? RED : WHITE
    const light = -0.55 * dx - 0.8 * dy // 1 = lit (top-left)
    if (light > 0.62) return pal.l
    if (light > -0.1) return pal.m
    if (light > -0.62) return pal.d
    return pal.dk
  })
  // dark equator band (2px) and button
  for (let y = cy - 1; y <= cy; y++) for (let x = cx - R; x < cx + R; x++) if (alphaAt(c, x, y)) put(c, x, y, DARK)
  ellipse(c, cx, cy, 3.6, 3.6, DARK)
  ellipse(c, cx, cy, 2.4, 2.4, (x, y, dx, dy) => (dx + dy < -0.2 ? WHITE.l : dx + dy < 0.6 ? WHITE.m : WHITE.d))
  // glossy highlight on the red half
  for (const [x, y] of [[11, 14], [12, 14], [10, 15], [11, 15], [10, 16]]) put(c, x, y, [255, 214, 196])
  outline(c)
  return c
}

function drawDoor(open) {
  const c = canvas(SIZE, SIZE)
  // stone surround with a softly arched top: x4..27, y2..30
  const archRows = [[10, 21], [7, 24], [5, 26]]
  archRows.forEach(([x0, x1], i) => rect(c, x0, 2 + i, x1, 2 + i, STONE.m))
  rect(c, 4, 5, 27, 30, STONE.m)
  rect(c, 10, 2, 21, 2, STONE.l)
  rect(c, 7, 3, 24, 3, STONE.l)
  rect(c, 5, 4, 26, 4, STONE.l)
  rect(c, 4, 5, 5, 30, STONE.l)
  rect(c, 26, 5, 27, 30, STONE.d)
  rect(c, 4, 30, 27, 30, STONE.dk)
  rect(c, 6, 5, 25, 5, STONE.l)
  // opening x7..24, y6..29
  if (!open) {
    rect(c, 7, 6, 24, 29, WOOD.m)
    rect(c, 7, 6, 24, 6, WOOD.l)
    rect(c, 7, 6, 7, 29, WOOD.l)
    rect(c, 24, 7, 24, 29, WOOD.d)
    rect(c, 15, 7, 16, 29, WOOD.d) // centre seam
    rect(c, 8, 7, 14, 7, WOOD.h)
    rect(c, 17, 7, 23, 7, WOOD.h)
    for (const y of [11, 23]) {
      rect(c, 8, y, 23, y + 1, WOOD.d)
      rect(c, 8, y, 23, y, WOOD.m)
    }
    for (const [x, y] of [[9, 8], [22, 8], [9, 25], [22, 25], [9, 20], [22, 20]]) put(c, x, y, WOOD.dk)
    // knob
    rect(c, 20, 17, 21, 18, GOLD.m)
    put(c, 20, 17, GOLD.l)
    put(c, 21, 18, GOLD.d)
  } else {
    // dark doorway, warm light spilling on the floor, door leaf swung open on the left edge
    rect(c, 7, 6, 24, 29, [34, 26, 50])
    rect(c, 7, 6, 24, 9, [26, 20, 40])
    rect(c, 7, 24, 24, 29, [70, 52, 70])
    rect(c, 10, 26, 24, 29, [112, 84, 82])
    rect(c, 13, 28, 24, 29, [160, 120, 96])
    rect(c, 7, 6, 9, 29, WOOD.m)
    rect(c, 7, 6, 7, 29, WOOD.l)
    rect(c, 9, 6, 9, 29, WOOD.d)
    rect(c, 8, 12, 8, 13, WOOD.d)
    rect(c, 8, 23, 8, 24, WOOD.d)
    rect(c, 9, 17, 9, 18, GOLD.m)
  }
  outline(c)
  return c
}

function drawFlower(dx) {
  const c = canvas(SIZE, SIZE)
  const lerp = (a, b, t) => a + (b - a) * t
  // grass tuft at the base
  const tuft = [
    [10, 29, 3], [12, 28, 2], [14, 29, 3], [18, 29, 3], [20, 28, 2], [22, 29, 3],
  ]
  for (const [x, y, h] of tuft) for (let i = 0; i < h; i++) put(c, x, y - i, i === h - 1 ? LEAF.l : LEAF.m)
  rect(c, 9, 29, 23, 29, LEAF.d)
  rect(c, 11, 28, 21, 28, LEAF.m)
  // stem: base fixed, head leans by dx
  const headX = 16 + dx
  const headY = 12
  for (let y = 28; y >= headY + 3; y--) {
    const t = (28 - y) / (28 - headY - 3)
    const x = Math.round(lerp(16, headX, t * t))
    put(c, x, y, LEAF.d)
    put(c, x + 1, y, LEAF.dk)
  }
  // leaves
  const leaf = (ox, oy, dir) => {
    ellipse(c, ox, oy, 3.6, 1.7, (x, y, ex, ey) => (ey < -0.2 ? LEAF.l : ey < 0.4 ? LEAF.m : LEAF.d))
    put(c, ox - dir * 4, oy + 1, LEAF.d)
  }
  leaf(12.5 + Math.round(dx * 0.3), 23, -1)
  leaf(20.5 + Math.round(dx * 0.6), 20, 1)
  // petals around a yellow centre
  const PET = { dk: [196, 64, 120], d: [232, 104, 152], m: [255, 152, 188], l: [255, 214, 226] }
  const angles = [-90, -18, 54, 126, 198]
  for (const a of angles) {
    const px = headX + 0.5 + Math.cos((a * Math.PI) / 180) * 3.6
    const py = headY + 0.5 + Math.sin((a * Math.PI) / 180) * 3.6
    ellipse(c, px, py, 2.9, 2.9, (x, y) => {
      const light = -(x + 0.5 - px) * 0.5 - (y + 0.5 - py) * 0.8
      return light > 1.5 ? PET.l : light > 0 ? PET.m : light > -1.5 ? PET.d : PET.dk
    })
  }
  ellipse(c, headX + 0.5, headY + 0.5, 2.5, 2.5, (x, y, ex, ey) => (ex + ey < -0.3 ? GOLD.l : ex + ey < 0.7 ? GOLD.m : GOLD.d))
  outline(c)
  return c
}

// ── characters: recolouring the player's sheets ─────────────────────────────────────────────────

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return [h, s, l]
}

function hslToRgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t) => {
    t = (t + 1) % 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]
}

/**
 * Recolour heuristic (per opaque pixel; alpha untouched):
 *  1. outline  - max channel <= 40: kept (the near-black contour).
 *  2. neutral  - max-min channel spread <= 24: kept (white shirt/eyes, grey highlights).
 *  3. skin     - warm hue (8..32 deg), light (HSL L >= 0.55) and fairly unsaturated (1 - min/max <= 0.55, which
 *                separates skin from the vivid orange cap highlight): kept, so every NPC keeps a natural face and hands.
 *  4. hat group (primary) - hue within 30 deg of red: the player's cap and hair-like reds. Hue rotated by
 *     `primary.hue`, saturation/lightness scaled.
 *  5. everything else (secondary) - jacket, trousers, shoes, bag strap, bag: hue rotated by `secondary.hue`,
 *     saturation/lightness scaled.
 * Rotating hue while keeping each pixel's relative lightness preserves the player's 3-4 tone shading,
 * so the variants stay in the same art style.
 */
export function recolourPixel([r, g, b], { primary, secondary }) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max <= 40) return [r, g, b]
  if (max - min <= 24) return [r, g, b]
  const [h, s, l] = rgbToHsl(r, g, b)
  if (h >= 8 && h <= 32 && l >= 0.55 && 1 - min / max <= 0.55) return [r, g, b]
  const hatGroup = h <= 30 || h >= 330
  const t = hatGroup ? primary : secondary
  const out = hslToRgb(h + t.hue, Math.min(1, s * (t.sat ?? 1)), Math.min(0.95, Math.max(0.05, l * (t.light ?? 1))))
  return out.map((v) => Math.round(v))
}

export function recolourCharacter(img, scheme) {
  const out = { width: img.width, height: img.height, data: new Uint8Array(img.data) }
  for (let i = 0; i < img.width * img.height; i++) {
    if (!img.data[i * 4 + 3]) continue
    const [r, g, b] = recolourPixel([img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]], scheme)
    out.data.set([r, g, b], i * 4)
  }
  return out
}

/** Hue offsets are in degrees; sat/light are multipliers. See recolourPixel for what each group covers. */
export const NPC_SCHEMES = {
  'npc-red': { name: 'NPC Red', primary: { hue: -14, sat: 1, light: 1.08 }, secondary: { hue: 0, sat: 0.3, light: 1.05 } },
  'npc-blue': { name: 'NPC Blue', primary: { hue: 218, sat: 0.95, light: 1 }, secondary: { hue: 150, sat: 0.9, light: 1 } },
  'npc-green': { name: 'NPC Green', primary: { hue: 120, sat: 0.85, light: 0.95 }, secondary: { hue: 40, sat: 0.9, light: 1 } },
}

// ── asset table ─────────────────────────────────────────────────────────────────────────────────

const objectMeta = (name, extra = {}) => ({
  version: 1,
  name,
  kind: 'object',
  frameWidth: SIZE,
  frameHeight: SIZE,
  margin: 0,
  spacing: 0,
  pivotX: 0.5,
  pivotY: 1,
  sheet: 'sheet.png',
  ...extra,
})

/**
 * Everything this tool owns: `{ 'objects/sign/sprite.json': Buffer, ... }`, keyed by path relative to
 * project/sprites. `readPlayerSheet(file)` supplies the player's PNG bytes for the recolours.
 */
export function buildAssets(readPlayerSheet) {
  const files = {}
  const json = (v) => Buffer.from(JSON.stringify(v, null, 2) + '\n')
  const add = (id, meta, sheets) => {
    files[`${id}/sprite.json`] = json(meta)
    for (const [file, img] of Object.entries(sheets)) files[`${id}/${file}`] = encodePng(img)
  }

  add('objects/sign', objectMeta('Wooden Sign'), { 'sheet.png': drawSign() })
  add('objects/chest', objectMeta('Chest'), { 'sheet.png': strip([drawChest(false), drawChest(true)]) })
  add('objects/item-ball', objectMeta('Item Ball'), { 'sheet.png': drawItemBall() })
  add('objects/door', objectMeta('Door'), { 'sheet.png': strip([drawDoor(false), drawDoor(true)]) })
  add(
    'objects/flower',
    objectMeta('Flower', {
      kind: 'animated',
      animations: { sway: { frames: [0, 1, 2, 1], fps: 4, loop: true } },
    }),
    { 'sheet.png': strip([drawFlower(-3), drawFlower(0), drawFlower(3)]) },
  )

  const player = JSON.parse(readPlayerSheet('sprite.json').toString())
  for (const [key, scheme] of Object.entries(NPC_SCHEMES)) {
    const meta = { ...player, name: scheme.name }
    const sheets = {}
    for (const file of [player.character.sheets.walk, player.character.sheets.run]) {
      sheets[file] = recolourCharacter(decodePng(readPlayerSheet(file)), scheme)
    }
    add(`characters/${key}`, meta, sheets)
  }
  return files
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────

function main(argv) {
  const check = argv.includes('--check')
  const playerDir = path.join(PROJECT_SPRITES, 'characters/player')
  const files = buildAssets((f) => fs.readFileSync(path.join(playerDir, f)))
  let changed = 0
  for (const [rel, bytes] of Object.entries(files)) {
    const abs = path.join(PROJECT_SPRITES, rel)
    const current = fs.existsSync(abs) ? fs.readFileSync(abs) : null
    if (current && current.equals(bytes)) continue
    changed++
    if (check) {
      console.error(`${current ? 'differs' : 'missing'}: project/sprites/${rel}`)
      continue
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, bytes)
    console.log(`wrote project/sprites/${rel}`)
  }
  if (check) return changed ? 1 : 0
  if (!changed) console.log('placeholder sprites already up to date')
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2))
