import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCanvasInteraction } from './useCanvasInteraction'
import { makeLayer, makeMap } from '@/test/helpers'

/** A stage whose pointer the test moves; the world position equals the pointer (no pan, no zoom). */
function setup(over: Record<string, unknown> = {}) {
  const pointer = { x: 0, y: 0 }
  const stage = { getPointerPosition: () => ({ ...pointer }), x: () => 0, y: () => 0, scaleX: () => 1, getStage: () => stage, name: () => '', getParent: () => null }
  const layer = makeLayer('I1', { type: 'image', name: 'Images', images: [] })
  const props = {
    activeMap: makeMap({ layers: [layer] }),
    layers: [layer],
    activeTool: 'brush',
    paintMode: 'discontinuous',
    activeLayerId: 'I1',
    isPainting: false,
    setIsPainting: vi.fn(),
    setPaintStartPos: vi.fn(),
    setTileSelection: vi.fn(),
    handlePaint: vi.fn(),
    handlePaintBucket: vi.fn(),
    handleRectangleFill: vi.fn(),
    handleCommit: vi.fn(),
    getTileCoordsFromPointer: () => ({ x: 1, y: 1, rawX: 1, rawY: 1, isInside: true }),
    isPanningRef: { current: false },
    isZoomingRef: { current: false },
    startPan: vi.fn(),
    movePan: vi.fn(),
    endPan: vi.fn(),
    stageRef: { current: stage },
    snapToGrid: false,
    pendingImage: { graphicId: 'a.png' },
    commitImagePlacement: vi.fn(),
    cancelImagePlacement: vi.fn(),
    clearImageSelection: vi.fn(),
    ...over,
  }
  const hook = renderHook(() => useCanvasInteraction(props as never))
  const move = (x: number, y: number, shiftKey = false) => {
    pointer.x = x
    pointer.y = y
    act(() => hook.result.current.handleStageMouseMove({ evt: { clientX: x, clientY: y, shiftKey }, target: stage } as never))
  }
  const click = (shiftKey = false) =>
    act(() => hook.result.current.handleStageMouseDown({ evt: { button: 0, shiftKey, clientX: pointer.x, clientY: pointer.y }, target: stage } as never))
  return { hook, props, move, click }
}

describe('placing a picture: Shift locks one axis', () => {
  it('without Shift the picture follows the pointer', () => {
    const { hook, move } = setup()
    move(120, 80)
    expect(hook.result.current.stagePointerPos).toEqual({ x: 120, y: 80 })
    expect(hook.result.current.placementAxis).toBeNull()
  })

  it('with Shift it keeps the position where Shift went down, then follows one axis, and says which', () => {
    const { hook, move } = setup()
    move(100, 100, true)
    expect(hook.result.current.stagePointerPos).toEqual({ x: 100, y: 100 })
    move(180, 110, true)
    expect(hook.result.current.stagePointerPos).toEqual({ x: 180, y: 100 })
    expect(hook.result.current.placementAxis).toBe('x')
    move(60, 260, true)
    expect(hook.result.current.stagePointerPos).toEqual({ x: 60, y: 100 })
  })

  it('releasing Shift frees it and clears the guide', () => {
    const { hook, move } = setup()
    move(100, 100, true)
    move(180, 110, true)
    move(200, 150, false)
    expect(hook.result.current.stagePointerPos).toEqual({ x: 200, y: 150 })
    expect(hook.result.current.placementAxis).toBeNull()
  })

  it('a Shift+click places the picture where the preview was (it does not cancel placement)', () => {
    const { props, move, click } = setup()
    move(100, 100, true)
    move(180, 110, true)
    click(true)
    expect(props.commitImagePlacement).toHaveBeenCalledWith(180, 100)
    expect(props.cancelImagePlacement).not.toHaveBeenCalled()
  })

  it('after a picture is placed, Shift lines the next one up with it (same row or column)', () => {
    const { hook, props, move, click } = setup()
    move(64, 96)
    click()
    move(300, 110, true)
    expect(hook.result.current.placementAxis).toBe('x')
    expect(hook.result.current.stagePointerPos).toEqual({ x: 300, y: 96 })
    click(true)
    expect(props.commitImagePlacement).toHaveBeenLastCalledWith(300, 96)
    // released and pressed again further down: the column of the last one
    move(310, 400, false)
    move(305, 420, true)
    expect(hook.result.current.placementAxis).toBe('y')
    expect(hook.result.current.stagePointerPos).toEqual({ x: 300, y: 420 })
  })

  it('a plain click still places where the pointer is', () => {
    const { props, move, click } = setup()
    move(64, 96)
    click()
    expect(props.commitImagePlacement).toHaveBeenCalledWith(64, 96)
  })

  it('without a picture waiting, Shift+left is still the secondary click', () => {
    const { props, move, click } = setup({ pendingImage: null })
    move(64, 96)
    click(true)
    expect(props.commitImagePlacement).not.toHaveBeenCalled()
  })
})
