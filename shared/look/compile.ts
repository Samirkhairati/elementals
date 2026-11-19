// Compiling looks into what the shader reads: a LUT atlas (strip 0 = the global adjustments, one strip per mask),
// packed mask components, a brush texture, the vignette / grain numbers and the shader list. The editor and the game
// both upload exactly this, so a look renders the same in both.

import type { BrushStroke, Look, LookMask, MaskComponent, ShaderUse } from './types.ts'
import { LUT_SIZE, MAX_BRUSHES, MAX_COMPONENTS, MAX_MASKS, isNeutralAdjust } from './schema.ts'
import type { LookAdjust } from './types.ts'
import { IDENTITY, bakeStrip, chainColor, colorFunction, hexToRgb, rgbToLab, type ColorFn } from './bake.ts'

/** Where a look's mask shapes live: the picture's own box (`subject`) or map pixels (`world`). */
export type LookSpace = 'subject' | 'world'

export interface LookLayer {
  look: Look
  space: LookSpace
}

export interface CompileOptions {
  /** Size of the subject box in pixels (a picture as drawn); the map size for layer / map looks. */
  subjectSize: { w: number; h: number }
  /** The map's size in pixels (brush masks of `world` looks cover it). */
  mapSize: { w: number; h: number }
  /** LUT edge (default LUT_SIZE); smaller during profile transitions. */
  lutSize?: number
}

export interface CompiledLook {
  /** Stable for equal inputs: a cache key. */
  key: string
  lutSize: number
  /** RGBA bytes, `lutSize²` wide and `lutSize * (1 + MAX_MASKS)` tall. */
  lut: Uint8Array
  lutWidth: number
  lutHeight: number
  /** Global adjustments do something (else the shader skips strip 0). */
  hasGlobal: boolean
  maskCount: number
  /** Per mask: amount, invert, first component, component count. */
  masks: Float32Array
  compCount: number
  /** Per component, 3 vec4: [type, mode, flags, strength], params 0-3, params 4-7. */
  comps: Float32Array
  /** RGBA, one brush component per channel; null when no brush. */
  brush: Uint8Array | null
  brushSize: number
  /** amount (-1..1), midpoint, roundness, feather. */
  vignette: [number, number, number, number]
  vignetteColor: [number, number, number]
  /** amount, size, animated, unused. */
  grain: [number, number, number, number]
  /** The look's mask id → its index in `masks` (the mask preview picks one). */
  maskIndex: Record<string, number>
  shaders: ShaderUse[]
  warnings: string[]
  /** Texture, clarity, dehaze (-1..1 each), unused: the detail pass (LOOK_DETAIL_FRAG); all 0 = no detail pass. */
  detail: [number, number, number, number]
  /** The grade pass would change nothing (no colour adjustment, mask, vignette or grain); the detail pass may still run. */
  gradeNeutral: boolean
  /** True when nothing would change a pixel (no grade and no detail: skip the passes). */
  neutral: boolean
}

/** Whether a compiled look has a detail pass. */
export const hasDetail = (c: Pick<CompiledLook, 'detail'>): boolean => c.detail[0] !== 0 || c.detail[1] !== 0 || c.detail[2] !== 0

const clampUnit = (v: number) => Math.max(-1, Math.min(1, v))

/** An adjustment without its detail fields: what the LUT depends on (a texture drag does not bake it again). */
function colourPart(a: LookAdjust | undefined): LookAdjust | null {
  if (!a) return null
  const { texture: _t, clarity: _c, dehaze: _d, ...rest } = a
  return rest
}

/** The detail of a stack of looks: their global texture, clarity and dehaze added up (a mask's are not applied). */
function detailOf(adjusts: readonly (LookAdjust | undefined)[]): CompiledLook['detail'] {
  let texture = 0
  let clarity = 0
  let dehaze = 0
  for (const a of adjusts) {
    if (!a || a.off?.effects) continue
    texture += (a.texture ?? 0) / 100
    clarity += (a.clarity ?? 0) / 100
    dehaze += (a.dehaze ?? 0) / 100
  }
  return [clampUnit(texture), clampUnit(clarity), clampUnit(dehaze), 0]
}

export const COMP_TYPE = { all: 0, linear: 1, radial: 2, rect: 3, brush: 4, color: 5, luminance: 6 } as const
export const COMP_MODE = { add: 0, subtract: 1, intersect: 2 } as const

// ── brush masks ────────────────────────────────────────────────────────────────────────────────────

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Brush texture edge for a mask space of this size: one texel per two pixels, 64..1024. */
export const brushResolution = (w: number, h: number): number => Math.min(1024, Math.max(64, Math.ceil(Math.max(w, h) / 2)))

