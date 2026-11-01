import type { AnimationRegistration } from "@shared/engine/index.ts";
import type { SpriteRegistry } from "@/data/spriteRegistry";
import { planSpriteLoads, type SheetLoad } from "./spritePlan";

/** What the loader needs from Phaser (faked in tests). */
export interface LoaderPort {
  textureExists(key: string): boolean;
  /** Queues one spritesheet. */
  queueSheet(sheet: SheetLoad): void;
  /** Starts the queue (a no-op while it already runs). `done` runs once, when everything queued so far is loaded. */
  start(done: () => void): void;
  /** Creates the animations that do not exist yet. */
  createAnimations(animations: readonly AnimationRegistration[]): void;
}

/**
 * Loads characters on demand (docs/database-and-characters-spec.md §10.4): the sheets of the characters a map needs
 * are loaded before it is shown, any other character the first time something swaps to it. Each character loads at
 * most once; concurrent requests share the running load. Unknown ids and sheets without a URL are reported, not thrown.
 */
export class CharacterLoader {
  private readonly requested = new Set<string>();
  private readonly registry: SpriteRegistry;
  private readonly port: LoaderPort;
  private readonly warn: (message: string) => void;
  private waiters: Array<() => void> = [];
  private pendingAnimations: AnimationRegistration[] = [];
  private running = false;

  constructor(registry: SpriteRegistry, port: LoaderPort, warn: (message: string) => void = (m) => console.warn(m)) {
    this.registry = registry;
    this.port = port;
    this.warn = warn;
  }

  /** Characters whose sheets are queued or loaded. */
  public has(id: string): boolean {
    return this.requested.has(id);
  }

  /** Resolves when every given character's sheets are loaded (immediately when there is nothing to load). */
  public ensure(ids: Iterable<string>): Promise<void> {
    const fresh: string[] = [];
    for (const id of new Set(ids)) {
      if (!id || this.requested.has(id)) continue;
      if (!this.registry.has(id)) {
        this.warn(`[Characters] unknown character "${id}"; nothing to load`);
        continue;
      }
      this.requested.add(id);
      fresh.push(id);
    }
    const plan = planSpriteLoads(fresh.map((id) => this.registry.get(id)).filter((e) => e !== undefined));
    for (const problem of plan.problems) this.warn(`[Characters] ${problem}`);
    const sheets = plan.sheets.filter((s) => !this.port.textureExists(s.textureKey));
    for (const sheet of sheets) this.port.queueSheet(sheet);
    if (sheets.length === 0 && !this.running) {
      this.port.createAnimations(plan.animations);
      return Promise.resolve();
    }
    const finished = new Promise<void>((resolve) => this.waiters.push(resolve));
    this.pendingAnimations.push(...plan.animations);
    if (!this.running) {
      this.running = true;
      this.port.start(() => this.complete());
    }
    return finished;
  }

  private complete(): void {
    this.running = false;
    this.port.createAnimations(this.pendingAnimations.splice(0));
    for (const resolve of this.waiters.splice(0)) resolve();
  }
}
