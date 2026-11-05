import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ZoomPane } from './ZoomPane'
import { focusView } from '@/lib/zoom'

// jsdom has no layout: give every element a 400 x 300 box.
const proto = HTMLElement.prototype
const saved = { w: Object.getOwnPropertyDescriptor(proto, 'clientWidth'), h: Object.getOwnPropertyDescriptor(proto, 'clientHeight') }
beforeEach(() => {
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get: () => 400 })
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => 300 })
})
afterEach(() => {
  if (saved.w) Object.defineProperty(proto, 'clientWidth', saved.w)
  else delete (proto as unknown as Record<string, unknown>).clientWidth
  if (saved.h) Object.defineProperty(proto, 'clientHeight', saved.h)
  else delete (proto as unknown as Record<string, unknown>).clientHeight
})

const pane = (focus?: { x: number; y: number; w: number; h: number } | null) => (
  <ZoomPane width={1000} height={1000} focus={focus}>
    {(zoom) => <div data-testid="content" data-zoom={zoom} />}
  </ZoomPane>
)

describe('ZoomPane focus', () => {
  it('without a focus it starts fitted to the whole picture', () => {
    render(pane())
    expect(Number(screen.getByTestId('content').dataset.zoom)).toBeCloseTo(0.298, 2)
  })

  it('with a focus it zooms to fit that part and scrolls it to the middle', () => {
    const focus = { x: 500, y: 600, w: 100, h: 80 }
    render(pane(focus))
    const expected = focusView(398, 298, focus)
    expect(Number(screen.getByTestId('content').dataset.zoom)).toBeCloseTo(expected.zoom, 5)
    const viewport = screen.getByTestId('zoom-viewport')
    expect(viewport.scrollLeft).toBeCloseTo(expected.scrollLeft, 3)
    expect(viewport.scrollTop).toBeCloseTo(expected.scrollTop, 3)
  })

  it('moves again when the rectangle changes, e.g. after another crop', () => {
    const { rerender } = render(pane({ x: 500, y: 600, w: 100, h: 80 }))
    const next = { x: 100, y: 100, w: 200, h: 100 }
    rerender(pane(next))
    const expected = focusView(398, 298, next)
    expect(Number(screen.getByTestId('content').dataset.zoom)).toBeCloseTo(expected.zoom, 5)
    expect(screen.getByTestId('zoom-viewport').scrollLeft).toBeCloseTo(expected.scrollLeft, 3)
  })
})
