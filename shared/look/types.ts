// Looks: Lightroom-style colour grading of a picture, a layer or a whole map, with masks, user shaders and one
// look per profile (time of day, weather, ...). Type-only; see docs/looks.md for the model and the pipeline.
//
// A `LookSet` is what a map, a layer or a picture stores (`look`). It holds a `default` look and, per profile id,
// a look that replaces the default while that profile is active. Every number is optional: absent = neutral.

/** The eight hue bands of the colour mixer (HSL). */
export type HslBand = 'red' | 'orange' | 'yellow' | 'green' | 'aqua' | 'blue' | 'purple' | 'magenta'

export interface HslShift {
  /** -100..100 (= -30..30 degrees). */
  h?: number
  /** -100..100. */
  s?: number
  /** -100..100. */
  l?: number
}

/** One colour wheel of colour grading. */
export interface GradeWheel {
  /** 0..360. */
  hue?: number
  /** 0..100. */
  sat?: number
  /** -100..100. */
  lum?: number
}

/** A tone curve: points in 0..1, sorted by x; absent or fewer than two = straight line. */
export type CurvePoints = { x: number; y: number }[]

export type OverlayMode = 'multiply' | 'screen' | 'overlay' | 'softlight' | 'color' | 'add'

/**
 * The colour adjustments of a look or of one of its masks. Everything here is a per-pixel colour function, so it is
 * baked into a 3D lookup table (shared/look/bake.ts) and costs the same however much is set.
 */
export interface LookAdjust {
  // Light
  /** Exposure in stops, -5..5. */
  exposure?: number
  contrast?: number
  highlights?: number
  shadows?: number
  whites?: number
  blacks?: number
  // Colour
  temperature?: number
  tint?: number
  vibrance?: number
  saturation?: number
  hsl?: Partial<Record<HslBand, HslShift>>
  grading?: {
    shadows?: GradeWheel
    midtones?: GradeWheel
    highlights?: GradeWheel
    global?: GradeWheel
    /** 0..100, default 50: how far the three zones overlap. */
    blending?: number
    /** -100..100: moves the split between shadows and highlights. */
    balance?: number
  }
  curves?: { rgb?: CurvePoints; r?: CurvePoints; g?: CurvePoints; b?: CurvePoints }
  // Effects that are still colour functions
  dehaze?: number
  /** 0..100: lifts the blacks (matte). */
  fade?: number
  /** A colour laid over the picture (light colour, fog, ...). */
  overlay?: { color: string; amount: number; mode?: OverlayMode }
  /** Parts switched off with their eye (kept, not applied). */
  off?: Partial<Record<AdjustSection, boolean>>
}

export type AdjustSection = 'light' | 'color' | 'mixer' | 'grading' | 'curves' | 'effects'

// ── masks ──────────────────────────────────────────────────────────────────────────────────────────

/** How a mask component combines with the components before it. */
export type MaskMode = 'add' | 'subtract' | 'intersect'

/** One stroke of a brush mask, in the mask's space (pixels). */
export interface BrushStroke {
  /** Flat x, y pairs. */
  points: number[]
  /** Radius in pixels. */
  size: number
  /** 0..1: soft edge as a share of the radius. */
  feather: number
  /** 0..1: how much one pass adds. */
  flow: number
  erase?: boolean
}

interface MaskComponentBase {
  id: string
  mode: MaskMode
  invert?: boolean
  /** Hidden components are ignored (kept). */
  visible?: boolean
  /** 0..1, default 1. */
  strength?: number
}

/**
 * Geometric components are in the mask's space: a picture's own pixels (its box, origin top-left, as drawn, with
 * flips) for a picture's look; map pixels for a layer's or a map's look.
 */
