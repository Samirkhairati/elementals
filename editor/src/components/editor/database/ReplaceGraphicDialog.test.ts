import { describe, expect, it } from 'vitest'
import { sizeNote } from './ReplaceGraphicDialog'

describe('sizeNote', () => {
  const now = { width: 64, height: 32 }
  it('is silent when the size is the same or not known yet', () => {
    expect(sizeNote(now, null)).toBe('')
    expect(sizeNote(now, { width: 64, height: 32 })).toBe('')
  })
  it('names both sizes when they differ', () => {
    expect(sizeNote(now, { width: 64, height: 64 })).toMatch(/64×64 px.*64×32 px/)
  })
})
