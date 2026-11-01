// Small colour helpers for the colour field: hex <-> HSV. Pure.

export interface Hsv {
  /** 0..360 */
  h: number
  /** 0..1 */
  s: number
  /** 0..1 */
  v: number
}

/** `#rgb`, `rgb`, `#rrggbb` or `rrggbb` -> `#rrggbb` (lower case); null when it is not a colour. */
export function normalizeHex(input: string): string | null {
  const t = input.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{3}$/.test(t)) return `#${t[0]}${t[0]}${t[1]}${t[1]}${t[2]}${t[2]}`
  if (/^[0-9a-f]{6}$/.test(t)) return `#${t}`
  return null
}

export function hexToHsv(hex: string): Hsv {
  const n = normalizeHex(hex) ?? '#000000'
  const r = parseInt(n.slice(1, 3), 16) / 255
  const g = parseInt(n.slice(3, 5), 16) / 255
  const b = parseInt(n.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const sector = Math.floor((((h % 360) + 360) % 360) / 60)
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][sector]
  const part = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}
