import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { useDismiss, type DismissOptions } from './useDismiss'

function Popover({ open, onClose, opts }: { open: boolean; onClose: () => void; opts?: DismissOptions }) {
  const box = useRef<HTMLDivElement>(null)
  const anchor = useRef<HTMLButtonElement>(null)
  useDismiss(open, [box, anchor], onClose, opts)
  return (
    <div>
      <button ref={anchor}>anchor</button>
      <div ref={box} data-testid="box">
        <span>inside</span>
      </div>
      <span>outside</span>
    </div>
  )
}

describe('useDismiss', () => {
  it('closes on a press outside or Escape, not on a press inside its elements', () => {
    const onClose = vi.fn()
    render(<Popover open onClose={onClose} />)
    fireEvent.pointerDown(screen.getByText('inside'))
    fireEvent.pointerDown(screen.getByText('anchor'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.pointerDown(screen.getByText('outside'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('does nothing while closed', () => {
    const onClose = vi.fn()
    render(<Popover open={false} onClose={onClose} opts={{ onResize: true, onScroll: 'any' }} />)
    fireEvent.pointerDown(screen.getByText('outside'))
    fireEvent(window, new Event('resize'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on resize and on scrolling as asked', () => {
    const onClose = vi.fn()
    const { unmount } = render(<Popover open onClose={onClose} opts={{ onResize: true, onScroll: 'outside' }} />)
    fireEvent.scroll(screen.getByTestId('box'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.scroll(screen.getByText('outside'))
    fireEvent(window, new Event('resize'))
    expect(onClose).toHaveBeenCalledTimes(2)
    unmount()
    fireEvent(window, new Event('resize'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
