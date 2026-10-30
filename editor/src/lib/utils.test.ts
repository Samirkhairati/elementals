import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('joins class names and drops falsy values', () => {
    expect(cn('a', { b: false }, undefined, 'c')).toBe('a c')
  })

  it('resolves conflicting tailwind classes (last wins)', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })
})
