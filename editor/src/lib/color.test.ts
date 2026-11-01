import { describe, expect, it } from 'vitest'
import { hexToHsv, hsvToHex, normalizeHex } from './color'

describe('color', () => {
  it('normalizes short, long, upper case and bare hex; rejects the rest', () => {
    expect(normalizeHex('#FFF')).toBe('#ffffff')
    expect(normalizeHex('1a2B3c')).toBe('#1a2b3c')
    expect(normalizeHex(' #00ff7f ')).toBe('#00ff7f')
    for (const bad of ['', '#12', '#12345', 'red', '#gggggg']) expect(normalizeHex(bad)).toBeNull()
  })

  it('round-trips hex through HSV', () => {
    for (const hex of ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#7c3aed', '#1a2b3c', '#808080']) expect(hsvToHex(hexToHsv(hex))).toBe(hex)
  })

  it('knows the primary hues', () => {
    expect(hexToHsv('#ff0000')).toMatchObject({ h: 0, s: 1, v: 1 })
    expect(hexToHsv('#00ff00').h).toBe(120)
    expect(hexToHsv('#0000ff').h).toBe(240)
    expect(hsvToHex({ h: 60, s: 1, v: 1 })).toBe('#ffff00')
  })
})
