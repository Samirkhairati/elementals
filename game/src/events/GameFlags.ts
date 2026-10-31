import type { GameDatabase, SelfSwitchKey, StageDef } from "@shared/engine/index.ts";
import { EventBus, Events } from "@/utils/EventBus";

export type FlagChange =
  | { kind: "switch"; id: string; value: boolean }
  | { kind: "variable"; id: string; value: number }
  /** `value` is the id of the stage value now current. */
  | { kind: "stage"; id: string; value: string }
  | { kind: "selfSwitch"; id: string; value: boolean }
  | { kind: "reset"; id: "" };

/** Serialisable snapshot (JSON-safe) for a future save system. */
export interface GameFlagsSnapshot {
  switches: Record<string, boolean>;
  variables: Record<string, number>;
  /** Stage id -> id of its current value. Missing in snapshots written before stages existed. */
  stages: Record<string, string>;
  /** Keys are `<mapId>/<entityId>/<key>` (key = a local flag name, classically A-D). */
  selfSwitches: Record<string, boolean>;
}

/** What GameFlags needs from the database. */
type FlagsDatabase = Pick<GameDatabase, "switches" | "variables"> & { stages?: StageDef[] };

export function selfSwitchKey(mapId: string, entityId: string, key: SelfSwitchKey): string {
  return `${mapId}/${entityId}/${key}`;
}

type Listener = (change: FlagChange) => void;

/**
 * Global event state: switches (booleans), variables (numbers), stages (progress through ordered named
 * values) and per-event local flags (self switches).
 *
 *  - initialised from the database manifest (switches false, variables and stages at their `initial`);
 *  - unknown ids are tolerated (switch false / variable 0 until set); a stage the database does not
 *    know has no value and ignores writes, as does an unknown value of a known stage;
 *  - every change notifies subscribers and emits `Events.FLAGS_CHANGED` on the EventBus;
 *    unchanged writes are silent;
 *  - self switches belong to `mapId/entityId` and survive map switches; `reset()` clears everything.
 */
export class GameFlags {
  private switches = new Map<string, boolean>();
  private variables = new Map<string, number>();
  private stages = new Map<string, string>();
  private selfSwitches = new Map<string, boolean>();
  private listeners = new Set<Listener>();
  private database: FlagsDatabase = { switches: [], variables: [], stages: [] };

  constructor(database?: FlagsDatabase) {
    this.reset(database, false);
  }

  /** Back to the initial values (of `database` when given, else of the last one used). */
  public reset(database?: FlagsDatabase, notify = true): void {
    if (database) this.database = database;
    this.switches.clear();
    this.variables.clear();
    this.stages.clear();
    this.selfSwitches.clear();
    for (const s of this.database.switches) this.switches.set(s.id, false);
    for (const v of this.database.variables) this.variables.set(v.id, v.initial);
    for (const st of this.database.stages ?? []) {
      const start = st.values.some((v) => v.id === st.initial) ? st.initial : st.values[0]?.id;
      if (start !== undefined) this.stages.set(st.id, start);
    }
    if (notify) this.emit({ kind: "reset", id: "" });
  }

  // ── stages ────────────────────────────────────────────────────────────────────────────────────

  private stageDef(id: string): StageDef | undefined {
    return this.database.stages?.find((s) => s.id === id);
  }

  public hasStage(id: string): boolean {
    return this.stageDef(id) !== undefined;
  }

  /** Id of the stage's current value; "" for an unknown stage. */
  public getStage(id: string): string {
    return this.stages.get(id) ?? "";
  }

  /** Position of the current value inside the stage's value list; -1 for an unknown stage. */
  public stageIndex(id: string): number {
    const def = this.stageDef(id);
    return def ? def.values.findIndex((v) => v.id === this.getStage(id)) : -1;
  }

  /** Position of `valueId` inside the stage, -1 when the stage or the value is unknown. */
  public stageValueIndex(id: string, valueId: string): number {
    return this.stageDef(id)?.values.findIndex((v) => v.id === valueId) ?? -1;
  }

  /** Moves the stage to `valueId`. Unknown stage or value: ignored, returns false. */
  public setStage(id: string, valueId: string): boolean {
    if (this.stageValueIndex(id, valueId) < 0) return false;
    if (this.getStage(id) === valueId) return true;
    this.stages.set(id, valueId);
    this.emit({ kind: "stage", id, value: valueId });
    return true;
  }

  /** Moves the stage to its next value (the last value stays last). Returns false for an unknown stage. */
  public advanceStage(id: string): boolean {
    const def = this.stageDef(id);
    if (!def) return false;
    const next = def.values[Math.min(this.stageIndex(id) + 1, def.values.length - 1)];
    return this.setStage(id, next.id);
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

  public toJSON(): GameFlagsSnapshot {
    return {
      switches: Object.fromEntries(this.switches),
      variables: Object.fromEntries(this.variables),
      stages: Object.fromEntries(this.stages),
      selfSwitches: Object.fromEntries(this.selfSwitches),
    };
  }

  /** Restores a snapshot (values for ids the database does not list are kept too). */
  public load(snapshot: Partial<GameFlagsSnapshot> | null | undefined): void {
    this.reset(undefined, false);
    for (const [k, v] of Object.entries(snapshot?.switches ?? {})) if (typeof v === "boolean") this.switches.set(k, v);
    for (const [k, v] of Object.entries(snapshot?.variables ?? {})) if (typeof v === "number" && Number.isFinite(v)) this.variables.set(k, v);
    // A saved value the database no longer has keeps the stage's initial value.
    for (const [k, v] of Object.entries(snapshot?.stages ?? {})) if (typeof v === "string" && this.stageValueIndex(k, v) >= 0) this.stages.set(k, v);
    for (const [k, v] of Object.entries(snapshot?.selfSwitches ?? {})) if (v === true) this.selfSwitches.set(k, true);
    this.emit({ kind: "reset", id: "" });
  }

  // ── notifications ─────────────────────────────────────────────────────────────────────────────

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(change: FlagChange): void {
    for (const l of [...this.listeners]) l(change);
    EventBus.emit(Events.FLAGS_CHANGED, change);
  }
}
