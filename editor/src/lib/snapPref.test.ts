import { afterEach, describe, expect, it } from 'vitest'
import { getSnapToTile, setSnapToTile, snapValue } from './snapPref'

afterEach(() => setSnapToTile(false))

describe('snapValue', () => {
  it('rounds to the nearest multiple and respects the minimum', () => {
    expect(snapValue(40, 32)).toBe(32)
    expect(snapValue(48, 32)).toBe(64)
    expect(snapValue(-50, 32)).toBe(-64)
    expect(snapValue(5, 32, 32)).toBe(32) // a size never snaps to nothing
    expect(snapValue(0, 32, 32)).toBe(32)
  })
})

describe('snap preference', () => {
  it('is one shared value', () => {
    expect(getSnapToTile()).toBe(false)
    setSnapToTile(true)
    expect(getSnapToTile()).toBe(true)
    setSnapToTile(true) // no change
    expect(getSnapToTile()).toBe(true)
    setSnapToTile(false)
    expect(getSnapToTile()).toBe(false)
  })
})
