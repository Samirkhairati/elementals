import { commandsToGraph, type Command, type EventGraph, type EventState, type GameDatabase } from "@shared/engine/index.ts";
import type { World } from "@/ecs/World";
import type { Entity } from "@/ecs/Entity";
import { EventComponent } from "@/ecs/components/EventComponent";
import { EntityInfoComponent } from "@/ecs/components/EntityInfoComponent";
import { ColliderComponent } from "@/ecs/components/ColliderComponent";
import type { SpriteRegistry } from "@/data/spriteRegistry";
import { gameState } from "@/core/GameState";
import { EventBus, Events } from "@/utils/EventBus";
import { GameFlags } from "./GameFlags";
import { Inventory } from "./Inventory";
import { GameClock } from "./GameClock";
import { StateSelector } from "./StateSelector";
import { WorldEntityOps } from "./WorldEntityOps";
import { EventInterpreter, type RunResult } from "./EventInterpreter";
import type { EventContext, EventUI, MapService } from "./types";

const graphCache = new WeakMap<object, EventGraph>();

/**
 * The graph a state runs. States are still authored as command trees; each one is converted once (cached
 * by its command list) and the interpreter only ever sees graphs. Layout is skipped: the game does not
 * draw graphs.
 */
export function graphOf(state: Pick<EventState, "commands">): EventGraph {
  const key = state.commands as object;
  let graph = graphCache.get(key);
  if (!graph) {
    graph = commandsToGraph(state.commands as Command[], () => "start", { layout: false });
    graphCache.set(key, graph);
  }
  return graph;
}

export interface EventRuntimeOptions {
  world: World;
  sprites: SpriteRegistry;
  ui: EventUI;
  maps: MapService;
  database?: Pick<GameDatabase, "switches" | "variables"> & Partial<Pick<GameDatabase, "stages">>;
  /** Locks player input for a reason; returns the release function. Default: `gameState.lockInput`. */
  lockInput?: (reason: string) => () => void;
  /** Fires a custom event on the bus. Default: `EventBus.emit`. */
  emit?: (event: string, payload: unknown) => void;
  warn?: (message: string) => void;
  random?: () => number;
}

export interface StartOptions {
  /** Blocking events lock player input and exclude each other (only one at a time). Default true. */
  blocking?: boolean;
  /** `action` triggers: the entity turns towards this entity when the state asks for it (faceOnInteract). */
  faceTarget?: Entity;
}

export interface RunningEvent {
  entity: Entity;
  entityId: string;
  state: EventState;
  blocking: boolean;
  interpreter: EventInterpreter;
  /** Resolves when the run ended (completed, cancelled or errored). */
  done: Promise<RunResult>;
}

/**
 * Owns the event runtime state of one game: global switches/variables/inventory, the clock, the state
 * selector and the running interpreters. The TriggerSystem decides WHEN events start; this class
 * decides whether they may, builds their context and keeps the input lock.
 *
 * Rules:
 *  - one interpreter per entity at a time (an event cannot interrupt itself);
 *  - at most one BLOCKING interpreter at a time; it holds the `event` input lock until it ends;
 *  - parallel events are non-blocking;
 *  - `cancelAll` (map switch) cancels every interpreter and releases the lock immediately.
 */
export class EventRuntime {
  public readonly flags: GameFlags;
  public readonly inventory = new Inventory();
  public readonly clock = new GameClock();
  public readonly ops: WorldEntityOps;
  public readonly states: StateSelector;
  public readonly ui: EventUI;
  public readonly maps: MapService;
  public mapId = "";

  private readonly world: World;
  private readonly lockInput: (reason: string) => () => void;
  private readonly emitEvent: (event: string, payload: unknown) => void;
  private readonly warnFn: (message: string) => void;
  private readonly random: () => number;
  private readonly warned = new Set<string>();
  private readonly running = new Map<Entity, RunningEvent>();
  private readonly releases = new Map<RunningEvent, () => void>();
  private blockingRun: RunningEvent | null = null;
  private dirty = true;
  private readonly finishListeners = new Set<(run: RunningEvent, result: RunResult) => void>();
  private readonly disposers: Array<() => void> = [];

  constructor(options: EventRuntimeOptions) {
    this.world = options.world;
    this.ui = options.ui;
    this.maps = options.maps;
    this.lockInput = options.lockInput ?? ((reason) => gameState.lockInput(reason));
    this.emitEvent = options.emit ?? ((event, payload) => void EventBus.emit(event, payload));
    this.warnFn = options.warn ?? ((m) => console.warn(m));
    this.random = options.random ?? Math.random;
    this.flags = new GameFlags(options.database);
    this.ops = new WorldEntityOps(this.world, options.sprites, (m) => this.warn(m));
    this.states = new StateSelector({
      world: this.world,
      flags: this.flags,
      inventory: this.inventory,
      sprites: options.sprites,
      getMapId: () => this.mapId,
      warn: (m) => this.warn(m),
    });
    this.disposers.push(this.flags.subscribe(() => (this.dirty = true)));
    this.disposers.push(this.inventory.subscribe(() => (this.dirty = true)));
  }

