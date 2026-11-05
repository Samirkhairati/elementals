// Moving the picked image with the arrow keys. A plain arrow is one pixel and Shift+arrow is 8 px, each press (or
// auto-repeat while the key is held) moving the same amount: a steady speed you can stop on.

export const NUDGE_FINE = 1
export const NUDGE_FAST = 8

/** Pixels moved by one key press (or one auto-repeat of a held key). */
export function nudgeStep(shift: boolean): number {
  return shift ? NUDGE_FAST : NUDGE_FINE
}

export const ARROW_DELTAS: Record<string, { dx: number; dy: number }> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
}
