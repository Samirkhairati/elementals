// Colour maths of a look's adjustments, and baking them into a 3D lookup table. Everything in LookAdjust is a
// function of one pixel's colour, so it is evaluated here once per LUT entry (CPU, pure) and the shader only does a
// table lookup: the editor and the game read the very same numbers.

import type { CurvePoints, GradeWheel, HslBand, LookAdjust, OverlayMode } from './types.ts'
import { HSL_BANDS, HSL_BAND_HUES, LUT_SIZE } from './schema.ts'

type RGB = [number, number, number]

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
export const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
export const toSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)
const luma = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function rgbToHex(c: RGB): string {
  return `#${c.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')).join('')}`
}

/** h 0..360, s and l 0..1. */
export function rgbToHsl(c: RGB): RGB {
  const [r, g, b] = c
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h * 60, s, l]
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) return [l, l, l]
  const hue = (((h % 360) + 360) % 360) / 360
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [f(hue + 1 / 3), f(hue), f(hue - 1 / 3)]
}

/** CIE Lab of an sRGB colour (D65), the space the colour-range mask measures distances in. */
export function rgbToLab(c: RGB): RGB {
  const r = toLinear(c[0])
  const g = toLinear(c[1])
  const b = toLinear(c[2])
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

// ── curves ─────────────────────────────────────────────────────────────────────────────────────────

/** A monotone cubic (Fritsch-Carlson) through the points, sampled into a 256-entry table. */
export function curveTable(points: CurvePoints | undefined): Float32Array | null {
  if (!points || points.length < 2) return null
  const pts = [...points].sort((a, b) => a.x - b.x)
  if (pts.every((p) => Math.abs(p.x - p.y) < 1e-6)) return null
  const n = pts.length
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const d: number[] = []
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]))
  const m: number[] = new Array(n)
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / d[i]
    const b = m[i + 1] / d[i]
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[i] = t * a * d[i]
      m[i + 1] = t * b * d[i]
    }
  }
  const out = new Float32Array(256)
  let seg = 0
  for (let k = 0; k < 256; k++) {
    const x = k / 255
    if (x <= xs[0]) {
      out[k] = ys[0]
      continue
    }
    if (x >= xs[n - 1]) {
      out[k] = ys[n - 1]
      continue
    }
    while (seg < n - 2 && x > xs[seg + 1]) seg++
    const h = xs[seg + 1] - xs[seg]
    const t = (x - xs[seg]) / h
    const t2 = t * t
    const t3 = t2 * t
    out[k] = clamp01(
      (2 * t3 - 3 * t2 + 1) * ys[seg] + (t3 - 2 * t2 + t) * h * m[seg] + (-2 * t3 + 3 * t2) * ys[seg + 1] + (t3 - t2) * h * m[seg + 1]
    )
  }
  return out
}

const sampleTable = (t: Float32Array, v: number) => {
  const x = clamp01(v) * 255
  const i = Math.min(254, Math.floor(x))
  const f = x - i
  return t[i] + (t[i + 1] - t[i]) * f
}

// ── the colour function ────────────────────────────────────────────────────────────────────────────

/** A prepared adjustment: the per-colour work with everything that does not depend on the colour done once. */
export type ColorFn = (c: RGB) => RGB

const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

function wheelColor(w: GradeWheel | undefined): { tint: RGB; lum: number } | null {
  if (!w) return null
  const sat = (w.sat ?? 0) / 100
  const lum = (w.lum ?? 0) / 100
  if (sat === 0 && lum === 0) return null
  const c = hslToRgb(w.hue ?? 0, 1, 0.5)
  const m = (c[0] + c[1] + c[2]) / 3
  return { tint: [(c[0] - m) * sat, (c[1] - m) * sat, (c[2] - m) * sat], lum }
}

function blendOverlay(c: RGB, o: RGB, mode: OverlayMode): RGB {
  const ch = (a: number, b: number): number => {
    switch (mode) {
      case 'multiply':
        return a * b
      case 'screen':
        return 1 - (1 - a) * (1 - b)
      case 'overlay':
        return a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b)
      case 'softlight':
        return b < 0.5 ? a - (1 - 2 * b) * a * (1 - a) : a + (2 * b - 1) * ((a < 0.25 ? ((16 * a - 12) * a + 4) * a : Math.sqrt(a)) - a)
      case 'add':
        return a + b
      default:
        return b
    }
  }
  if (mode === 'color') {
    // Hue and saturation of the colour, brightness of the picture.
    const l = luma(c)
    const ol = luma(o)
    return [o[0] - ol + l, o[1] - ol + l, o[2] - ol + l]
  }
  return [ch(c[0], o[0]), ch(c[1], o[1]), ch(c[2], o[2])]
}

