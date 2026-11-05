import { describe, expect, it } from 'vitest'
import { MAX_ZOOM, MIN_ZOOM, fitScale, focusView, sliderToZoom, stepZoom, zoomLabel, zoomToSlider } from './zoom'

describe('zoom maths', () => {
  it('steps along the ladder from anywhere, and stops at the ends', () => {
    expect(stepZoom(1, 1)).toBe(2)
    expect(stepZoom(2.4, 1)).toBe(3)
    expect(stepZoom(2.4, -1)).toBe(2)
    expect(stepZoom(1, -1)).toBe(0.5)
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM)
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM)
  })
  it('fits a picture in a box, but does not blow a small one up past the cap', () => {
    expect(fitScale(400, 200, 100, 100)).toBe(2)
    expect(fitScale(400, 400, 1000, 500)).toBe(0.4)
    expect(fitScale(1000, 1000, 8, 8)).toBe(8)
    expect(fitScale(1000, 1000, 8, 8, 16)).toBe(16)
    expect(fitScale(0, 0, 10, 10)).toBe(1)
    expect(fitScale(100, 100, 10000, 10000)).toBe(MIN_ZOOM)
  })
  it('round-trips through the slider scale', () => {
    for (const z of [0.25, 1, 3, 32]) expect(sliderToZoom(zoomToSlider(z))).toBeCloseTo(z, 6)
    expect(sliderToZoom(100)).toBe(MAX_ZOOM)
  })
  it('labels the zoom as a percentage', () => {
    expect(zoomLabel(1)).toBe('100%')
    expect(zoomLabel(2.5)).toBe('250%')
    expect(zoomLabel(0.125)).toBe('12.5%')
  })
})

describe('focusView', () => {
  it('fits the rectangle and centres it, whatever the picture around it', () => {
    const v = focusView(400, 300, { x: 100, y: 50, w: 40, h: 30 })
    expect(v.zoom).toBe(8) // capped by maxFit (a small rectangle is not blown up beyond it)
    expect(v.scrollLeft).toBe((100 + 20) * 8 - 200)
    expect(v.scrollTop).toBe((50 + 15) * 8 - 150)
  })

  it('a large rectangle fits the box, and never scrolls to a negative position', () => {
    const v = focusView(200, 200, { x: 0, y: 0, w: 800, h: 400 })
    expect(v.zoom).toBe(0.25)
    expect(v.scrollLeft).toBe(Math.max(0, 400 * 0.25 - 100))
    expect(focusView(400, 300, { x: 0, y: 0, w: 40, h: 30 }, 4).scrollLeft).toBe(0)
  })
})