  // ── logging ───────────────────────────────────────────────────────────────────────────────────

  public warn(message: string): void {
    this.warnFn(message);
  }

  public warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.warnFn(message);
  }

  // ── queries ───────────────────────────────────────────────────────────────────────────────────

  public get isBlocking(): boolean {
    return this.blockingRun !== null;
  }

  public isRunning(entity: Entity): boolean {
    return this.running.has(entity);
  }

  public getRunning(entity: Entity): RunningEvent | undefined {
    return this.running.get(entity);
  }

  public get runningCount(): number {
    return this.running.size;
  }

  public onFinished(listener: (run: RunningEvent, result: RunResult) => void): () => void {
    this.finishListeners.add(listener);
    return () => this.finishListeners.delete(listener);
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────────────────────────

  /** Called once per game update: advances event time and re-selects states after state changes. */
  public update(delta: number): void {
    this.clock.tick(delta);
    if (this.dirty) {
      this.dirty = false;
      this.states.refreshAll();
    }
  }

  /** A map was (re)built: events of the old one are gone, states are selected for the new entities. */
  public onMapLoaded(mapId: string): void {
    this.cancelAll();
    this.mapId = mapId;
    this.dirty = false;
    this.states.refreshAll();
  }

  /** Forces a state re-evaluation on the next update. */
  public markDirty(): void {
    this.dirty = true;
  }

  public start(entity: Entity, stateIndex: number, options: StartOptions = {}): RunningEvent | null {
    const blocking = options.blocking ?? true;
    const ev = this.world.getComponent(entity, EventComponent);
    const state = ev?.states[stateIndex];
    if (!ev || !state) return null;
    if (this.running.has(entity)) return null;
    if (blocking && this.blockingRun) return null;

    // faceOnInteract: only for solid entities (zones that are not solid do not turn to the player).
    if (options.faceTarget !== undefined && state.faceOnInteract) {
      const solid = this.world.getComponent(entity, ColliderComponent)?.isSolid ?? false;
      if (solid) this.ops.faceTowards(entity, options.faceTarget);
    }

    const entityId = this.world.getComponent(entity, EntityInfoComponent)?.editorId ?? `entity#${entity}`;
    const ctx = this.createContext(entity, entityId);
    const interpreter = new EventInterpreter(graphOf(state), ctx);

    const run: RunningEvent = { entity, entityId, state, blocking, interpreter, done: Promise.resolve("completed") };
    this.running.set(entity, run);
    if (blocking) {
      this.blockingRun = run;
      this.releases.set(run, this.lockInput("event"));
    }
    this.emitBus(Events.EVENT_STARTED, { entity: entityId, map: this.mapId, stateId: state.id, blocking });

    run.done = interpreter.run().then((result) => {
      this.finish(run, result);
      return result;
    });
    return run;
  }

  public cancel(entity: Entity): void {
    const run = this.running.get(entity);
    if (!run) return;
    run.interpreter.cancel();
    this.finish(run, "cancelled");
  }

  public cancelAll(): void {
    for (const run of [...this.running.values()]) {
      run.interpreter.cancel();
      this.finish(run, "cancelled");
    }
    this.clock.clear();
  }

  /** Stops everything and unsubscribes (scene shutdown). */
  public destroy(): void {
    this.cancelAll();
    this.finishListeners.clear();
    for (const d of this.disposers.splice(0)) d();
  }

  private finish(run: RunningEvent, result: RunResult): void {
    if (this.running.get(run.entity) !== run) return; // already finished (cancel + natural end)
    this.running.delete(run.entity);
    if (this.blockingRun === run) this.blockingRun = null;
    this.releases.get(run)?.();
    this.releases.delete(run);
    this.dirty = true;
    this.emitBus(Events.EVENT_ENDED, { entity: run.entityId, map: this.mapId, stateId: run.state.id, blocking: run.blocking, result });
    for (const l of [...this.finishListeners]) l(run, result);
  }

  private emitBus(event: string, payload: unknown): void {
    try {
      EventBus.emit(event, payload);
    } catch (err) {
      this.warn(`[Event] listener for ${event} threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private createContext(entity: Entity, entityId: string): EventContext {
    return {
      entity,
      entityId,
      getMapId: () => this.mapId,
      flags: this.flags,
      inventory: this.inventory,
      ui: this.ui,
      clock: this.clock,
      ops: this.ops,
      maps: this.maps,
      emit: (event, payload) => this.emitEvent(event, payload),
      warn: (m) => this.warn(m),
      warnOnce: (key, m) => this.warnOnce(key, m),
      random: this.random,
    };
  }
}
