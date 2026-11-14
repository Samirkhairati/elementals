// The sliders of a look (one table the editor builds its panels from and the cleaner clamps with), the limits of
// the shader, and the cleaning / resolving of stored looks. Pure, dependency-free.

import { isRecord } from '../engine/util.ts'
import type {
  AdjustSection,
  BrushStroke,
  CurvePoints,
  GradeWheel,
  Grain,
  HslBand,
  HslShift,
  Look,
  LookAdjust,
  LookMask,
  LookProfile,
  LooksFile,
  LookSet,
  MaskComponent,
  MaskMode,
  OverlayMode,
  ShaderUse,
  ShadowBlend,
  LookShadow,
  Vignette,
} from './types.ts'

/** Edge length of the 3D lookup tables (LUT_SIZE³ colours; the atlas is LUT_SIZE² wide). */
export const LUT_SIZE = 32
/** Masks with their own adjustments per compiled look (each is one LUT strip). */
export const MAX_MASKS = 4
/** Mask components per compiled look, all masks together. */
export const MAX_COMPONENTS = 16
/** Brush components per compiled look (one per channel of the brush texture). */
export const MAX_BRUSHES = 4

export const HSL_BANDS: readonly HslBand[] = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta']
/** Centre hue of each band, degrees. */
export const HSL_BAND_HUES: Readonly<Record<HslBand, number>> = { red: 0, orange: 30, yellow: 60, green: 120, aqua: 180, blue: 225, purple: 270, magenta: 315 }
export const HSL_BAND_COLORS: Readonly<Record<HslBand, string>> = {
  red: '#e5484d',
  orange: '#f76b15',
  yellow: '#ffd60a',
  green: '#46a758',
  aqua: '#12a594',
  blue: '#0090ff',
  purple: '#8e4ec6',
  magenta: '#d6409f',
}

export interface SliderDef {
  key: keyof LookAdjust
  label: string
  min: number
  max: number
  step: number
  /** CSS gradient for the slider track (Lightroom-style coloured tracks). */
  track?: string
  section: AdjustSection
}

const GREY_TRACK = 'linear-gradient(90deg, #1b1b1b, #e6e6e6)'

/** The plain sliders, in panel order. */
export const ADJUST_SLIDERS: readonly SliderDef[] = [
  { key: 'exposure', label: 'Exposure', min: -5, max: 5, step: 0.01, section: 'light', track: GREY_TRACK },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1, section: 'light' },
  { key: 'highlights', label: 'Highlights', min: -100, max: 100, step: 1, section: 'light' },
  { key: 'shadows', label: 'Shadows', min: -100, max: 100, step: 1, section: 'light' },
  { key: 'whites', label: 'Whites', min: -100, max: 100, step: 1, section: 'light' },
  { key: 'blacks', label: 'Blacks', min: -100, max: 100, step: 1, section: 'light' },
  { key: 'temperature', label: 'Temp', min: -100, max: 100, step: 1, section: 'color', track: 'linear-gradient(90deg, #3d6fd8, #c9c9c9, #e2b93b)' },
  { key: 'tint', label: 'Tint', min: -100, max: 100, step: 1, section: 'color', track: 'linear-gradient(90deg, #3fb950, #c9c9c9, #d04fd0)' },
  { key: 'vibrance', label: 'Vibrance', min: -100, max: 100, step: 1, section: 'color', track: 'linear-gradient(90deg, #8a8a8a, #d9534f, #f0ad4e, #5cb85c, #5bc0de)' },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1, section: 'color', track: 'linear-gradient(90deg, #8a8a8a, #e5484d, #ffd60a, #46a758, #0090ff, #d6409f)' },
  { key: 'dehaze', label: 'Dehaze', min: -100, max: 100, step: 1, section: 'effects' },
  { key: 'fade', label: 'Fade', min: 0, max: 100, step: 1, section: 'effects' },
]

export const OVERLAY_MODES: readonly OverlayMode[] = ['multiply', 'screen', 'overlay', 'softlight', 'color', 'add']
export const MASK_MODES: readonly MaskMode[] = ['add', 'subtract', 'intersect']