/**
 * Paints brush strokes into one channel of an RGBA buffer (`res` x `res` texels covering a `w` x `h` space).
 * Within a stroke the dabs do not build up (a stroke covers evenly at its flow); strokes add up, erasers take away.
 */
export function rasterizeStrokes(strokes: readonly BrushStroke[], w: number, h: number, res: number, out: Uint8Array, channel: number): void {
  const sx = res / Math.max(1, w)
  const sy = res / Math.max(1, h)
  const acc = new Float32Array(res * res)
  for (let i = 0; i < res * res; i++) acc[i] = out[i * 4 + channel] / 255
  const stroke = new Float32Array(res * res)
  for (const s of strokes) {
    stroke.fill(0)
    const r = Math.max(0.5, s.size)
    const inner = r * (1 - s.feather)
    const spacing = Math.max(0.5 / Math.min(sx, sy), r * 0.2)
    const dab = (x: number, y: number) => {
      const x0 = Math.max(0, Math.floor((x - r) * sx))
      const x1 = Math.min(res - 1, Math.ceil((x + r) * sx))
      const y0 = Math.max(0, Math.floor((y - r) * sy))
      const y1 = Math.min(res - 1, Math.ceil((y + r) * sy))
      for (let ty = y0; ty <= y1; ty++) {
        const py = (ty + 0.5) / sy - y
        for (let tx = x0; tx <= x1; tx++) {
          const px = (tx + 0.5) / sx - x
          const d = Math.sqrt(px * px + py * py)
          if (d >= r) continue
          const a = d <= inner ? 1 : 1 - smooth(inner, r, d)
          const k = ty * res + tx
          if (a > stroke[k]) stroke[k] = a
        }
      }
    }
    const p = s.points
    dab(p[0], p[1])
    for (let i = 2; i + 1 < p.length; i += 2) {
      const ax = p[i - 2], ay = p[i - 1], bx = p[i], by = p[i + 1]
      const len = Math.hypot(bx - ax, by - ay)
      const steps = Math.max(1, Math.ceil(len / spacing))
      for (let k = 1; k <= steps; k++) dab(ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps)
    }
    for (let i = 0; i < acc.length; i++) {
      const a = stroke[i] * s.flow
      if (a === 0) continue
      acc[i] = s.erase ? acc[i] * (1 - a) : acc[i] + a * (1 - acc[i])
    }
  }
  for (let i = 0; i < acc.length; i++) out[i * 4 + channel] = Math.round(acc[i] * 255)
}

// ── hashing ────────────────────────────────────────────────────────────────────────────────────────

