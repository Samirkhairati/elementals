// The active look profile (time of day, weather, ...) and the transition to a new one. Pure: the LookRuntime reads
// `blend` every frame and re-grades while it changes.

export interface LookBlend {
  /** The profile faded out (null = default looks). */
  from: string | null;
  /** The profile faded in. */
  to: string | null;
  /** 0..1 (eased); 1 = settled on `to`. */
  t: number;
}

type Listener = (blend: LookBlend) => void;

export class LookState {
  private from: string | null = null;
  private to: string | null = null;
  private elapsed = 0;
  private duration = 0;
  private listeners = new Set<Listener>();
  private waiters: (() => void)[] = [];

  /** The profile shown (or being faded in). */
  get profile(): string | null {
    return this.to;
  }

  get blend(): LookBlend {
    const raw = this.duration <= 0 ? 1 : Math.min(1, this.elapsed / this.duration);
    return { from: this.from, to: this.to, t: raw * raw * (3 - 2 * raw) };
  }

  get transitioning(): boolean {
    return this.duration > 0 && this.elapsed < this.duration;
  }

  /** Switches profile, at once or over `ms`. Resolves when the transition ends (or is replaced). */
  setProfile(profile: string | null, ms = 0): Promise<void> {
    if (profile === this.to && !this.transitioning) return Promise.resolve();
    // A transition cut short continues from what is on screen now (the nearer profile).
    this.from = this.transitioning && this.blend.t < 0.5 ? this.from : this.to;
    this.to = profile;
    this.elapsed = 0;
    this.duration = Math.max(0, ms);
    this.finishWaiters();
    this.emit();
    if (this.duration === 0) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  /** Advances the transition; true while something changed. */
  update(dtMs: number): boolean {
    if (!this.transitioning) return false;
    this.elapsed = Math.min(this.duration, this.elapsed + Math.max(0, dtMs));
    this.emit();
    if (!this.transitioning) this.finishWaiters();
    return true;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Back to no profile, no transition, no listeners (tests, game restart). */
  reset(profile: string | null = null): void {
    this.from = profile;
    this.to = profile;
    this.elapsed = 0;
    this.duration = 0;
    this.finishWaiters();
  }

  private emit(): void {
    const b = this.blend;
    for (const l of this.listeners) l(b);
  }

  private finishWaiters(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const resolve of w) resolve();
  }
}

export const lookState = new LookState();