// ── cleaning ───────────────────────────────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : undefined)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)
const HEX = /^#[0-9a-fA-F]{6}$/
const hex = (v: unknown): string | undefined => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : undefined)

/** Drops undefined fields and empty objects, so a cleaned value round-trips byte for byte. */
function compact<T extends Record<string, unknown>>(o: T): T | undefined {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v
  return Object.keys(out).length > 0 ? (out as T) : undefined
}

function cleanCurve(v: unknown): CurvePoints | undefined {
  if (!Array.isArray(v)) return undefined
  const pts = v
    .filter(isRecord)
    .map((p) => ({ x: num(p.x, 0, 1), y: num(p.y, 0, 1) }))
    .filter((p): p is { x: number; y: number } => p.x !== undefined && p.y !== undefined)
    .sort((a, b) => a.x - b.x)
  return pts.length >= 2 ? pts : undefined
}

function cleanWheel(v: unknown): GradeWheel | undefined {
  if (!isRecord(v)) return undefined
  return compact({ hue: num(v.hue, 0, 360), sat: num(v.sat, 0, 100), lum: num(v.lum, -100, 100) })
}

export function cleanAdjust(v: unknown): LookAdjust | undefined {
  if (!isRecord(v)) return undefined
  const out: LookAdjust = {}
  for (const s of ADJUST_SLIDERS) {
    const n = num(v[s.key], s.min, s.max)
    if (n !== undefined) (out as Record<string, unknown>)[s.key] = n
  }
  if (isRecord(v.hsl)) {
    const hsl: Partial<Record<HslBand, HslShift>> = {}
    for (const band of HSL_BANDS) {
      const b = v.hsl[band]
      if (!isRecord(b)) continue
      const c = compact({ h: num(b.h, -100, 100), s: num(b.s, -100, 100), l: num(b.l, -100, 100) })
      if (c) hsl[band] = c
    }
    if (Object.keys(hsl).length > 0) out.hsl = hsl
  }
  if (isRecord(v.grading)) {
    const g = v.grading
    const grading = compact({
      shadows: cleanWheel(g.shadows),
      midtones: cleanWheel(g.midtones),
      highlights: cleanWheel(g.highlights),
      global: cleanWheel(g.global),
      blending: num(g.blending, 0, 100),
      balance: num(g.balance, -100, 100),
    })
    if (grading) out.grading = grading
  }
  if (isRecord(v.curves)) {
    const curves = compact({ rgb: cleanCurve(v.curves.rgb), r: cleanCurve(v.curves.r), g: cleanCurve(v.curves.g), b: cleanCurve(v.curves.b) })
    if (curves) out.curves = curves
  }
  if (isRecord(v.overlay)) {
    const color = hex(v.overlay.color)
    const amount = num(v.overlay.amount, 0, 100)
    const mode = OVERLAY_MODES.includes(v.overlay.mode as OverlayMode) ? (v.overlay.mode as OverlayMode) : undefined
    if (color && amount !== undefined) out.overlay = mode ? { color, amount, mode } : { color, amount }
  }
  if (isRecord(v.off)) {
    const off: Partial<Record<AdjustSection, boolean>> = {}
    for (const k of ['light', 'color', 'mixer', 'grading', 'curves', 'effects'] as const) if (v.off[k] === true) off[k] = true
    if (Object.keys(off).length > 0) out.off = off
  }
  return Object.keys(out).length > 0 ? out : undefined
}

const BIG = 1e6

function cleanStroke(v: unknown): BrushStroke | undefined {
  if (!isRecord(v) || !Array.isArray(v.points)) return undefined
  const points = v.points.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  if (points.length < 2) return undefined
  const s: BrushStroke = {
    points: points.length % 2 === 0 ? points : points.slice(0, -1),
    size: num(v.size, 0.5, 4096) ?? 16,
    feather: num(v.feather, 0, 1) ?? 0.5,
    flow: num(v.flow, 0, 1) ?? 1,
  }
  if (v.erase === true) s.erase = true
  return s
}

