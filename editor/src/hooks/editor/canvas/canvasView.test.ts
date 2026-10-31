import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { DEFAULT_CANVAS_VIEW, getCanvasView, resetCanvasView, setCanvasView, toggleCanvasView, useCanvasView } from './canvasView'

// This jsdom build has no usable localStorage: use an in-memory one.
const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  })
})
afterEach(() => {
  resetCanvasView()
  vi.unstubAllGlobals()
})

describe('canvas view settings', () => {
  it('defaults to everything visible', () => {
    expect(getCanvasView()).toEqual(DEFAULT_CANVAS_VIEW)
    expect(Object.values(DEFAULT_CANVAS_VIEW).every(Boolean)).toBe(true)
  })

  it('toggles one flag and notifies subscribers', () => {
    const { result } = renderHook(() => useCanvasView())
    expect(result.current.colliders).toBe(true)
    act(() => toggleCanvasView('colliders'))
    expect(result.current.colliders).toBe(false)
    expect(result.current.sprites).toBe(true)
    act(() => toggleCanvasView('colliders'))
    expect(result.current.colliders).toBe(true)
  })

  it('persists to localStorage and survives it being unavailable', () => {
    setCanvasView({ labels: false })
    expect(JSON.parse(store.get('elementals.canvasView')!).labels).toBe(false)
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(() => setCanvasView({ badges: false })).not.toThrow()
    expect(getCanvasView().badges).toBe(false)
  })

  it('does not notify when nothing changes', () => {
    let renders = 0
    renderHook(() => {
      renders++
      return useCanvasView()
    })
    const before = renders
    act(() => setCanvasView({ sprites: true }))
    expect(renders).toBe(before)
  })
})
