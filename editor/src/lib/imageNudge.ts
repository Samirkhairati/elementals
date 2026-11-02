// Moving the picked image with the arrow keys. A plain arrow is one pixel; with Shift the step starts at 8 px and
// doubles for every repeat while the key is held, so a long press crosses the map quickly (capped).

export const NUDGE_FINE = 1
export const NUDGE_FAST = 8
export const NUDGE_MAX = 512

/** Pixels moved by a key press: `repeats` = how many auto-repeats of the held key came before this one. */
export function nudgeStep(shift: boolean, repeats: number): number {
  if (!shift) return NUDGE_FINE
  return Math.min(NUDGE_MAX, NUDGE_FAST * 2 ** Math.max(0, repeats))
}

export const ARROW_DELTAS: Record<string, { dx: number; dy: number }> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
}