export function cleanComponent(v: unknown): MaskComponent | undefined {
  if (!isRecord(v)) return undefined
  const id = str(v.id)
  if (!id) return undefined
  const mode: MaskMode = MASK_MODES.includes(v.mode as MaskMode) ? (v.mode as MaskMode) : 'add'
  const base: Record<string, unknown> = { id, mode }
  if (v.invert === true) base.invert = true
  if (v.visible === false) base.visible = false
  const strength = num(v.strength, 0, 1)
  if (strength !== undefined && strength !== 1) base.strength = strength
  const n = (k: string, lo = -BIG, hi = BIG) => num(v[k], lo, hi)
  switch (v.type) {
    case 'all':
      return { ...base, type: 'all' } as MaskComponent
    case 'linear': {
      const [x1, y1, x2, y2] = [n('x1'), n('y1'), n('x2'), n('y2')]
      if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) return undefined
      return { ...base, type: 'linear', x1, y1, x2, y2 } as MaskComponent
    }
    case 'radial': {
      const [cx, cy, rx, ry] = [n('cx'), n('cy'), n('rx', 0.5), n('ry', 0.5)]
      if (cx === undefined || cy === undefined || rx === undefined || ry === undefined) return undefined
      return compactComponent({ ...base, type: 'radial', cx, cy, rx, ry, rotation: n('rotation', -360, 360), feather: n('feather', 0, 1) })
    }
    case 'rect': {
      const [x, y, w, h] = [n('x'), n('y'), n('w', 0), n('h', 0)]
      if (x === undefined || y === undefined || w === undefined || h === undefined) return undefined
      return compactComponent({ ...base, type: 'rect', x, y, w, h, feather: n('feather', 0, BIG), radius: n('radius', 0, BIG) })
    }
    case 'brush': {
      const strokes = Array.isArray(v.strokes) ? v.strokes.map(cleanStroke).filter((s): s is BrushStroke => !!s) : []
      return { ...base, type: 'brush', strokes } as MaskComponent
    }
    case 'color': {
      const color = hex(v.color)
      if (!color) return undefined
      return compactComponent({ ...base, type: 'color', color, range: n('range', 0, 100), softness: n('softness', 0, 100) })
    }
    case 'luminance': {
      const low = n('low', 0, 1)
      const high = n('high', 0, 1)
      if (low === undefined || high === undefined) return undefined
      return compactComponent({ ...base, type: 'luminance', low: Math.min(low, high), high: Math.max(low, high), featherLow: n('featherLow', 0, 1), featherHigh: n('featherHigh', 0, 1) })
    }
    default:
      return undefined
  }
}

const compactComponent = (c: Record<string, unknown>) => compact(c) as unknown as MaskComponent

function cleanMask(v: unknown): LookMask | undefined {
  if (!isRecord(v)) return undefined
  const id = str(v.id)
  if (!id) return undefined
  const components = Array.isArray(v.components) ? v.components.map(cleanComponent).filter((c): c is MaskComponent => !!c) : []
  const m: LookMask = { id, name: str(v.name) ?? 'Mask', components, adjust: cleanAdjust(v.adjust) ?? {} }
  if (v.visible === false) m.visible = false
  const amount = num(v.amount, 0, 1)
  if (amount !== undefined && amount !== 1) m.amount = amount
  if (v.invert === true) m.invert = true
  return m
}

function cleanVignette(v: unknown): Vignette | undefined {
  if (!isRecord(v)) return undefined
  const amount = num(v.amount, -100, 100)
  if (amount === undefined) return undefined
  return compact({ amount, midpoint: num(v.midpoint, 0, 100), roundness: num(v.roundness, -100, 100), feather: num(v.feather, 0, 100), color: hex(v.color) }) as Vignette
}

function cleanGrain(v: unknown): Grain | undefined {
  if (!isRecord(v)) return undefined
  const amount = num(v.amount, 0, 100)
  if (amount === undefined) return undefined
  return compact({ amount, size: num(v.size, 1, 8), animated: v.animated === true ? true : undefined }) as Grain
}

