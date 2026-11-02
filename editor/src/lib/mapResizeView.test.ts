import { describe, expect, it } from 'vitest'
import { MAX_MAP_SIZE } from './mapResize'
import { edgesFromDrag, fitView, newRect, toScreenX, toWorldX } from './mapResizeView'

const map = { width: 10, height: 8 }
const none = { left: 0, top: 0, right: 0, bottom: 0 }

describe('newRect', () => {
  it('is the old map extended or cropped by the edges', () => {
    expect(newRect(map, { left: 2, top: 0, right: -3, bottom: 1 })).toEqual({ x0: -2, y0: 0, x1: 7, y1: 9 })
  })
})

describe('fitView', () => {
  it('fits old and new map inside the stage and round-trips coordinates', () => {
    const edges = { left: 6, top: 0, right: 0, bottom: 4 }
    const v = fitView(map, edges, 600, 400)
    const r = newRect(map, edges)
    for (const x of [r.x0, 0, map.width, r.x1]) {
      const px = toScreenX(v, x)
      expect(px).toBeGreaterThanOrEqual(0)
      expect(px).toBeLessThanOrEqual(600)
      expect(toWorldX(v, px)).toBeCloseTo(x)
    }
  })
})

describe('edgesFromDrag', () => {
  it('drags the west edge outwards (grow) and inwards (crop), snapping to tiles', () => {
    expect(edgesFromDrag('w', -2.4, 3, map, none)).toEqual({ ...none, left: 2 })
    expect(edgesFromDrag('w', 3.6, 3, map, none)).toEqual({ ...none, left: -4 })
  })

  it('drags the south-east corner on both axes', () => {
    expect(edgesFromDrag('se', 12.2, 5.4, map, none)).toEqual({ ...none, right: 2, bottom: -3 })
  })

  it('never lets an edge cross the opposite one or grow past the maximum', () => {
    expect(edgesFromDrag('e', -50, 0, map, none).right).toBe(1 - map.width)
    expect(edgesFromDrag('n', 0, 99, map, none).top).toBe(-(map.height - 1))
    expect(edgesFromDrag('e', 99999, 0, map, none).right).toBe(MAX_MAP_SIZE - map.width)
  })

  it('keeps the other edges as they were', () => {
    const e = { left: 1, top: 2, right: 3, bottom: 4 }
    expect(edgesFromDrag('n', 0, -5, map, e)).toEqual({ ...e, top: 5 })
  })
})
