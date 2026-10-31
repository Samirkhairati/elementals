import type { GameDatabase, SelfSwitchKey } from "@shared/engine/index.ts";
import { EventBus, Events } from "@/utils/EventBus";

export type StateChange =
  | { kind: "switch"; id: string; value: boolean }
  | { kind: "variable"; id: string; value: number }
  | { kind: "selfSwitch"; id: string; value: boolean }
  | { kind: "reset"; id: "" };

/** Serialisable snapshot (JSON-safe) for a future save system. */
export interface EventStateSnapshot {
  switches: Record<string, boolean>;
  variables: Record<string, number>;
  /** Keys are `<mapId>/<entityId>/<A-D>`. */
  selfSwitches: Record<string, boolean>;
}

export function selfSwitchKey(mapId: string, entityId: string, key: SelfSwitchKey): string {
  return `${mapId}/${entityId}/${key}`;
}

type Listener = (change: StateChange) => void;

/**
 * Global event state: switches (booleans), variables (numbers) and per-event self switches A-D.
 *
 *  - initialised from the database manifest (switches false, variables `initial`);
 *  - unknown ids are tolerated (switch false / variable 0 until set);
 *  - every change notifies subscribers and emits `Events.EVENT_STATE_CHANGED` on the EventBus;
 *    unchanged writes are silent;
 *  - self switches belong to `mapId/entityId` and survive map switches; `reset()` clears everything.
 */
export class EventState {
  private switches = new Map<string, boolean>();
  private variables = new Map<string, number>();
  private selfSwitches = new Map<string, boolean>();
  private listeners = new Set<Listener>();
  private database: Pick<GameDatabase, "switches" | "variables"> = { switches: [], variables: [] };

  constructor(database?: Pick<GameDatabase, "switches" | "variables">) {
    this.reset(database, false);
  }

  /** Back to the initial values (of `database` when given, else of the last one used). */
  public reset(database?: Pick<GameDatabase, "switches" | "variables">, notify = true): void {
    if (database) this.database = database;
    this.switches.clear();
    this.variables.clear();
    this.selfSwitches.clear();
    for (const s of this.database.switches) this.switches.set(s.id, false);
    for (const v of this.database.variables) this.variables.set(v.id, v.initial);
    if (notify) this.emit({ kind: "reset", id: "" });
  }

  // ── global switches / variables ───────────────────────────────────────────────────────────────

  public getSwitch(id: string): boolean {
    return this.switches.get(id) ?? false;
  }

  public setSwitch(id: string, value: boolean): void {
    if (this.getSwitch(id) === value) return;
    this.switches.set(id, value);
    this.emit({ kind: "switch", id, value });
  }

  public getVariable(id: string): number {
    return this.variables.get(id) ?? 0;
  }

  public setVariable(id: string, value: number): void {
    if (!Number.isFinite(value)) return;
    if (this.getVariable(id) === value) return;
    this.variables.set(id, value);
    this.emit({ kind: "variable", id, value });
  }

  public hasSwitch(id: string): boolean {
    return this.switches.has(id);
  }

  public hasVariable(id: string): boolean {
    return this.variables.has(id);
  }

  // ── self switches ─────────────────────────────────────────────────────────────────────────────

  public getSelfSwitch(mapId: string, entityId: string, key: SelfSwitchKey): boolean {
    return this.selfSwitches.get(selfSwitchKey(mapId, entityId, key)) ?? false;
  }

  public setSelfSwitch(mapId: string, entityId: string, key: SelfSwitchKey, value: boolean): void {
    const k = selfSwitchKey(mapId, entityId, key);
    if (this.getSelfSwitch(mapId, entityId, key) === value) return;
    if (value) this.selfSwitches.set(k, true);
    else this.selfSwitches.delete(k);
    this.emit({ kind: "selfSwitch", id: k, value });
  }

  // ── persistence ───────────────────────────────────────────────────────────────────────────────

  public toJSON(): EventStateSnapshot {
    return {
      switches: Object.fromEntries(this.switches),
      variables: Object.fromEntries(this.variables),
      selfSwitches: Object.fromEntries(this.selfSwitches),
    };
  }

  /** Restores a snapshot (values for ids the database does not list are kept too). */
  public load(snapshot: Partial<EventStateSnapshot> | null | undefined): void {
    this.reset(undefined, false);
    for (const [k, v] of Object.entries(snapshot?.switches ?? {})) if (typeof v === "boolean") this.switches.set(k, v);
    for (const [k, v] of Object.entries(snapshot?.variables ?? {})) if (typeof v === "number" && Number.isFinite(v)) this.variables.set(k, v);
    for (const [k, v] of Object.entries(snapshot?.selfSwitches ?? {})) if (v === true) this.selfSwitches.set(k, true);
    this.emit({ kind: "reset", id: "" });
  }

  // ── notifications ─────────────────────────────────────────────────────────────────────────────

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(change: StateChange): void {
    for (const l of [...this.listeners]) l(change);
    EventBus.emit(Events.EVENT_STATE_CHANGED, change);
  }
}
