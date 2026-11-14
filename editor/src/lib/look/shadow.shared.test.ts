import { describe, expect, it } from 'vitest'
import { applyPreset, cleanLookSet, isNeutralLook, LOOK_PRESETS } from '../../../../shared/look'
import { chunkShadowMask, maskPixels, shadowChunk, shadowChunkCount, shadowFor, shadowMask, shadowPad } from '../../../../shared/look/shadow'

describe('look shadows', () => {
  it('cleans a shadow: clamps, drops defaults and junk, keeps the offset', () => {
    const set = cleanLookSet({ default: { shadow: { x: 9999, y: '3', softness: -4, opacity: 120, color: 'red', blend: 'multiply', off: 1 } } })
    expect(set?.default?.shadow).toEqual({ x: 512, y: 0, softness: 0, opacity: 100 })
    expect(cleanLookSet({ default: { shadow: { x: 2, y: 3, color: '#FF0000', blend: 'screen', off: true } } })?.default?.shadow).toEqual({ x: 2, y: 3, color: '#ff0000', blend: 'screen', off: true })
  })

  it('a shadow alone does not make a look grade anything', () => {
    expect(isNeutralLook({ shadow: { x: 4, y: 4 } })).toBe(true)
  })

  it('a picture shadow replaces its layer shadow; an off one removes it; profiles pick their own', () => {
    const layer = { default: { shadow: { x: 4, y: 4, opacity: 40 } }, profiles: { night: { shadow: { x: 0, y: 0, off: true } } } }
    expect(shadowFor([undefined, layer], null)).toMatchObject({ x: 4, y: 4, opacity: 0.4, color: '#000000', blend: 'multiply', softness: 0 })
    expect(shadowFor([undefined, layer], 'night')).toBeNull()
    expect(shadowFor([{ default: { shadow: { x: -2, y: 1 } } }, layer], null)).toMatchObject({ x: -2, y: 1, opacity: 0.5 })
    expect(shadowFor([{ default: { shadow: { x: 0, y: 0, off: true } } }, layer], null)).toBeNull()
    // a picture look without a shadow falls through to the layer's
    expect(shadowFor([{ default: { adjust: { exposure: 1 } } }, layer], null)).toMatchObject({ x: 4 })
    // a disabled look casts nothing
    expect(shadowFor([undefined, { default: { enabled: false, shadow: { x: 1, y: 1 } } }], null)).toBeNull()
  })

  it('presets keep the shadow', () => {
    const look = applyPreset({ shadow: { x: 3, y: 3 } }, LOOK_PRESETS[0])
    expect(look.shadow).toEqual({ x: 3, y: 3 })
  })

  it('the mask is the alpha, padded, and a blur spreads it without adding weight', () => {
    const w = 8
    const h = 8
    const rgba = new Uint8ClampedArray(w * h * 4)
    for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) rgba[(y * w + x) * 4 + 3] = 255
    const hard = shadowMask(rgba, w, h, 0)
    expect(hard).toMatchObject({ w: 8, h: 8, pad: 0 })
    expect(hard.alpha[3 * 8 + 3]).toBe(255)
    expect(hard.alpha[0]).toBe(0)

    const soft = shadowMask(rgba, w, h, 4)
    const pad = shadowPad(4)
    expect(soft).toMatchObject({ w: w + pad * 2, h: h + pad * 2, pad })
    const sum = (a: Uint8ClampedArray) => a.reduce((t, v) => t + v, 0)
    // the blur moves alpha outwards (rounding aside) but keeps its total
    expect(Math.abs(sum(soft.alpha) - sum(hard.alpha)) / sum(hard.alpha)).toBeLessThan(0.05)
    const centre = soft.alpha[(pad + 4) * soft.w + pad + 4]
    const outside = soft.alpha[(pad + 4) * soft.w + pad - 1]
    expect(centre).toBeGreaterThan(outside)
    expect(outside).toBeGreaterThan(0)
  })

  it('mask pixels are white with the mask alpha', () => {
    expect([...maskPixels(new Uint8ClampedArray([0, 200]))]).toEqual([255, 255, 255, 0, 255, 255, 255, 200])
  })

  it('mask pixels take a colour', () => {
    expect([...maskPixels(new Uint8ClampedArray([128]), '#ff8000')]).toEqual([255, 128, 0, 128])
  })

  it('layer chunks put back together are the blur of the whole layer', () => {
    // a 40 x 20 tile layer of 1 px tiles: 3 x 2 chunks, a scatter of painted cells
    const W = 40
    const H = 20
    const whole = new Uint8ClampedArray(W * H * 4)
    for (let i = 0; i < W * H; i++) if ((i * 7) % 11 < 4) whole[i * 4 + 3] = 255
    const radius = 3
    const full = shadowMask(whole, W, H, radius)
    const sum = new Float32Array(full.w * full.h)
    const { cols, rows } = shadowChunkCount(W, H)
    expect([cols, rows]).toEqual([3, 2])
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const c = shadowChunk(cx, cy, W, H, 1, radius)
        const rgba = new Uint8ClampedArray(c.size * c.size * 4)
        for (let ty = c.y0; ty <= c.y1; ty++) for (let tx = c.x0; tx <= c.x1; tx++) rgba[((ty - c.row) * c.size + tx - c.col) * 4 + 3] = whole[(ty * W + tx) * 4 + 3]
        const m = chunkShadowMask(rgba, c, W, H, 1, radius)
        if (!m) continue
        for (let y = 0; y < m.h; y++) {
          for (let x = 0; x < m.w; x++) {
            const fx = c.at.x + x + full.pad
            const fy = c.at.y + y + full.pad
            if (m.alpha[y * m.w + x]) sum[fy * full.w + fx] += m.alpha[y * m.w + x]
          }
        }
      }
    }
    expect([...sum]).toEqual([...full.alpha])
  })
})
