import { describe, expect, it } from 'vitest'
import {
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  centerOnWorld,
  fitView,
  minimapLayout,
  sameView,
  visibleWorldRect,
  zoomAbout,
} from './viewMath'

const box = { width: 800, height: 600 }

describe('fitView', () => {
  it('centres a small map at 100%', () => {
    expect(fitView(box, 10, 10)).toEqual({ scale: 1, x: 240, y: 140 })
  })

  it('shrinks a big map to 80% of the room and can go below the old 20% floor', () => {
    const v = fitView(box, 100, 100) // 3200 px map
    expect(v.scale).toBeCloseTo((600 * 0.8) / 3200)
    const huge = fitView(box, 500, 500)
    expect(huge.scale).toBeLessThan(0.2)
    expect(huge.scale).toBeGreaterThanOrEqual(MIN_CANVAS_ZOOM)
  })
})

describe('zoomAbout', () => {
  it('keeps the world point under the pointer fixed', () => {
    const v = { scale: 1, x: 100, y: 50 }
    const z = zoomAbout(v, 2, 300, 250)
    expect((300 - z.x) / z.scale).toBeCloseTo((300 - v.x) / v.scale)
    expect((250 - z.y) / z.scale).toBeCloseTo((250 - v.y) / v.scale)
  })

  it('clamps to the zoom range', () => {
    expect(zoomAbout({ scale: 1, x: 0, y: 0 }, 99, 0, 0).scale).toBe(MAX_CANVAS_ZOOM)
    expect(zoomAbout({ scale: 1, x: 0, y: 0 }, 0.001, 0, 0).scale).toBe(MIN_CANVAS_ZOOM)
  })
})

describe('centerOnWorld / visibleWorldRect', () => {
  it('puts a world point in the middle and reports what is visible', () => {
    const v = centerOnWorld({ scale: 2, x: 0, y: 0 }, box, 1000, 500)
    const r = visibleWorldRect(v, box)
    expect(r.x + r.width / 2).toBeCloseTo(1000)
    expect(r.y + r.height / 2).toBeCloseTo(500)
    expect(r.width).toBe(400)
  })
})

describe('minimapLayout / sameView', () => {
  it('fits the map inside the box keeping its proportions', () => {
    expect(minimapLayout(50, 25, 200, 200)).toEqual({ scale: 4, width: 200, height: 100 })
    expect(minimapLayout(0, 5, 200, 200).width).toBe(1)
  })

  it('compares views with a small tolerance', () => {
    expect(sameView({ scale: 1, x: 10, y: 10 }, { scale: 1, x: 10.2, y: 9.9 })).toBe(true)
    expect(sameView({ scale: 1, x: 10, y: 10 }, { scale: 1.1, x: 10, y: 10 })).toBe(false)
  })
})
