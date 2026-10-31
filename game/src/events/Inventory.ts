type Listener = (item: string) => void;

/**
 * In-memory item bag. The real item system does not exist yet; this keeps `giveItem` / `removeItem`
 * / `hasItem` honest (counts survive until the page is reloaded). Counts never go below 0.
 */
export class Inventory {
  private counts = new Map<string, number>();
  private listeners = new Set<Listener>();

  public get(item: string): number {
    return this.counts.get(item) ?? 0;
  }

  public has(item: string, qty = 1): boolean {
    return this.get(item) >= qty;
  }

  public add(item: string, qty = 1): number {
    const n = Math.max(0, Math.trunc(qty));
    if (!item || n === 0) return this.get(item);
    this.counts.set(item, this.get(item) + n);
    this.notify(item);
    return this.get(item);
  }

  /** Removes up to `qty`; returns how many were actually removed. */
  public remove(item: string, qty = 1): number {
    const have = this.get(item);
    const n = Math.min(have, Math.max(0, Math.trunc(qty)));
    if (n === 0) return 0;
    if (have - n === 0) this.counts.delete(item);
    else this.counts.set(item, have - n);
    this.notify(item);
    return n;
  }

  public clear(): void {
    this.counts.clear();
    this.notify("");
  }

  public toJSON(): Record<string, number> {
    return Object.fromEntries(this.counts);
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(item: string): void {
    for (const l of [...this.listeners]) l(item);
  }
}
