import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type React from 'react'
import { usePanZoom, wheelZoom } from './usePanZoom'

const wheel = (init: Partial<React.WheelEvent>) => ({ preventDefault: () => {}, deltaX: 0, deltaY: 0, ctrlKey: false, metaKey: false, ...init }) as React.WheelEvent

describe('wheelZoom', () => {
  it('zooms in on a wheel up and stays within 0.1–5', () => {
    expect(wheelZoom(1, -100)).toBeGreaterThan(1)
    expect(wheelZoom(1, 100)).toBeLessThan(1)
    expect(wheelZoom(4.9, -10000)).toBe(5)
    expect(wheelZoom(0.2, 10000)).toBe(0.1)
  })
})

describe('usePanZoom', () => {
  it('the wheel pans, Ctrl/Cmd + wheel zooms', () => {
    const { result } = renderHook(() => usePanZoom())
    act(() => result.current.onWheel(wheel({ deltaX: 4, deltaY: 6 })))
    expect(result.current.pan).toEqual({ x: -4, y: -6 })
    act(() => result.current.onWheel(wheel({ deltaY: -100, metaKey: true })))
    expect(result.current.zoom).toBeGreaterThan(1)
    expect(result.current.transform).toBe(`translate(-4px, -6px) scale(${result.current.zoom})`)
  })

  it('a middle-button drag pans until the middle button is released', () => {
    const { result } = renderHook(() => usePanZoom())
    act(() => result.current.onMouseDown({ button: 1, clientX: 0, clientY: 0 } as React.MouseEvent))
    expect(result.current.isPanning).toBe(true)
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 7, clientY: 3 }))
      window.dispatchEvent(new MouseEvent('mouseup', { button: 1 }))
    })
    expect(result.current.pan).toEqual({ x: 7, y: 3 })
    expect(result.current.isPanning).toBe(false)
  })

  it('other buttons do not pan', () => {
    const { result } = renderHook(() => usePanZoom())
    act(() => result.current.onMouseDown({ button: 0, clientX: 0, clientY: 0 } as React.MouseEvent))
    expect(result.current.isPanning).toBe(false)
  })
})