/** Builds the colour function of an adjustment (sRGB in, sRGB out, 0..1). */
export function colorFunction(a: LookAdjust): ColorFn {
  const off = a.off ?? {}
  const light = !off.light
  const color = !off.color
  const fx = !off.effects
  const ev = light ? a.exposure ?? 0 : 0
  const expGain = Math.pow(2, ev)
  const contrast = light ? (a.contrast ?? 0) / 100 : 0
  const contrastGamma = Math.pow(2, contrast * 1.4)
  const highlights = light ? (a.highlights ?? 0) / 100 : 0
  const shadows = light ? (a.shadows ?? 0) / 100 : 0
  const whites = light ? (a.whites ?? 0) / 100 : 0
  const blacks = light ? (a.blacks ?? 0) / 100 : 0
  const temp = color ? (a.temperature ?? 0) / 100 : 0
  const tint = color ? (a.tint ?? 0) / 100 : 0
  const vibrance = color ? (a.vibrance ?? 0) / 100 : 0
  const saturation = color ? (a.saturation ?? 0) / 100 : 0
  const fade = fx ? (a.fade ?? 0) / 100 : 0
  // White balance gains in linear light, normalised so mid grey keeps its brightness.
  const gains: RGB = [1 + 0.32 * temp + 0.12 * tint, 1 - 0.25 * tint, 1 - 0.32 * temp + 0.12 * tint]
  const gl = 0.2126 * gains[0] + 0.7152 * gains[1] + 0.0722 * gains[2]
  gains[0] /= gl
  gains[1] /= gl
  gains[2] /= gl
  const curves = off.curves ? null : a.curves
  const tRgb = curveTable(curves?.rgb)
  const tR = curveTable(curves?.r)
  const tG = curveTable(curves?.g)
  const tB = curveTable(curves?.b)
  const hsl = off.mixer ? undefined : a.hsl
  const bands = hsl
    ? HSL_BANDS.flatMap((band: HslBand) => {
        const b = hsl[band]
        if (!b || ((b.h ?? 0) === 0 && (b.s ?? 0) === 0 && (b.l ?? 0) === 0)) return []
        return [{ hue: HSL_BAND_HUES[band], dh: ((b.h ?? 0) / 100) * 30, ds: (b.s ?? 0) / 100, dl: (b.l ?? 0) / 100 }]
      })
    : []
  const g = off.grading ? undefined : a.grading
  const wS = wheelColor(g?.shadows)
  const wM = wheelColor(g?.midtones)
  const wH = wheelColor(g?.highlights)
  const wG = wheelColor(g?.global)
  const blending = ((g?.blending ?? 50) / 100) * 0.5 + 0.1
  const balance = (g?.balance ?? 0) / 100
  const overlay = fx && a.overlay && a.overlay.amount > 0 ? { rgb: hexToRgb(a.overlay.color), amount: a.overlay.amount / 100, mode: a.overlay.mode ?? 'softlight' } : null

  return (input: RGB): RGB => {
    // linear light: white balance and exposure
    let r = toLinear(input[0]) * gains[0] * expGain
    let gg = toLinear(input[1]) * gains[1] * expGain
    let b = toLinear(input[2]) * gains[2] * expGain
    // a soft shoulder instead of a hard clip when exposure pushes past white
    if (ev > 0) {
      const k = (v: number) => (v > 0.8 ? 0.8 + (0.2 * (v - 0.8)) / (0.2 + (v - 0.8)) : v)
      r = k(r)
      gg = k(gg)
      b = k(b)
    }
    let c: RGB = [toSrgb(clamp01(r)), toSrgb(clamp01(gg)), toSrgb(clamp01(b))]

    // tone: contrast (an S curve around mid grey that never clips), then the four zones by brightness
    if (contrast !== 0) {
      const s = (v: number) => (v < 0.5 ? 0.5 * Math.pow(2 * v, contrastGamma) : 1 - 0.5 * Math.pow(2 * (1 - v), contrastGamma))
      c = [s(c[0]), s(c[1]), s(c[2])]
    }
    if (highlights !== 0 || shadows !== 0 || whites !== 0 || blacks !== 0) {
      const L = luma(c)
      const wSh = Math.pow(1 - smoothstep(0, 0.55, L), 2)
      const wHi = Math.pow(smoothstep(0.45, 1, L), 2)
      const wWh = smoothstep(0.6, 1, L)
      const wBl = 1 - smoothstep(0, 0.35, L)
      const delta = shadows * 0.35 * wSh + highlights * 0.35 * wHi + whites * 0.25 * wWh + blacks * 0.2 * wBl
      c = [c[0] + delta, c[1] + delta, c[2] + delta]
    }
    c = [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])]

    // curves: the master curve, then each channel's
    if (tRgb) c = [sampleTable(tRgb, c[0]), sampleTable(tRgb, c[1]), sampleTable(tRgb, c[2])]
    if (tR) c[0] = sampleTable(tR, c[0])
    if (tG) c[1] = sampleTable(tG, c[1])
    if (tB) c[2] = sampleTable(tB, c[2])

    // colour mixer: each band pulls the hues near it
    if (bands.length > 0) {
      let [h, s, l] = rgbToHsl(c)
      if (s > 0.001) {
        let dh = 0
        let ds = 0
        let dl = 0
        for (const band of bands) {
          const w = Math.max(0, 1 - hueDistance(h, band.hue) / 45)
          if (w === 0) continue
          const ww = w * w * (3 - 2 * w)
          dh += band.dh * ww
          ds += band.ds * ww
          dl += band.dl * ww
        }
        h += dh
        s = clamp01(s * (1 + ds))
        l = clamp01(l + dl * 0.3 * Math.min(1, s * 2))
        c = hslToRgb(h, s, l)
      }
    }

    // vibrance (more on dull colours, spares the near-saturated) and saturation
    if (vibrance !== 0 || saturation !== 0) {
      const L = luma(c)
      const max = Math.max(c[0], c[1], c[2])
      const min = Math.min(c[0], c[1], c[2])
      const sat = max - min
      const k = 1 + saturation + vibrance * (1 - sat) * (vibrance > 0 ? 1.2 : 1)
      c = [L + (c[0] - L) * k, L + (c[1] - L) * k, L + (c[2] - L) * k]
    }

    // colour grading: shadows / midtones / highlights wheels by brightness, then the global wheel
    if (wS || wM || wH || wG) {
      const L = clamp01(luma(c))
      const split = 0.5 + balance * 0.3
      const ws = 1 - smoothstep(split - blending, split + blending * 0.5, L)
      const wh = smoothstep(split - blending * 0.5, split + blending, L)
      const wm = Math.max(0, 1 - ws - wh)
      const add = (w: { tint: RGB; lum: number } | null, k: number) => {
        if (!w || k === 0) return
        c = [c[0] + w.tint[0] * k * 0.6 + w.lum * k * 0.3, c[1] + w.tint[1] * k * 0.6 + w.lum * k * 0.3, c[2] + w.tint[2] * k * 0.6 + w.lum * k * 0.3]
      }
      add(wS, ws)
      add(wM, wm)
      add(wH, wh)
      add(wG, 1)
    }

    // a coloured light / filter laid over everything
    if (overlay) {
      const cc: RGB = [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])]
      const o = blendOverlay(cc, overlay.rgb, overlay.mode)
      c = [cc[0] + (o[0] - cc[0]) * overlay.amount, cc[1] + (o[1] - cc[1]) * overlay.amount, cc[2] + (o[2] - cc[2]) * overlay.amount]
    }

    if (fade !== 0) {
      const lift = fade * 0.22
      c = [lift + clamp01(c[0]) * (1 - lift * 0.9), lift + clamp01(c[1]) * (1 - lift * 0.9), lift + clamp01(c[2]) * (1 - lift * 0.9)]
    }
    return [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])]
  }
}