export const SHADOW_BLENDS: readonly ShadowBlend[] = ['normal', 'multiply', 'screen', 'add']
export const MAX_SHADOW_SOFTNESS = 64
export const MAX_SHADOW_OFFSET = 512
/** A new shadow: down and to the right, soft, half dark. */
export const DEFAULT_SHADOW: LookShadow = { x: 6, y: 8, softness: 4, opacity: 50 }

export function cleanShadow(v: unknown): LookShadow | undefined {
  if (!isRecord(v)) return undefined
  const x = num(v.x, -MAX_SHADOW_OFFSET, MAX_SHADOW_OFFSET)
  const y = num(v.y, -MAX_SHADOW_OFFSET, MAX_SHADOW_OFFSET)
  const blend = SHADOW_BLENDS.includes(v.blend as ShadowBlend) && v.blend !== 'multiply' ? (v.blend as ShadowBlend) : undefined
  return {
    x: x ?? 0,
    y: y ?? 0,
    ...compact({
      softness: num(v.softness, 0, MAX_SHADOW_SOFTNESS),
      opacity: num(v.opacity, 0, 100),
      color: hex(v.color),
      blend,
      off: v.off === true ? true : undefined,
    }),
  }
}

function cleanShaderUse(v: unknown): ShaderUse | undefined {
  if (!isRecord(v)) return undefined
  const id = str(v.id)
  const shader = str(v.shader)
  if (!id || !shader) return undefined
  const params: Record<string, number | number[]> = {}
  if (isRecord(v.params)) {
    for (const [k, p] of Object.entries(v.params)) {
      if (typeof p === 'number' && Number.isFinite(p)) params[k] = p
      else if (Array.isArray(p) && p.length >= 1 && p.length <= 4 && p.every((x) => typeof x === 'number' && Number.isFinite(x))) params[k] = p as number[]
    }
  }
  const out: ShaderUse = { id, shader }
  if (v.visible === false) out.visible = false
  if (Object.keys(params).length > 0) out.params = params
  return out
}

export function cleanLook(v: unknown): Look | undefined {
  if (!isRecord(v)) return undefined
  const masks = Array.isArray(v.masks) ? v.masks.map(cleanMask).filter((m): m is LookMask => !!m) : []
  const shaders = Array.isArray(v.shaders) ? v.shaders.map(cleanShaderUse).filter((s): s is ShaderUse => !!s) : []
  const look: Look = {}
  if (v.enabled === false) look.enabled = false
  const adjust = cleanAdjust(v.adjust)
  if (adjust) look.adjust = adjust
  if (masks.length > 0) look.masks = masks
  const vignette = cleanVignette(v.vignette)
  if (vignette) look.vignette = vignette
  const grain = cleanGrain(v.grain)
  if (grain) look.grain = grain
  const shadow = cleanShadow(v.shadow)
  if (shadow) look.shadow = shadow
  if (shaders.length > 0) look.shaders = shaders
  const preset = str(v.preset)
  if (preset) look.preset = preset
  return look
}

/** A stored look set, cleaned (unknown fields and out-of-range values dropped or clamped); undefined when empty. */
export function cleanLookSet(v: unknown): LookSet | undefined {
  if (!isRecord(v)) return undefined
  const out: LookSet = {}
  const def = cleanLook(v.default)
  if (def) out.default = def
  if (isRecord(v.profiles)) {
    const profiles: Record<string, Look> = {}
    for (const [id, l] of Object.entries(v.profiles)) {
      const look = cleanLook(l)
      if (look && id !== '') profiles[id] = look
    }
    if (Object.keys(profiles).length > 0) out.profiles = profiles
  }
  return out.default || out.profiles ? out : undefined
}

/** The profiles a project starts with (project/looks.json absent). */
export const DEFAULT_PROFILES: readonly LookProfile[] = [
  { id: 'day', name: 'Day' },
  { id: 'sunset', name: 'Sunset' },
  { id: 'night', name: 'Night' },
]

