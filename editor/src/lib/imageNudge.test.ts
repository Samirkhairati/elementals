import { describe, expect, it } from 'vitest'
import { nudgeStep } from './imageNudge'
import { moveInDrawOrderTo, sortedImages } from './layerOrder'

describe('nudgeStep', () => {
  it('is one pixel without Shift, however long the key is held', () => {
    expect([0, 1, 5, 30].map((n) => nudgeStep(false, n))).toEqual([1, 1, 1, 1])
  })
  it('with Shift starts at 8 and doubles for every repeat, up to a cap', () => {
    expect([0, 1, 2, 3, 4].map((n) => nudgeStep(true, n))).toEqual([8, 16, 32, 64, 128])
    expect(nudgeStep(true, 40)).toBe(512)
  })
})

describe('moveInDrawOrderTo', () => {
  const imgs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] // a at the back, d in front
  const order = (list: { id: string; z?: number }[]) => sortedImages(list).map((i) => i.id).join('')
  it('drops in front of or behind another image, in one go', () => {
    expect(order(moveInDrawOrderTo(imgs, 'a', 'c', 'top'))).toBe('bcad')
    expect(order(moveInDrawOrderTo(imgs, 'a', 'c', 'bottom'))).toBe('bacd')
    expect(order(moveInDrawOrderTo(imgs, 'd', 'a', 'bottom'))).toBe('dabc')
    expect(order(moveInDrawOrderTo(imgs, 'd', 'b', 'top'))).toBe('abdc')
  })
  it('works with different z values and does nothing when dropped where it already is', () => {
    const z = [{ id: 'a', z: 1 }, { id: 'b', z: 5 }, { id: 'c', z: 9 }]
    expect(order(moveInDrawOrderTo(z, 'c', 'a', 'bottom'))).toBe('cab')
    expect(moveInDrawOrderTo(imgs, 'b', 'a', 'top')).toBe(imgs)
  })
})
