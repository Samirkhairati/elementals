// Closing a hand-made popover (not a Radix one): a press outside the elements that belong to it, or Escape, closes it;
// optionally a window resize or a scroll does too. Listeners are on the window in the capture phase, so a press is seen
// even when something below stops it.

import { useEffect, useRef, type RefObject } from 'react'

export interface DismissOptions {
  /** Close when the window is resized (a popover placed in page coordinates would be left behind). */
  onResize?: boolean
  /** Close on scrolling: of anything, or of anything outside the popover's own elements. */
  onScroll?: 'any' | 'outside'
}

/** While `open`, calls `onClose` on a pointer press outside every element in `inside`, on Escape, and as `opts` asks. */
export function useDismiss(open: boolean, inside: ReadonlyArray<RefObject<Element | null>>, onClose: () => void, opts: DismissOptions = {}) {
  // Read through a ref: callers pass a fresh array and callback every render, which must not re-subscribe.
  const latest = useRef({ inside, onClose })
  useEffect(() => {
    latest.current = { inside, onClose }
  })
  const { onResize = false, onScroll } = opts

  useEffect(() => {
    if (!open) return
    const isInside = (t: EventTarget | null) => t instanceof Node && latest.current.inside.some((r) => r.current?.contains(t))
    const close = () => latest.current.onClose()
    const down = (e: PointerEvent) => {
      if (!isInside(e.target)) close()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const scroll = (e: Event) => {
      if (onScroll === 'any' || !isInside(e.target)) close()
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key, true)
    if (onResize) window.addEventListener('resize', close)
    if (onScroll) window.addEventListener('scroll', scroll, true)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', scroll, true)
    }
  }, [open, onResize, onScroll])
}