/** FNV-1a of a string, base 36. */
export function hashString(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

// ── compiling ──────────────────────────────────────────────────────────────────────────────────────

const lutCache = new Map<string, Uint8Array>()
const LUT_CACHE_MAX = 64

function packComponent(c: MaskComponent, space: LookSpace, brushChannel: number, brushBounds: { w: number; h: number }, out: Float32Array, at: number): void {
  const o = at * 12
  const flags = (c.invert ? 1 : 0) + (space === 'world' ? 2 : 0)
  out[o] = COMP_TYPE[c.type]
  out[o + 1] = COMP_MODE[c.mode]
  out[o + 2] = flags
  out[o + 3] = c.strength ?? 1
  switch (c.type) {
    case 'linear':
      out.set([c.x1, c.y1, c.x2, c.y2], o + 4)
      break
    case 'radial': {
      const a = ((c.rotation ?? 0) * Math.PI) / 180
      out.set([c.cx, c.cy, Math.max(0.5, c.rx), Math.max(0.5, c.ry), Math.cos(a), Math.sin(a), c.feather ?? 0.5, 0], o + 4)
      break
    }
    case 'rect':
      out.set([c.x, c.y, c.w, c.h, c.feather ?? 0, c.radius ?? 0, 0, 0], o + 4)
      break
    case 'brush':
      out.set([brushChannel, 0, 0, 0, 1 / Math.max(1, brushBounds.w), 1 / Math.max(1, brushBounds.h), 0, 0], o + 4)
      break
    case 'color': {
      const lab = rgbToLab(hexToRgb(c.color))
      const range = c.range ?? 50
      const dE = 4 + range * 0.6
      const band = dE * (0.15 + (c.softness ?? 50) / 100)
      out.set([lab[0], lab[1], lab[2], dE, band, 0, 0, 0], o + 4)
      break
    }
    case 'luminance':
      out.set([c.low, c.high, c.featherLow ?? 0.1, c.featherHigh ?? 0.1], o + 4)
      break
    default:
      break
  }
}

const usableMask = (m: LookMask) => m.visible !== false && (m.amount ?? 1) > 0 && m.components.some((c) => c.visible !== false)

/**
 * Compiles a stack of looks (inner first: a picture's own look, then its layer's) into one shader program state.
 * Their global adjustments run one after the other (baked into one strip), then every mask of every look in order.
 * Over the limits (MAX_MASKS masks, MAX_COMPONENTS components, MAX_BRUSHES brushes) the rest is left out with a warning.
 */
export function compileLooks(stack: readonly LookLayer[], options: CompileOptions): CompiledLook {
  const n = options.lutSize ?? LUT_SIZE
  const lutWidth = n * n
  const lutHeight = n * (1 + MAX_MASKS)
  const warnings: string[] = []
  const active = stack.filter((l) => l.look.enabled !== false)

  const globals: ColorFn[] = active.filter((l) => !isNeutralAdjust(l.look.adjust)).map((l) => colorFunction(l.look.adjust ?? {}))
  const hasGlobal = globals.length > 0

  const masks = new Float32Array(MAX_MASKS * 4)
  const comps = new Float32Array(MAX_COMPONENTS * 12)
  const maskFns: ColorFn[] = []
  const maskIndex: Record<string, number> = {}
  let maskCount = 0
  let compCount = 0
  const brushes: { strokes: BrushStroke[]; w: number; h: number }[] = []
  for (const layer of active) {
    const bounds = layer.space === 'world' ? options.mapSize : options.subjectSize
    for (const mask of layer.look.masks ?? []) {
      if (!usableMask(mask)) continue
      if (maskCount >= MAX_MASKS) {
        warnings.push(`only ${MAX_MASKS} masks are applied; "${mask.name}" is left out`)
        continue
      }
      const visible = mask.components.filter((c) => c.visible !== false)
      const first = compCount
      for (const c of visible) {
        if (compCount >= MAX_COMPONENTS) {
          warnings.push(`only ${MAX_COMPONENTS} mask parts are applied; the rest of "${mask.name}" is left out`)
          break
        }
        let channel = 0
        if (c.type === 'brush') {
          if (brushes.length >= MAX_BRUSHES) {
            warnings.push(`only ${MAX_BRUSHES} brush parts are applied; one of "${mask.name}" is left out`)
            continue
          }
          channel = brushes.length
          brushes.push({ strokes: c.strokes, w: bounds.w, h: bounds.h })
        }
        packComponent(c, layer.space, channel, bounds, comps, compCount)
        compCount++
      }
      if (compCount === first) continue
      masks.set([mask.amount ?? 1, mask.invert ? 1 : 0, first, compCount - first], maskCount * 4)
      maskIndex[mask.id] = maskCount
      maskFns.push(isNeutralAdjust(mask.adjust) ? IDENTITY : colorFunction(mask.adjust))
      maskCount++
    }
  }

  // The LUT atlas: baked once per distinct set of adjustments (most subjects share a preset).
  const adjustKey = hashString(
    JSON.stringify([n, active.map((l) => colourPart(l.look.adjust)), active.map((l) => (l.look.masks ?? []).filter(usableMask).map((m) => colourPart(m.adjust)))])
  )
  let lut = lutCache.get(adjustKey)
  if (!lut) {
    lut = new Uint8Array(lutWidth * lutHeight * 4)
    bakeStrip(hasGlobal ? chainColor(globals) : IDENTITY, lut, lutWidth, 0, n)
    maskFns.forEach((fn, i) => bakeStrip(fn, lut!, lutWidth, n * (i + 1), n))
    lutCache.set(adjustKey, lut)
    if (lutCache.size > LUT_CACHE_MAX) lutCache.delete(lutCache.keys().next().value!)
  }

  let brush: Uint8Array | null = null
  let brushSize = 0
  if (brushes.length > 0) {
    brushSize = Math.max(...brushes.map((b) => brushResolution(b.w, b.h)))
    brush = new Uint8Array(brushSize * brushSize * 4)
    brushes.forEach((b, i) => rasterizeStrokes(b.strokes, b.w, b.h, brushSize, brush!, i))
  }

  const vig = active.find((l) => l.look.vignette && l.look.vignette.amount !== 0)?.look.vignette
  const grain = active.find((l) => l.look.grain && l.look.grain.amount > 0)?.look.grain
  const vColor = vig?.color ? hexToRgb(vig.color) : vig && vig.amount > 0 ? ([1, 1, 1] as [number, number, number]) : ([0, 0, 0] as [number, number, number])
  const shaders = active.flatMap((l) => (l.look.shaders ?? []).filter((s) => s.visible !== false))
  const gradeNeutral = !hasGlobal && maskCount === 0 && !vig && !grain
  const detail = detailOf(active.map((l) => l.look.adjust))
  const neutral = gradeNeutral && !hasDetail({ detail })

  return {
    key: hashString(JSON.stringify([n, stack, options.subjectSize, options.mapSize])),
    lutSize: n,
    lut,
    lutWidth,
    lutHeight,
    hasGlobal,
    maskCount,
    masks,
    compCount,
    comps,
    brush,
    brushSize,
    vignette: vig ? [vig.amount / 100, (vig.midpoint ?? 50) / 100, (vig.roundness ?? 0) / 100, (vig.feather ?? 50) / 100] : [0, 0.5, 0, 0.5],
    vignetteColor: vColor,
    grain: grain ? [grain.amount / 100, grain.size ?? 1, grain.animated ? 1 : 0, 0] : [0, 1, 0, 0],
    maskIndex,
    shaders,
    warnings,
    detail,
    gradeNeutral,
    neutral,
  }
}

/**
 * A blend of two compiled looks for profile transitions: the global strips mix entry by entry, the masks of both
 * apply (faded out / in) when they fit together, else the nearer look's masks are used.
 */
export function mixCompiled(a: CompiledLook, b: CompiledLook, t: number): CompiledLook {
  if (t <= 0) return a
  if (t >= 1) return b
  if (a.lutSize !== b.lutSize) return t < 0.5 ? a : b
  const lut = new Uint8Array(a.lut.length)
  const stripBytes = a.lutWidth * a.lutSize * 4
  for (let i = 0; i < stripBytes; i++) lut[i] = Math.round(a.lut[i] + (b.lut[i] - a.lut[i]) * t)
  const lerp4 = (x: number[], y: number[]) => x.map((v, i) => v + (y[i] - v) * t)
  const fits = a.maskCount + b.maskCount <= MAX_MASKS && a.compCount + b.compCount <= MAX_COMPONENTS && (a.brush ? 1 : 0) + (b.brush ? 1 : 0) <= 1
  const base: CompiledLook = {
    ...(t < 0.5 ? a : b),
    key: `${a.key}~${b.key}@${t.toFixed(3)}`,
    lut,
    hasGlobal: a.hasGlobal || b.hasGlobal,
    vignette: lerp4(a.vignette, b.vignette) as CompiledLook['vignette'],
    vignetteColor: (a.vignette[0] === 0 ? b.vignetteColor : b.vignette[0] === 0 ? a.vignetteColor : lerp4(a.vignetteColor, b.vignetteColor)) as CompiledLook['vignetteColor'],
    grain: lerp4(a.grain, b.grain) as CompiledLook['grain'],
    detail: lerp4(a.detail, b.detail) as CompiledLook['detail'],
    gradeNeutral: a.gradeNeutral && b.gradeNeutral,
    neutral: a.neutral && b.neutral,
  }
  const near = t < 0.5 ? a : b
  if (!fits) {
    for (let k = 0; k < near.maskCount; k++) lut.set(near.lut.subarray(stripBytes * (k + 1), stripBytes * (k + 2)), stripBytes * (k + 1))
    return base
  }
  const masks = new Float32Array(MAX_MASKS * 4)
  const comps = new Float32Array(MAX_COMPONENTS * 12)
  masks.set(a.masks.subarray(0, a.maskCount * 4))
  comps.set(a.comps.subarray(0, a.compCount * 12))
  for (let k = 0; k < a.maskCount; k++) masks[k * 4] *= 1 - t
  for (let k = 0; k < b.maskCount; k++) {
    const o = (a.maskCount + k) * 4
    masks.set(b.masks.subarray(k * 4, k * 4 + 4), o)
    masks[o] *= t
    masks[o + 2] += a.compCount
  }
  comps.set(b.comps.subarray(0, b.compCount * 12), a.compCount * 12)
  for (let k = 0; k < a.maskCount + b.maskCount; k++) {
    const src = k < a.maskCount ? a : b
    const strip = k < a.maskCount ? k : k - a.maskCount
    lut.set(src.lut.subarray(stripBytes * (strip + 1), stripBytes * (strip + 2)), stripBytes * (k + 1))
  }
  return { ...base, masks, comps, maskCount: a.maskCount + b.maskCount, compCount: a.compCount + b.compCount, brush: a.brush ?? b.brush, brushSize: a.brush ? a.brushSize : b.brushSize, maskIndex: {} }
}
