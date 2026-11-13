import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { shallowEqual, useShallowStable } from './useShallowStable'

describe('shallowEqual', () => {
  it('compares keys and values one level deep', () => {
    const fn = () => {}
    expect(shallowEqual({ a: 1, f: fn }, { a: 1, f: fn })).toBe(true)
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(shallowEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false)
    expect(shallowEqual({ a: {} }, { a: {} })).toBe(false)
    expect(shallowEqual({ n: NaN }, { n: NaN })).toBe(true)
  })
})

describe('useShallowStable', () => {
  it('keeps the same object while no value changes, and a new one when one does', () => {
    const list = [1]
    const { result, rerender } = renderHook(({ v }) => useShallowStable({ list, v }), { initialProps: { v: 1 } })
    const first = result.current
    rerender({ v: 1 })
    expect(result.current).toBe(first)
    rerender({ v: 2 })
    expect(result.current).not.toBe(first)
    expect(result.current.v).toBe(2)
  })
})
