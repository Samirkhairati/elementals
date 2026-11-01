import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('joins class names and drops falsy values', () => {
    expect(cn('a', { b: false }, undefined, 'c')).toBe('a c')
  })

  it('keeps the custom ed-* font sizes next to a text colour', () => {
    expect(cn('text-ed-body', 'text-red-400')).toBe('text-ed-body text-red-400')
    expect(cn('text-ed-body', 'text-ed-title')).toBe('text-ed-title')
  })

  it('resolves conflicting tailwind classes (last wins)', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })
})
