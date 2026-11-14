import { describe, expect, it } from 'vitest'
import { nudgeStep } from './imageNudge'

describe('nudgeStep', () => {
  it('is one pixel without Shift and 8 with it, and never grows while the key is held', () => {
    expect(nudgeStep(false)).toBe(1)
    expect(nudgeStep(true)).toBe(8)
  })
})
