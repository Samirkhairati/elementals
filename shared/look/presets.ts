// Built-in looks offered in the editor's preset menu (the author's own presets are in project/looks.json).
// Applying one replaces the look's adjustments, vignette and grain; masks and shaders are kept.

import type { Look } from './types.ts'

export interface LookPreset {
  id: string
  name: string
  group: 'Time of day' | 'Places' | 'Weather' | 'Mood' | 'Film'
  look: Look
}

const curve = (...ys: number[]) => ys.map((y, i) => ({ x: i / (ys.length - 1), y }))

export const LOOK_PRESETS: readonly LookPreset[] = [
  // ── time of day ──
  { id: 'dawn', name: 'Dawn', group: 'Time of day', look: { adjust: { exposure: -0.25, contrast: -12, temperature: -10, tint: 14, saturation: -12, fade: 10, grading: { shadows: { hue: 250, sat: 25 }, highlights: { hue: 330, sat: 22 } } }, vignette: { amount: -12 } } },
  { id: 'morning', name: 'Morning', group: 'Time of day', look: { adjust: { exposure: 0.1, contrast: 5, temperature: 8, vibrance: 12, highlights: -10, shadows: 10, grading: { highlights: { hue: 50, sat: 12 } } } } },
  { id: 'day', name: 'Day', group: 'Time of day', look: { adjust: { contrast: 6, vibrance: 10 } } },
  { id: 'noon', name: 'Bright noon', group: 'Time of day', look: { adjust: { exposure: 0.25, contrast: 14, highlights: -20, whites: 10, vibrance: 18, temperature: 4 } } },
  { id: 'golden-hour', name: 'Golden hour', group: 'Time of day', look: { adjust: { exposure: 0.05, contrast: 8, temperature: 38, tint: 6, vibrance: 15, highlights: -15, grading: { highlights: { hue: 40, sat: 35 }, shadows: { hue: 25, sat: 10 } }, overlay: { color: '#ffb35c', amount: 18, mode: 'softlight' } }, vignette: { amount: -15, feather: 70 } } },
  { id: 'sunset', name: 'Sunset', group: 'Time of day', look: { adjust: { exposure: -0.35, contrast: 12, temperature: 45, tint: 18, saturation: 8, highlights: -10, shadows: -10, grading: { shadows: { hue: 265, sat: 30 }, midtones: { hue: 20, sat: 25 }, highlights: { hue: 35, sat: 40 } }, overlay: { color: '#ff7a45', amount: 22, mode: 'softlight' } }, vignette: { amount: -25, feather: 65 } } },
  { id: 'dusk', name: 'Dusk', group: 'Time of day', look: { adjust: { exposure: -0.9, contrast: 6, temperature: -22, tint: 16, saturation: -25, shadows: 8, grading: { shadows: { hue: 245, sat: 40 }, highlights: { hue: 300, sat: 18 } }, overlay: { color: '#5a4b9e', amount: 22, mode: 'multiply' } }, vignette: { amount: -30, feather: 60 } } },
  { id: 'night', name: 'Night', group: 'Time of day', look: { adjust: { exposure: -1.6, contrast: 10, temperature: -40, tint: 6, saturation: -45, highlights: 10, blacks: -10, grading: { shadows: { hue: 225, sat: 45, lum: -5 }, midtones: { hue: 215, sat: 25 } }, overlay: { color: '#26407a', amount: 30, mode: 'multiply' } }, vignette: { amount: -40, midpoint: 40, feather: 60 } } },
  { id: 'moonlight', name: 'Moonlight', group: 'Time of day', look: { adjust: { exposure: -1.2, contrast: 18, temperature: -55, saturation: -60, highlights: 15, whites: 10, grading: { highlights: { hue: 200, sat: 25 }, shadows: { hue: 230, sat: 35 } }, fade: 8 }, vignette: { amount: -35, feather: 70 } } },
  { id: 'midnight', name: 'Midnight', group: 'Time of day', look: { adjust: { exposure: -2.4, contrast: 5, temperature: -45, saturation: -70, blacks: -20, grading: { global: { hue: 230, sat: 30 } } }, vignette: { amount: -55, midpoint: 30, feather: 55 } } },

  // ── places ──
  { id: 'cave', name: 'Cave', group: 'Places', look: { adjust: { exposure: -1.3, contrast: 20, temperature: 15, saturation: -35, shadows: -20, blacks: -25, grading: { shadows: { hue: 30, sat: 20, lum: -10 }, highlights: { hue: 38, sat: 25 } } }, vignette: { amount: -70, midpoint: 25, roundness: 30, feather: 55 } } },
  { id: 'ice-cave', name: 'Ice cave', group: 'Places', look: { adjust: { exposure: -0.6, contrast: 15, temperature: -50, saturation: -10, highlights: 15, grading: { shadows: { hue: 210, sat: 45 }, highlights: { hue: 185, sat: 30 } } }, vignette: { amount: -45, feather: 60 } } },
  { id: 'underwater', name: 'Underwater', group: 'Places', look: { adjust: { exposure: -0.4, contrast: -15, temperature: -45, tint: -20, saturation: -15, dehaze: -25, hsl: { red: { s: -60, l: -30 }, orange: { s: -40 } }, grading: { global: { hue: 190, sat: 35 } }, overlay: { color: '#1f8fa8', amount: 30, mode: 'color' } }, vignette: { amount: -35, feather: 75 } } },
  { id: 'forest', name: 'Deep forest', group: 'Places', look: { adjust: { exposure: -0.3, contrast: 10, temperature: -5, tint: -12, saturation: -8, hsl: { green: { h: -15, s: 10, l: -10 }, yellow: { h: -20 } }, grading: { shadows: { hue: 150, sat: 25 }, highlights: { hue: 70, sat: 15 } } }, vignette: { amount: -25, feather: 70 } } },
  { id: 'desert', name: 'Desert heat', group: 'Places', look: { adjust: { exposure: 0.35, contrast: 10, temperature: 50, tint: 5, highlights: -25, saturation: -8, dehaze: -15, grading: { highlights: { hue: 42, sat: 30 } } } } },
  { id: 'haunted', name: 'Haunted', group: 'Places', look: { adjust: { exposure: -0.8, contrast: 25, temperature: -20, tint: -25, saturation: -55, blacks: -15, grading: { shadows: { hue: 160, sat: 30 }, highlights: { hue: 100, sat: 15 } }, fade: 12 }, vignette: { amount: -60, midpoint: 30 }, grain: { amount: 18 } } },
  { id: 'lava', name: 'Volcano', group: 'Places', look: { adjust: { exposure: -0.4, contrast: 25, temperature: 60, tint: 20, saturation: 15, blacks: -20, grading: { shadows: { hue: 0, sat: 35 }, highlights: { hue: 30, sat: 45 } }, overlay: { color: '#ff3d00', amount: 18, mode: 'softlight' } }, vignette: { amount: -45 } } },

  // ── weather ──
  { id: 'overcast', name: 'Overcast', group: 'Weather', look: { adjust: { exposure: -0.2, contrast: -15, temperature: -12, saturation: -30, highlights: -20, fade: 8 } } },
  { id: 'rain', name: 'Rain', group: 'Weather', look: { adjust: { exposure: -0.55, contrast: -8, temperature: -25, saturation: -35, dehaze: -20, grading: { global: { hue: 210, sat: 18 } } }, vignette: { amount: -25 } } },
  { id: 'storm', name: 'Storm', group: 'Weather', look: { adjust: { exposure: -1, contrast: 22, temperature: -30, saturation: -50, highlights: -25, grading: { shadows: { hue: 220, sat: 30 } } }, vignette: { amount: -45 } } },
  { id: 'fog', name: 'Fog', group: 'Weather', look: { adjust: { contrast: -35, dehaze: -60, saturation: -30, fade: 25, overlay: { color: '#c9d4dc', amount: 25, mode: 'screen' } } } },
  { id: 'snow', name: 'Snow', group: 'Weather', look: { adjust: { exposure: 0.35, contrast: -5, temperature: -30, saturation: -20, highlights: -15, whites: 10, grading: { shadows: { hue: 215, sat: 25 } } } } },
  { id: 'autumn', name: 'Autumn', group: 'Weather', look: { adjust: { temperature: 20, vibrance: 15, hsl: { green: { h: -60, s: -20 }, yellow: { h: -20, s: 20 }, orange: { s: 15 } }, grading: { highlights: { hue: 35, sat: 15 } } } } },

  // ── mood ──
  { id: 'dream', name: 'Dreamy', group: 'Mood', look: { adjust: { exposure: 0.3, contrast: -25, highlights: -10, saturation: -10, tint: 15, fade: 15, grading: { highlights: { hue: 320, sat: 20 }, shadows: { hue: 260, sat: 20 } }, overlay: { color: '#ffd6f0', amount: 15, mode: 'screen' } }, vignette: { amount: 20, feather: 80, color: '#ffffff' } } },
  { id: 'toxic', name: 'Toxic', group: 'Mood', look: { adjust: { contrast: 15, tint: -55, saturation: 10, hsl: { yellow: { h: 40 }, orange: { h: 40 } }, grading: { global: { hue: 95, sat: 35 } } }, vignette: { amount: -40 } } },
  { id: 'danger', name: 'Danger', group: 'Mood', look: { adjust: { contrast: 20, saturation: -40, temperature: 20, grading: { global: { hue: 0, sat: 45 } } }, vignette: { amount: -50, color: '#3a0000' } } },
  { id: 'flashback', name: 'Flashback', group: 'Mood', look: { adjust: { contrast: -10, saturation: -75, temperature: 25, fade: 25, grading: { global: { hue: 38, sat: 30 } } }, vignette: { amount: -40, feather: 80 }, grain: { amount: 20, animated: true } } },

  // ── film ──
  { id: 'vintage', name: 'Vintage', group: 'Film', look: { adjust: { contrast: -8, temperature: 12, saturation: -20, fade: 20, curves: { rgb: curve(0.08, 0.27, 0.52, 0.76, 0.94), b: curve(0.12, 0.3, 0.5, 0.7, 0.88) } }, vignette: { amount: -25 }, grain: { amount: 15 } } },
  { id: 'teal-orange', name: 'Teal & orange', group: 'Film', look: { adjust: { contrast: 12, vibrance: 10, grading: { shadows: { hue: 190, sat: 35 }, highlights: { hue: 32, sat: 35 } } } } },
  { id: 'noir', name: 'Noir', group: 'Film', look: { adjust: { saturation: -100, contrast: 35, blacks: -20, whites: 10 }, vignette: { amount: -45 }, grain: { amount: 22 } } },
  { id: 'sepia', name: 'Sepia', group: 'Film', look: { adjust: { saturation: -100, contrast: 5, overlay: { color: '#a8743a', amount: 45, mode: 'color' }, fade: 10 }, vignette: { amount: -25 } } },
  { id: 'gameboy', name: 'Handheld green', group: 'Film', look: { adjust: { saturation: -100, contrast: 15, curves: { r: curve(0.06, 0.19, 0.55, 0.61), g: curve(0.22, 0.38, 0.74, 0.74), b: curve(0.06, 0.19, 0.06, 0.06) } } } },
  { id: 'vivid', name: 'Vivid', group: 'Film', look: { adjust: { contrast: 15, vibrance: 35, saturation: 10, dehaze: 10 } } },
]

export const PRESET_GROUPS = ['Time of day', 'Places', 'Weather', 'Mood', 'Film'] as const

/** The look with a preset applied: its adjustments, vignette and grain replace the look's; masks and shaders stay. */
export function applyPreset(look: Look | undefined, preset: { id: string; look: Look }): Look {
  const base: Look = { ...(look ?? {}) }
  delete base.adjust
  delete base.vignette
  delete base.grain
  return { ...base, ...JSON.parse(JSON.stringify(preset.look)), ...(look?.masks ? { masks: look.masks } : {}), ...(look?.shaders ? { shaders: look.shaders } : {}), preset: preset.id }
}
