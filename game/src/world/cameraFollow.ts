/**
 * How far the camera closes the gap to its target in one frame (the `lerp` of Phaser's camera follow, 0..1).
 *
 * A plain exponential ease never arrives: its last stretch creeps by fractions of a screen pixel, and every tile and
 * sprite then rounds to the screen at a different moment, which reads as the whole picture shimmering as it stops.
 * So the ease is the same at any frame rate, keeps a small minimum speed so it finishes quickly, and lands exactly
 * once the gap is under half a screen pixel.
 *
 * @param gap distance to the target in world pixels (>= 0)
 * @param dtSeconds frame time
 * @param lag seconds to close most of the gap; 0 = locked to the target
 * @param zoom screen pixels per world pixel
 */
export function followLerp(gap: number, dtSeconds: number, lag: number, zoom: number): number {
  if (lag <= 0 || gap <= 0 || gap * zoom <= SNAP_SCREEN_PX) return 1;
  const ease = 1 - Math.exp(-dtSeconds / lag);
  const minStep = (MIN_SPEED * dtSeconds) / gap;
  return Math.min(1, Math.max(ease, minStep));
}

/** Under this many screen pixels from the target the camera lands on it. */
export const SNAP_SCREEN_PX = 0.5;
/** World pixels per second the camera keeps moving at, however small the remaining gap. */
export const MIN_SPEED = 30;
