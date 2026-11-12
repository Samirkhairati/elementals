// Mouse drags that keep following the pointer outside the element they started on: the listeners go on the window and
// are removed again when the button is released. Every hand-written drag in the editor (crop box, panning a preview,
// picking a range of tiles) goes through here, so none can leave a listener behind.

export interface WindowDrag {
  /** Every mouse move until the drag ends. */
  move: (e: MouseEvent) => void
  /** Once, when the button is released (after the listeners are gone). */
  up?: (e: MouseEvent) => void
  /** Only releasing this button ends the drag (default: any button). */
  endButton?: number
}

/** Starts following the mouse on the whole window. Returns a function that stops early (without calling `up`). */
export function trackWindowDrag({ move, up, endButton }: WindowDrag): () => void {
  const onUp = (e: MouseEvent) => {
    if (endButton !== undefined && e.button !== endButton) return
    stop()
    up?.(e)
  }
  const stop = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', onUp)
  return stop
}

/** A drag reported as the distance moved since the previous event (panning). */
export function trackWindowPan(
  start: { clientX: number; clientY: number },
  onDelta: (dx: number, dy: number) => void,
  opts: { onEnd?: () => void; endButton?: number } = {},
): () => void {
  let lx = start.clientX
  let ly = start.clientY
  return trackWindowDrag({
    move: (e) => {
      const dx = e.clientX - lx
      const dy = e.clientY - ly
      lx = e.clientX
      ly = e.clientY
      onDelta(dx, dy)
    },
    up: () => opts.onEnd?.(),
    endButton: opts.endButton,
  })
}
