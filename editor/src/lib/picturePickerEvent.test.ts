import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { OPEN_PICTURE_PICKER_EVENT, openPicturePicker, setPicturePickerOpen, usePicturePickerOpen } from './picturePickerEvent'

afterEach(() => {
  setPicturePickerOpen(false)
  vi.useRealTimers()
})

describe('picture picker store', () => {
  it('asking for the picker opens it at once (the dock brings the Graphics panel up) and then tells the panel', () => {
    vi.useFakeTimers()
    const asked = vi.fn()
    window.addEventListener(OPEN_PICTURE_PICKER_EVENT, asked)
    const { result } = renderHook(() => usePicturePickerOpen())
    expect(result.current).toBe(false)
    act(() => openPicturePicker())
    expect(result.current).toBe(true)
    expect(asked).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(100))
    expect(asked).toHaveBeenCalledTimes(1)
    act(() => setPicturePickerOpen(false))
    expect(result.current).toBe(false)
    window.removeEventListener(OPEN_PICTURE_PICKER_EVENT, asked)
  })
})