/** Two colour functions one after the other (inner first). */
export const chainColor = (fns: ColorFn[]): ColorFn => (fns.length === 1 ? fns[0] : (c) => fns.reduce((acc, f) => f(acc), c))

export const IDENTITY: ColorFn = (c) => c

/**
 * Writes one LUT strip into an atlas: entry (r, g, b) at x = b * N + r, y = row0 + g, RGBA bytes. The shader reads
 * it with `lookLut` (two bilinear taps blended across b).
 */
export function bakeStrip(fn: ColorFn, out: Uint8Array, atlasWidth: number, row0: number, n = LUT_SIZE): void {
  const step = 1 / (n - 1)
  for (let gi = 0; gi < n; gi++) {
    for (let bi = 0; bi < n; bi++) {
      for (let ri = 0; ri < n; ri++) {
        const c = fn([ri * step, gi * step, bi * step])
        const o = ((row0 + gi) * atlasWidth + bi * n + ri) * 4
        out[o] = Math.round(c[0] * 255)
        out[o + 1] = Math.round(c[1] * 255)
        out[o + 2] = Math.round(c[2] * 255)
        out[o + 3] = 255
      }
    }
  }
}

/** The same lookup the shader does (trilinear), for tests and CPU previews. */
export function sampleStrip(atlas: Uint8Array, atlasWidth: number, row0: number, c: RGB, n = LUT_SIZE): RGB {
  const fetch = (ri: number, gi: number, bi: number, ch: number) => atlas[((row0 + gi) * atlasWidth + bi * n + ri) * 4 + ch] / 255
  const x = clamp01(c[0]) * (n - 1)
  const y = clamp01(c[1]) * (n - 1)
  const z = clamp01(c[2]) * (n - 1)
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z)
  const x1 = Math.min(n - 1, x0 + 1), y1 = Math.min(n - 1, y0 + 1), z1 = Math.min(n - 1, z0 + 1)
  const fx = x - x0, fy = y - y0, fz = z - z0
  const out: RGB = [0, 0, 0]
  for (let ch = 0; ch < 3; ch++) {
    const l = (a: number, b: number, t: number) => a + (b - a) * t
    const c00 = l(fetch(x0, y0, z0, ch), fetch(x1, y0, z0, ch), fx)
    const c10 = l(fetch(x0, y1, z0, ch), fetch(x1, y1, z0, ch), fx)
    const c01 = l(fetch(x0, y0, z1, ch), fetch(x1, y0, z1, ch), fx)
    const c11 = l(fetch(x0, y1, z1, ch), fetch(x1, y1, z1, ch), fx)
    out[ch] = l(l(c00, c10, fy), l(c01, c11, fy), fz)
  }
  return out
}
