import type { RouteStep } from "@shared/engine/index.ts";

export interface RouteResult {
  /** True when every step was processed (blocked steps are skipped, not failures). */
  completed: boolean;
  /** Steps that could not be taken because something was in the way. */
  blocked: number;
}

/** One queued route. The RouteSystem walks `steps` and calls `resolve` at the end (or on cancel). */
export interface RouteRequest {
  steps: RouteStep[];
  index: number;
  /** idle: nothing issued; issued: a move intent was written; moving: the step is in progress; waiting: `wait` step. */
  phase: "idle" | "issued" | "moving" | "waiting";
  /** Remaining ms of a `wait` step. */
  timer: number;
  blocked: number;
  /** Speed (px/s) to restore after the route when a `speed` step changed it. */
  savedSpeed?: number;
  resolve: (result: RouteResult) => void;
}

/**
 * Pending move routes of an entity. Routes use the same movement intent mechanism as the player
 * input and the wander AI (GridMovement.pendingDirection); this component only carries the script.
 */
export class MoveRouteComponent {
  public queue: RouteRequest[] = [];

  public get active(): boolean {
    return this.queue.length > 0;
  }
}