export function cleanLooksFile(v: unknown): LooksFile {
  const out: LooksFile = { version: 1, profiles: [] }
  if (isRecord(v) && Array.isArray(v.profiles)) {
    const seen = new Set<string>()
    for (const p of v.profiles) {
      if (!isRecord(p)) continue
      const id = str(p.id)
      if (!id || seen.has(id)) continue
      seen.add(id)
      out.profiles.push({ id, name: str(p.name) ?? id })
    }
  }
  if (!isRecord(v) || !Array.isArray(v.profiles)) out.profiles = DEFAULT_PROFILES.map((p) => ({ ...p }))
  if (isRecord(v)) {
    const start = str(v.start)
    if (start && out.profiles.some((p) => p.id === start)) out.start = start
    if (Array.isArray(v.presets)) {
      const presets = v.presets
        .filter(isRecord)
        .map((p) => ({ id: str(p.id), name: str(p.name), look: cleanLook(p.look) }))
        .filter((p): p is { id: string; name: string; look: Look } => !!p.id && !!p.name && !!p.look)
      if (presets.length > 0) out.presets = presets
    }
  }
  return out
}

/** Problems with a looks file (empty = storable). */
export function validateLooksFile(v: unknown): string[] {
  if (!isRecord(v)) return ['looks must be a JSON object']
  if (!Array.isArray(v.profiles)) return ['profiles must be a list']
  const errors: string[] = []
  const ids = new Set<string>()
  v.profiles.forEach((p, i) => {
    if (!isRecord(p) || typeof p.id !== 'string' || p.id === '') errors.push(`profiles[${i}] needs an id`)
    else if (ids.has(p.id)) errors.push(`profile id "${p.id}" is used twice`)
    else ids.add(p.id)
  })
  return errors
}

// ── resolving ──────────────────────────────────────────────────────────────────────────────────────

/** The look that applies to a subject in a profile (`null` profile = the default look only). Disabled looks are null. */
export function resolveLook(set: LookSet | undefined, profile: string | null): Look | null {
  if (!set) return null
  const look = (profile !== null ? set.profiles?.[profile] : undefined) ?? set.default
  if (!look || look.enabled === false) return null
  return look
}

/** True when the look changes nothing (no adjustment, mask, effect or shader that does anything). */
export function isNeutralLook(look: Look | null | undefined): boolean {
  if (!look || look.enabled === false) return true
  if (!isNeutralAdjust(look.adjust)) return false
  if ((look.masks ?? []).some((m) => m.visible !== false && (m.amount ?? 1) > 0 && m.components.some((c) => c.visible !== false) && !isNeutralAdjust(m.adjust))) return false
  if (look.vignette && look.vignette.amount !== 0) return false
  if (look.grain && look.grain.amount > 0) return false
  if ((look.shaders ?? []).some((s) => s.visible !== false)) return false
  return true
}

export function isNeutralAdjust(a: LookAdjust | undefined): boolean {
  if (!a) return true
  const off = a.off ?? {}
  for (const s of ADJUST_SLIDERS) {
    if (off[s.section]) continue
    const v = a[s.key]
    if (typeof v === 'number' && v !== 0) return false
  }
  if (!off.mixer && a.hsl && Object.values(a.hsl).some((b) => b && ((b.h ?? 0) !== 0 || (b.s ?? 0) !== 0 || (b.l ?? 0) !== 0))) return false
  if (!off.grading && a.grading) {
    const g = a.grading
    if ([g.shadows, g.midtones, g.highlights, g.global].some((w) => w && ((w.sat ?? 0) > 0 || (w.lum ?? 0) !== 0))) return false
  }
  if (!off.curves && a.curves && Object.values(a.curves).some((c) => c && c.some((p) => Math.abs(p.x - p.y) > 1e-6))) return false
  if (!off.effects && a.overlay && a.overlay.amount > 0) return false
  return true
}

/** A fresh id for masks, components and shader uses. */
export function lookId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}
