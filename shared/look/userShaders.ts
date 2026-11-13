// User shaders: project/shaders/<id>.frag, a GLSL ES 1.0 fragment shader with its own main() that reads the
// picture through `uMainSampler` at `outTexCoord`. Its settings are uniforms annotated in a comment, which the
// editor turns into sliders and colour pickers:
//
//   // @name Water ripple
//   // @description Wavy distortion, like looking through water.
//   // @animated              (redraws every frame)
//   // @pad 8                 (map pixels of room around a picture, for glows and outlines)
//   uniform float amount;    // @param 0 1 0.5 Amount
//   uniform vec3 tint;       // @color #88ccff Tint
//
// Provided by the host (declared by the header, do not redeclare): uMainSampler, outTexCoord, uTime (seconds),
// uResolution (target size in pixels), uWorld (uv -> map pixels: world = uWorld.xy + uv * uWorld.zw),
// uWorldPixel (one map pixel in uv), and the helpers worldAt(uv) / uvAt(world).

import { LOOK_PRECISION } from './shader.ts'

export interface ShaderParam {
  name: string
  type: 'float' | 'vec2' | 'vec3' | 'vec4'
  /** A colour (vec3 / vec4) edited with a colour picker. */
  color: boolean
  label: string
  min: number
  max: number
  default: number | number[]
  step: number
}

export interface ShaderInfo {
  id: string
  name: string
  description: string
  animated: boolean
  pad: number
  params: ShaderParam[]
  source: string
}

export const SHADER_HEADER = `${LOOK_PRECISION}
uniform sampler2D uMainSampler;
varying vec2 outTexCoord;
uniform float uTime;
uniform vec2 uResolution;
uniform vec4 uWorld;
uniform vec2 uWorldPixel;
vec2 worldAt(vec2 uv) { return uWorld.xy + uv * uWorld.zw; }
vec2 uvAt(vec2 world) { return (world - uWorld.xy) / uWorld.zw; }
`

/** Lines the header adds before the user's code (to map compiler error lines back). */
export const SHADER_HEADER_LINES = SHADER_HEADER.split('\n').length - 1

const hexToVec = (hex: string): number[] => {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** Reads a shader file's annotations. */
export function parseShader(id: string, source: string): ShaderInfo {
  const meta = (key: string) => source.match(new RegExp(`//\\s*@${key}\\s+(.+)`))?.[1]?.trim()
  const params: ShaderParam[] = []
  const re = /uniform\s+(float|vec2|vec3|vec4)\s+(\w+)\s*;\s*\/\/\s*@(param|color)\s*([^\n]*)/g
  for (const m of source.matchAll(re)) {
    const [, type, name, kind, rest] = m
    const t = type as ShaderParam['type']
    const size = t === 'float' ? 1 : Number(t.slice(3))
    if (kind === 'color') {
      const hex = rest.match(/#[0-9a-fA-F]{6}/)?.[0] ?? '#ffffff'
      const label = rest.replace(/#[0-9a-fA-F]{6}/, '').trim() || name
      const rgb = hexToVec(hex)
      params.push({ name, type: t, color: true, label, min: 0, max: 1, step: 0.01, default: size === 4 ? [...rgb, 1] : rgb })
      continue
    }
    const nums = rest.trim().split(/\s+/)
    const values: number[] = []
    while (nums.length > 0 && values.length < 3 && /^-?\d*\.?\d+(e-?\d+)?$/i.test(nums[0])) values.push(Number(nums.shift()))
    const [min = 0, max = 1, def = min] = values
    const label = nums.join(' ').replace(/^"|"$/g, '') || name
    const range = max - min
    params.push({ name, type: t, color: false, label, min, max, step: range <= 2 ? 0.01 : range <= 20 ? 0.1 : 1, default: size === 1 ? def : new Array(size).fill(def) })
  }
  return {
    id,
    name: meta('name') ?? id.split('/').pop() ?? id,
    description: meta('description') ?? '',
    animated: /\/\/\s*@animated\b/.test(source),
    pad: Math.max(0, Math.min(256, Number(meta('pad') ?? 0) || 0)),
    params,
    source,
  }
}

/** The full fragment shader text (header + the user's code). The user's code must not declare the header's names. */
export function shaderSource(source: string): string {
  return `${SHADER_HEADER}\n${source.replace(/^\s*precision\s+\w+\s+float\s*;\s*$/gm, '')}`
}

/** The value of each parameter: the stored one when it fits, else the default. */
export function shaderParamValues(info: ShaderInfo, stored: Record<string, number | number[]> | undefined): Record<string, number | number[]> {
  const out: Record<string, number | number[]> = {}
  for (const p of info.params) {
    const v = stored?.[p.name]
    const size = Array.isArray(p.default) ? p.default.length : 1
    if (size === 1 && typeof v === 'number') out[p.name] = v
    else if (size > 1 && Array.isArray(v) && v.length === size) out[p.name] = v
    else out[p.name] = p.default
  }
  return out
}

/** The project's shaders folder name (project/shaders, game/public/shaders). */
export const SHADERS_DIR = 'shaders'
export const SHADER_EXT = '.frag'
