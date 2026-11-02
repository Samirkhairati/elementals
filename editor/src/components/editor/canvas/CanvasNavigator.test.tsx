import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CanvasNavigator, type ViewportHandle } from './CanvasNavigator'
import type { CanvasView } from '@/hooks/editor/canvas/viewMath'

function setup(view: CanvasView = { scale: 0.5, x: 0, y: 0 }) {
  const viewport: ViewportHandle = {
    viewStore: { subscribe: () => () => {}, getSnapshot: () => view },
    zoomTo: vi.fn(),
    zoomBy: vi.fn(),
    panToWorld: vi.fn(),
    reset: vi.fn(),
  }
  render(
    <CanvasNavigator
      viewport={viewport}
      dimensions={{ width: 800, height: 600 }}
      mapWidth={40}
      mapHeight={30}
      layers={[]}
      entities={[]}
      images={{}}
    />,
  )
  return viewport
}

beforeEach(() => {
  localStorage.clear()
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => true)
})

describe('CanvasNavigator zoom bar', () => {
  it('shows the zoom and drives zoom in/out, the slider, 1:1 and reset', () => {
    const vp = setup()
    expect(screen.getByTestId('zoom-readout')).toHaveTextContent('50%')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(vp.zoomBy).toHaveBeenCalledWith(1.25)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(vp.zoomBy).toHaveBeenLastCalledWith(1 / 1.25)
    fireEvent.click(screen.getByRole('button', { name: 'Actual size' }))
    expect(vp.zoomTo).toHaveBeenCalledWith(1)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Zoom' }), { key: 'End' })
    // the slider snaps to 0.01 steps of log2(zoom), so the top end is a hair under 8
    expect((vp.zoomTo as ReturnType<typeof vi.fn>).mock.lastCall![0]).toBeCloseTo(8, 1)
    fireEvent.click(screen.getByRole('button', { name: 'Fit view' }))
    expect(vp.reset).toHaveBeenCalled()
  })

  it('marks reset as active only while the view is the fitted one', () => {
    // 40 x 30 tiles = 1280 x 960 px in an 800 x 600 box: fits at 0.5 x 600*0.8/960 = 0.5, centred
    setup({ scale: 0.5, x: 80, y: 60 })
    expect(screen.getByRole('button', { name: 'Fit view' }).dataset.active).toBe('true')
  })
})

describe('CanvasNavigator minimap', () => {
  it('frames the visible part of the map', () => {
    setup({ scale: 0.5, x: 0, y: 0 })
    // minimap: 40 x 30 tiles in 160 x 120 => 4 px per tile; the box shows 1600 x 1200 world px = 50 x 37.5 tiles
    const frame = screen.getByTestId('minimap-frame')
    expect(parseFloat(frame.style.left)).toBeCloseTo(0)
    expect(parseFloat(frame.style.width)).toBeCloseTo(200)
  })

  it('centres the view where it is clicked or dragged', () => {
    const vp = setup()
    const minimap = screen.getByTestId('minimap')
    minimap.getBoundingClientRect = () => ({ left: 10, top: 20, width: 160, height: 120, right: 170, bottom: 140, x: 10, y: 20, toJSON: () => ({}) })
    fireEvent.pointerDown(minimap, { clientX: 10 + 80, clientY: 20 + 60, pointerId: 1 })
    expect(vp.panToWorld).toHaveBeenLastCalledWith(20 * 32, 15 * 32)
    fireEvent.pointerMove(minimap, { clientX: 10 + 160, clientY: 20 + 120, pointerId: 1 })
    expect(vp.panToWorld).toHaveBeenLastCalledWith(40 * 32, 30 * 32)
  })

  it('can be hidden and remembers it', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Hide minimap' }))
    expect(screen.queryByTestId('minimap')).toBeNull()
    expect(localStorage.getItem('elementals.minimapOpen')).toBe('false')
    expect(screen.getByRole('button', { name: 'Show minimap' })).toBeInTheDocument()
  })
})
