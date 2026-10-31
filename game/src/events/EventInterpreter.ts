import {
  COMMAND_CATALOG,
  GRAPH_END,
  GRAPH_JUNCTION,
  GRAPH_START,
  NEXT_PORT,
  type EventGraph,
  type GraphNode,
} from "@shared/engine/index.ts";
import { CancelledError, type CommandRuntime, type EventContext, type NodeResult } from "./types";
import { COMMAND_HANDLERS } from "./commands";

export type RunResult = "completed" | "cancelled" | "error";

/** After this many nodes without a real frame boundary the interpreter yields one frame. */
export const YIELD_EVERY_COMMANDS = 2000;

/**
 * Runs one event graph (see docs/event-graph-spec.md): a single cursor walks from the `start` node along
 * the wires; a node's handler decides which output port to follow, a port with no wire ends the run.
 *
 *  - async: commands that wait (text, choices, wait, routes, fades) just `await`; time and input come
 *    from the injected services, so the interpreter itself has no Phaser or timer dependency;
 *  - structural nodes (`start`, `junction`, `end`) are handled here, everything else by its command handler;
 *  - cancellable: `cancel()` aborts the signal handed to every service, rejects every pending wait and
 *    stops before the next node. `run()` never rejects; it resolves with how the run ended;
 *  - robust: a handler that throws is logged and the run follows `next`, planned/unknown commands warn
 *    once and are skipped, and long streaks of nodes yield a frame so a cycle that never waits (which
 *    validation rejects) cannot freeze the page;
 *  - observable: `currentNodeId` is the node being run (null before the start and after the end).
 */
export class EventInterpreter {
  private readonly controller = new AbortController();
  private sinceYield = 0;
  private startedAt: Promise<RunResult> | null = null;
  private result: RunResult | null = null;
  private current: string | null = null;
  private readonly nodes: Map<string, GraphNode>;

  private readonly rt: CommandRuntime;
  public readonly graph: EventGraph;
  public readonly ctx: EventContext;

  constructor(graph: EventGraph, ctx: EventContext) {
    this.graph = graph;
    this.ctx = ctx;
    this.nodes = new Map(graph.nodes.map((n) => [n.id, n]));
    this.rt = {
      ctx,
      signal: this.controller.signal,
      guard: (promise) => this.guard(promise),
    };
  }

  public get signal(): AbortSignal {
    return this.controller.signal;
  }

  public get finished(): boolean {
    return this.result !== null;
  }

  public get outcome(): RunResult | null {
    return this.result;
  }

  /** Id of the node being run right now, null before the run starts and after it ends. */
  public get currentNodeId(): string | null {
    return this.current;
  }

  /** Starts the run (once; later calls return the same promise). */
  public run(): Promise<RunResult> {
    if (!this.startedAt) this.startedAt = this.execute();
    return this.startedAt;
  }

  public cancel(): void {
    if (!this.controller.signal.aborted) this.controller.abort();
  }

  private async execute(): Promise<RunResult> {
    try {
      await this.walk();
      this.result = "completed";
    } catch (err) {
      if (err instanceof CancelledError || this.controller.signal.aborted) this.result = "cancelled";
      else {
        this.ctx.warn(`[Event] event stopped by an error: ${err instanceof Error ? err.message : String(err)}`);
        this.result = "error";
      }
    }
    this.current = null;
    return this.result;
  }

  private guard<T>(promise: Promise<T>): Promise<T> {
    const signal = this.controller.signal;
    if (signal.aborted) {
      promise.catch(() => {});
      return Promise.reject(new CancelledError());
    }
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(new CancelledError());
      signal.addEventListener("abort", onAbort, { once: true });
      promise.then(
        (v) => {
          signal.removeEventListener("abort", onAbort);
          resolve(v);
        },
        (e) => {
          signal.removeEventListener("abort", onAbort);
          reject(e);
        },
      );
    });
  }

  private async walk(): Promise<void> {
    const start = this.graph.nodes.find((n) => n.type === GRAPH_START);
    if (!start) {
      this.ctx.warnOnce("graph:no-start", "[Event] graph has no start node; nothing to run");
      return;
    }

    let cursor: string | undefined = start.out[NEXT_PORT];
    while (cursor !== undefined) {
      if (this.controller.signal.aborted) throw new CancelledError();

      const node = this.nodes.get(cursor);
      if (!node) {
        this.ctx.warnOnce(`graph:missing:${cursor}`, `[Event] wire leads to missing node "${cursor}"; run ended`);
        return;
      }
      this.current = node.id;
      await this.tick();

      const result = await this.runNode(node);
      if (result === "end") return;
      cursor = node.out[result ? result.port : NEXT_PORT];
    }
  }

  /** Counts a node; after too many in a row the interpreter waits for the next frame. */
  private async tick(): Promise<void> {
    if (this.controller.signal.aborted) throw new CancelledError();
    if (++this.sinceYield > YIELD_EVERY_COMMANDS) {
      this.sinceYield = 0;
      await this.guard(this.ctx.clock.nextFrame(this.controller.signal));
    }
  }

  private async runNode(node: GraphNode): Promise<NodeResult> {
    switch (node.type) {
      case GRAPH_END:
        return "end";
      case GRAPH_JUNCTION:
      case GRAPH_START:
        return;
    }

    const handler = COMMAND_HANDLERS.get(node.type);
    if (!handler) {
      const def = COMMAND_CATALOG[node.type];
      if (def?.status === "planned") {
        this.ctx.warnOnce(`planned:${node.type}`, `[Event] "${node.type}" is not implemented yet; skipped`);
      } else {
        this.ctx.warnOnce(`unknown:${node.type}`, `[Event] unknown command "${node.type}"; skipped`);
      }
      return;
    }

    try {
      return await handler(node, this.rt);
    } catch (err) {
      if (err instanceof CancelledError || this.controller.signal.aborted) throw err;
      this.ctx.warn(`[Event] command "${node.type}" failed: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
  }
}
