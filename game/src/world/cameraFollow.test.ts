import { describe, expect, it } from 'vitest';
import { followLerp, snapToScreenPixel, SNAP_SCREEN_PX } from './cameraFollow';

/** Run the ease for `seconds` toward a fixed target; returns the gap after each frame. */
function settle(gap0: number, fps: number, lag: number, zoom: number, seconds = 3): number[] {
  const dt = 1 / fps;
  const gaps: number[] = [];
  let gap = gap0;
  for (let i = 0; i < Math.round(seconds * fps); i++) {
    gap -= gap * followLerp(gap, dt, lag, zoom);
    gaps.push(gap);
  }
  return gaps;
}

describe('followLerp', () => {
  it('locks to the target without lag, and when there is nothing left to close', () => {
    expect(followLerp(40, 1 / 60, 0, 1)).toBe(1);
    expect(followLerp(0, 1 / 60, 0.08, 1)).toBe(1);
  });

  it('lands once the gap is under half a screen pixel, whatever the zoom', () => {
    expect(followLerp(SNAP_SCREEN_PX / 2, 1 / 60, 0.08, 2)).toBe(1);
    expect(followLerp(SNAP_SCREEN_PX * 1.2, 1 / 60, 0.08, 1)).toBeLessThan(1);
  });

  it('never overshoots: the gap only shrinks, and ends at exactly zero', () => {
    for (const fps of [30, 60, 144]) {
      const gaps = settle(14, fps, 0.08, 1.3);
      for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeLessThanOrEqual(gaps[i - 1]);
      expect(gaps.every((g) => g >= 0)).toBe(true);
      expect(gaps[gaps.length - 1]).toBe(0);
    }
  });

  it('finishes quickly, with no long sub-pixel creep at the end', () => {
    const zoom = 1.3;
    const gaps = settle(14, 60, 0.08, zoom);
    const creeping = gaps.filter((g) => g > 0 && g * zoom < 1).length;
    expect(creeping).toBeLessThanOrEqual(6); // about 100 ms of sub-pixel motion, not the half second a bare exponential takes
    const done = gaps.findIndex((g) => g === 0);
    expect(done).toBeGreaterThan(0);
    expect(done / 60).toBeLessThan(0.7);
  });

  it('is the same ease at 60 and 144 Hz while far from the target', () => {
    const at = (fps: number) => settle(100, fps, 0.08, 1, 0.2).pop() as number;
    expect(Math.abs(at(60) - at(144))).toBeLessThan(0.5);
  });
});

describe('snapToScreenPixel', () => {
  it('lands on a whole screen pixel and moves by at most half of one', () => {
    for (const zoom of [0.5, 1, 1.3, 2.75]) {
      for (const scroll of [0, 3.37, 100.5, 811.123]) {
        const snapped = snapToScreenPixel(scroll, zoom);
        expect(Math.abs(snapped * zoom - Math.round(snapped * zoom))).toBeLessThan(1e-9);
        expect(Math.abs(snapped - scroll) * zoom).toBeLessThanOrEqual(0.5 + 1e-9);
      }
    }
  });
});
