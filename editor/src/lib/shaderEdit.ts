// Pure helpers of the Database > Shaders page: ids, the starter template, compile-error lines, colour params.

import type { ShaderInfo } from '../../../shared/look/userShaders'

/** Mirrors `isValidShaderId` in electron/ipc/lookStore.ts: lower-case segments of letters, digits, `-`, `_`, folders with `/`. */
const ID = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/
export const isValidShaderId = (id: string): boolean => id.length <= 120 && ID.test(id)

/** What is wrong with a typed id, or null. */
export function shaderIdProblem(id: string, existing: readonly string[], current?: string): string | null {
  if (!id) return 'Type an id.'
  if (!isValidShaderId(id)) return 'Use lower-case letters, digits, - and _ (folders with /).'
  if (id !== current && existing.includes(id)) return `"${id}" already exists.`
  return null
}

/** `base`, or `base-2`, `base-3`... when taken. */
export function uniqueShaderId(base: string, existing: readonly string[]): string {
  if (!existing.includes(base)) return base
  let n = 2
  while (existing.includes(`${base}-${n}`)) n++
  return `${base}-${n}`
}

export const NEW_SHADER_TEMPLATE = `// @name New shader
// @description What this shader does.
// Other annotations: // @animated (redraws every frame), // @pad 8 (map pixels of room around pictures)
// Provided: uMainSampler, outTexCoord, uTime, uResolution, worldAt(uv), uvAt(world)

uniform float amount; // @param 0 1 0.5 Amount
// uniform vec3 tint; // @color #88ccff Tint

void main() {
  vec4 c = texture2D(uMainSampler, outTexCoord);
  gl_FragColor = vec4(mix(c.rgb, vec3(1.0) - c.rgb, amount), c.a);
}
`

export interface ShaderErrorLine {
  /** 1-based line of the user's file, or null when the message names none. */
  line: number | null
  message: string
}

/** Splits a compile log (`ERROR: 0:12: message`, line numbers already of the user's file) into one entry per message. */
export function parseShaderErrors(text: string | null): ShaderErrorLine[] {
  if (!text) return []
  const out: ShaderErrorLine[] = []
  for (const raw of text.split('\n')) {
    const row = raw.replace(/\0/g, '').trim()
    if (!row) continue
    const m = row.match(/^(?:ERROR|WARNING):\s*\d+:(\d+):\s*(.*)$/)
    if (m) out.push({ line: Number(m[1]), message: m[2] })
    else out.push({ line: null, message: row })
  }
  return out
}

/** Offset of the start of 1-based `line` in `text` (clamped to the last line). */
export function lineStart(text: string, line: number): number {
  let offset = 0
  for (let i = 1; i < line; i++) {
    const next = text.indexOf('\n', offset)
    if (next < 0) return offset
    offset = next + 1
  }
  return offset
}

const hex2 = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 255).toString(16).padStart(2, '0')
export const vecToHex = (v: readonly number[]): string => `#${hex2(v[0] ?? 0)}${hex2(v[1] ?? 0)}${hex2(v[2] ?? 0)}`
export function hexToRgb(hex: string): number[] {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16) || 0
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** A colour param's new value for a picked hex (keeps a vec4's alpha). */
export function colorParamValue(current: number | number[], hex: string): number[] {
  const rgb = hexToRgb(hex)
  return Array.isArray(current) && current.length === 4 ? [...rgb, current[3]] : rgb
}

export const shaderLabel = (s: Pick<ShaderInfo, 'id' | 'name'>): string => s.name || s.id
