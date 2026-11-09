import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useShortcuts } from './useShortcuts'
import { useShortcutStore } from '@/store/shortcutStore'

const press = (key: string, init: KeyboardEventInit = {}, target: Element | Window = window) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  act(() => {
    target.dispatchEvent(e)
  })
  return e
}

afterEach(() => useShortcutStore.getState().resetAll())

describe('useShortcuts', () => {
  it('runs the handler of the matching action with the latest closure', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ fn }) => useShortcuts({ 'tool.brush': fn }), { initialProps: { fn: first } })
    rerender({ fn: second })
    press('b')
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('ignores plain keys while typing in a field, but not combos marked for text fields', () => {
    const brush = vi.fn()
    const next = vi.fn()
    renderHook(() => useShortcuts({ 'tool.brush': brush, 'view.next': next }))
    const input = document.createElement('input')
    document.body.appendChild(input)
    press('b', {}, input)
    press('Tab', { ctrlKey: true }, input)
    input.remove()
    expect(brush).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('follows a rebinding made in the store', () => {
    const brush = vi.fn()
    renderHook(() => useShortcuts({ 'tool.brush': brush }))
    act(() => useShortcutStore.getState().setBindings('tool.brush', ['Q']))
    press('b')
    expect(brush).not.toHaveBeenCalled()
    press('q')
    expect(brush).toHaveBeenCalledTimes(1)
  })

  it('does nothing when disabled', () => {
    const brush = vi.fn()
    renderHook(() => useShortcuts({ 'tool.brush': brush }, false))
    press('b')
    expect(brush).not.toHaveBeenCalled()
  })
})