export type MaskComponent = MaskComponentBase &
  (
    | { type: 'all' }
    /** Full effect on the (x1, y1) side, fading out by (x2, y2). */
    | { type: 'linear'; x1: number; y1: number; x2: number; y2: number }
    /** An ellipse: full effect inside, `feather` (0..1 of the radius) fades it out towards the edge. */
    | { type: 'radial'; cx: number; cy: number; rx: number; ry: number; rotation?: number; feather?: number }
    /** Marquee: a rectangle with an optional corner radius and a soft edge (pixels, inwards). */
    | { type: 'rect'; x: number; y: number; w: number; h: number; feather?: number; radius?: number }
    | { type: 'brush'; strokes: BrushStroke[] }
    /** Pixels close to a colour of the original picture. `range` 0..100, `softness` 0..100. */
    | { type: 'color'; color: string; range?: number; softness?: number }
    /** Pixels in a brightness range of the original picture (0..1), softened by `featherLow` / `featherHigh`. */
    | { type: 'luminance'; low: number; high: number; featherLow?: number; featherHigh?: number }
  )

export type MaskComponentType = MaskComponent['type']

/** Local adjustments: what its components select gets `adjust`, blended by the mask. */
export interface LookMask {
  id: string
  name: string
  visible?: boolean
  /** 0..1, default 1. */
  amount?: number
  invert?: boolean
  components: MaskComponent[]
  adjust: LookAdjust
}

// ── effects and shaders ────────────────────────────────────────────────────────────────────────────

export interface Vignette {
  /** -100 (dark) .. 100 (light). */
  amount: number
  /** 0..100, default 50: how far from the centre it starts. */
  midpoint?: number
  /** -100..100: 100 = circle, -100 = the frame's rectangle. */
  roundness?: number
  /** 0..100, default 50. */
  feather?: number
  /** A colour instead of black / white (hex). */
  color?: string
}

export interface Grain {
  /** 0..100. */
  amount: number
  /** Grain size in map pixels (1..8). */
  size?: number
  /** A new pattern every frame (the game; the editor shows one frame). */
  animated?: boolean
}

/** How a shadow is laid over what is under it (the modes Phaser's WebGL renderer and the canvas share). */
export type ShadowBlend = 'normal' | 'multiply' | 'screen' | 'add'

/**
 * A drop shadow under a picture or a tile layer: its silhouette, blurred, tinted and offset (docs/looks.md). On an
 * image layer's look it is every picture's shadow (a picture's own look can replace it, or switch it off).
 */
export interface LookShadow {
  /** Offset in map pixels (the direction the light comes from is the opposite). */
  x: number
  y: number
  /** Blur radius in map pixels (0 = a hard edge), 0..64. */
  softness?: number
  /** 0..100, default 50. */
  opacity?: number
  /** Default black. */
  color?: string
  /** Default multiply. */
  blend?: ShadowBlend
  /** Switched off: no shadow, and a picture's own off shadow hides its layer's. */
  off?: boolean
}

/** A user shader (project/shaders/<id>.frag) with its parameter values. */
export interface ShaderUse {
  id: string
  shader: string
  visible?: boolean
  params?: Record<string, number | number[]>
}

/** One look: global adjustments, masks, effects and shaders. */
export interface Look {
  /** Off = the look is kept but not applied (its eye). */
  enabled?: boolean
  adjust?: LookAdjust
  masks?: LookMask[]
  vignette?: Vignette
  grain?: Grain
  /** A drop shadow (layers and pictures; not part of the colour grade). */
  shadow?: LookShadow
  shaders?: ShaderUse[]
  /** The preset it was started from (shown, nothing else). */
  preset?: string
}

/** What a map, a layer or a picture stores. */
export interface LookSet {
  default?: Look
  /** Per profile id: replaces `default` while that profile is active. */
  profiles?: Record<string, Look>
}

/** A profile (time of day, weather, ...): which of the looks of every subject applies. */
export interface LookProfile {
  id: string
  name: string
}

/** project/looks.json (copied to game/public/data/looks.json). */
export interface LooksFile {
  version: 1
  profiles: LookProfile[]
  /** The profile the game starts in (absent = the first). */
  start?: string
  /** Looks saved by the author, offered beside the built-in presets. */
  presets?: { id: string; name: string; look: Look }[]
}
