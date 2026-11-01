import type { CommandTarget, CommonEvent, Facing, GraphNode, RouteStep } from "@shared/engine/index.ts";
import type { Entity } from "@/ecs/Entity";
import type { GameFlags } from "./GameFlags";
import type { Inventory } from "./Inventory";

/**
 * What a command handler tells the interpreter to do next:
 *  - nothing: follow the node's `next` wire;
 *  - `{ port }`: follow that output port (`conditional` -> then/else, `showChoices` -> an option id);
 *  - `"end"`: stop the run successfully.
 * A port with no wire ends the run, like the end of a command list.
 */
export type NodeResult = void | { port: string } | "end";

export interface ChoicesRequest {
  options: string[];
  /** The player may press the cancel key / tap outside to dismiss the menu. */
  allowCancel: boolean;
}

/** Screen-facing services (dialogue box, choice menu, fades). Every call must settle when `signal` aborts. */
export interface EventUI {
  /** Resolves when the player dismissed the text. */
  showText(request: { speaker: string; text: string }, signal: AbortSignal): Promise<void>;
  /** Resolves with the chosen option index, or -1 when cancelled. */
  showChoices(request: ChoicesRequest, signal: AbortSignal): Promise<number>;
  fadeScreen(mode: "in" | "out", ms: number, signal: AbortSignal): Promise<void>;
  shakeScreen(power: number, ms: number, signal: AbortSignal): Promise<void>;
}

/** Time source driven by the game loop (so events pause and test deterministically). */
export interface EventClock {
  /** Resolves after `ms` of game time. */
  wait(ms: number, signal: AbortSignal): Promise<void>;
  /** Resolves on the next update. */
  nextFrame(signal: AbortSignal): Promise<void>;
}

export interface RouteOutcome {
  completed: boolean;
  blocked: number;
}

/** Entity-facing services the commands act through. */
export interface EntityOps {
  /** Entity for a target, or undefined when it does not exist (anymore). */
  resolve(target: CommandTarget, self: Entity): Entity | undefined;
  setFacing(entity: Entity, facing: Facing): void;
  /** Turns `entity` towards `other`; false when positions are unknown. */
  faceTowards(entity: Entity, other: Entity): boolean;
  /** Runs the route; resolves when it ended. With `signal` aborting the route is cancelled. */
  moveRoute(entity: Entity, steps: RouteStep[], signal?: AbortSignal): Promise<RouteOutcome>;
  setVisible(entity: Entity, visible: boolean): boolean;
  /** false (with a warning issued by the implementation) when the asset is unknown. */
  changeSprite(entity: Entity, asset: string, animation: string): boolean;
  /** false when the entity has no such animation. */
  playAnimation(entity: Entity, animation: string): boolean;
}

export interface WarpRequest {
  map: string;
  /** Tile coordinates. */
  x: number;
  y: number;
  facing?: Facing;
  fade: boolean;
}

export interface MapService {
  hasMap(mapId: string): boolean;
  /** Moves the player. A different map is loaded (which cancels the running events). */
  warp(request: WarpRequest): Promise<void>;
}

/** Everything a running event can touch. Built by the EventRuntime; faked in tests. */
export interface EventContext {
  /** The event's own entity. */
  entity: Entity;
  /** Editor id of the event's entity (self switch owner). */
  entityId: string;
  /** Current map id (re-read on every command; a warp changes it). */
  getMapId(): string;
  flags: GameFlags;
  inventory: Inventory;
  ui: EventUI;
  clock: EventClock;
  ops: EntityOps;
  maps: MapService;
  /** Fires a custom EventBus event. */
  emit(event: string, payload: unknown): void;
  warn(message: string): void;
  /** Logs `message` only the first time `key` is seen (per runtime). */
  warnOnce(key: string, message: string): void;
  /** Random number in [0, 1). */
  random(): number;
  /** Common event for `callCommonEvent`; without it every call is skipped with a warning. */
  getCommonEvent?(id: string): CommonEvent | undefined;
}

export interface CommandRuntime {
  ctx: EventContext;
  signal: AbortSignal;
  /** Awaits `promise` but rejects with CancelledError as soon as the event is cancelled. */
  guard<T>(promise: Promise<T>): Promise<T>;
}

export type CommandHandler = (node: GraphNode, rt: CommandRuntime) => NodeResult | Promise<NodeResult>;

export class CancelledError extends Error {
  constructor() {
    super("event cancelled");
    this.name = "CancelledError";
  }
}
