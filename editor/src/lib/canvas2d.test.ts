import { describe, expect, it, vi } from 'vitest'
import { centredRect, fitZoom, prepareCanvas } from './canvas2d'

describe('fitZoom', () => {
  it('enlarges by whole numbers, keeping the padding free', () => {
    expect(fitZoom(16, 16, 36)).toBe(2) // (36 - 4) / 16
    expect(fitZoom(10, 10, 36)).toBe(3) // 3.2 -> 3
  })
  it('shrinks by any factor, and uses the box height when it is given', () => {
    expect(fitZoom(64, 32, 36)).toBe(0.5)
    expect(fitZoom(10, 40, 100, 24)).toBe(0.5)
  })
  it('an empty picture is drawn at 1', () => {
    expect(fitZoom(0, 10, 32)).toBe(1)
  })
})

describe('centredRect', () => {
  it('centres the zoomed picture in the box', () => {
    expect(centredRect(10, 5, 2, 30)).toEqual({ x: 5, y: 10, w: 20, h: 10 })
    expect(centredRect(10, 10, 1, 20, 40)).toEqual({ x: 5, y: 15, w: 10, h: 10 })
  })
})

describe('prepareCanvas', () => {
  it('sizes the backing store for the pixel density and maps one unit to one CSS pixel', () => {
    const ctx = { setTransform: vi.fn(), clearRect: vi.fn() }
    const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement
    const before = window.devicePixelRatio
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true })
    try {
      expect(prepareCanvas(canvas, 30, 10.4)).toBe(ctx)
    } finally {
      Object.defineProperty(window, 'devicePixelRatio', { value: before, configurable: true })
    }
    expect([canvas.width, canvas.height]).toEqual([60, 21])
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0)
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 30, 10.4)
  })
  it('returns null without a 2D context', () => {
    const canvas = { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement
    expect(prepareCanvas(canvas, 0, 0)).toBeNull()
    expect([canvas.width, canvas.height]).toEqual([1, 1])
  })
})
