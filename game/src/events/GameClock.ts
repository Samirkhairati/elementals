import type { EventClock } from "./types";

interface Timer {
  remaining: number;
  resolve: () => void;
}

/**
 * Game-time clock for events: `tick(delta)` is called once per update with the frame time in ms, so
 * waits pause with the game and tests advance time by hand. Waits abort cleanly (the timer is dropped).
 */
export class GameClock implements EventClock {
  private timers = new Set<Timer>();

  public wait(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
      if (signal.aborted) return resolve();
      const timer: Timer = { remaining: Math.max(0, ms), resolve };
      this.timers.add(timer);
      signal.addEventListener(
        "abort",
        () => {
          this.timers.delete(timer);
          resolve();
        },
        { once: true },
      );
    });
  }

  public nextFrame(signal: AbortSignal): Promise<void> {
    return this.wait(0, signal);
  }

  /** Advances time; timers that reach 0 resolve (new timers started meanwhile wait for the next tick). */
  public tick(delta: number): void {
    const due: Timer[] = [];
    for (const t of [...this.timers]) {
      t.remaining -= delta;
      if (t.remaining <= 0) due.push(t);
    }
    for (const t of due) {
      this.timers.delete(t);
      t.resolve();
    }
  }

  public get pending(): number {
    return this.timers.size;
  }

  public clear(): void {
    for (const t of this.timers) t.resolve();
    this.timers.clear();
  }
}
