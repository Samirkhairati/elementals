import { describe, expect, it } from 'vitest'
import { AXIS_LOCK_THRESHOLD, applyAxisLock, guideLines, type AxisLock } from './axisLock'

describe('applyAxisLock', () => {
  it('does nothing without Shift, and drops an earlier lock', () => {
    const lock: AxisLock = { originX: 0, originY: 0, axis: 'x' }
    expect(applyAxisLock(lock, false, 40, 50)).toEqual({ x: 40, y: 50, lock: null })
    expect(applyAxisLock(null, false, 40, 50)).toEqual({ x: 40, y: 50, lock: null })
  })

  it('holds the position where Shift went down until the pointer has clearly gone one way', () => {
    const first = applyAxisLock(null, true, 100, 100)
    expect(first).toMatchObject({ x: 100, y: 100, lock: { originX: 100, originY: 100, axis: null } })
    const wobble = applyAxisLock(first.lock, true, 100 + AXIS_LOCK_THRESHOLD - 1, 103)
    expect(wobble).toMatchObject({ x: 100, y: 100 })
    expect(wobble.lock?.axis).toBeNull()
  })

  it('locks to the dominant direction and keeps the other coordinate at the origin', () => {
    const start = applyAxisLock(null, true, 100, 100)
    const sideways = applyAxisLock(start.lock, true, 160, 108)
    expect(sideways).toMatchObject({ x: 160, y: 100, lock: { axis: 'x' } })
    // later moves stay on the axis, whatever the other distance becomes
    expect(applyAxisLock(sideways.lock, true, 20, 400)).toMatchObject({ x: 20, y: 100 })

    const vertical = applyAxisLock(applyAxisLock(null, true, 100, 100).lock, true, 105, 30)
    expect(vertical).toMatchObject({ x: 100, y: 30, lock: { axis: 'y' } })
  })

  it('releasing Shift frees the picture and a new press starts a new lock', () => {
    const locked = applyAxisLock(applyAxisLock(null, true, 0, 0).lock, true, 50, 2)
    const freed = applyAxisLock(locked.lock, false, 50, 70)
    expect(freed).toEqual({ x: 50, y: 70, lock: null })
    expect(applyAxisLock(freed.lock, true, 50, 70).lock).toMatchObject({ originX: 50, originY: 70, axis: null })
  })
})

describe('guideLines', () => {
  const bounds = { x: -50, y: -40, w: 100, h: 40 }
  it('moving sideways draws lines along the top and bottom edges', () => {
    expect(guideLines('x', bounds, { x: 200, y: 300 }, 1000)).toEqual([
      { x1: -1000, y1: 260, x2: 1000, y2: 260 },
      { x1: -1000, y1: 300, x2: 1000, y2: 300 },
    ])
  })
  it('moving up and down draws lines along the left and right edges', () => {
    expect(guideLines('y', bounds, { x: 200, y: 300 }, 1000)).toEqual([
      { x1: 150, y1: -1000, x2: 150, y2: 1000 },
      { x1: 250, y1: -1000, x2: 250, y2: 1000 },
    ])
  })
})
