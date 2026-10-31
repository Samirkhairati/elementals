import { COMMAND_CATALOG, type Command } from "@shared/engine/index.ts";
import { CancelledError, type CommandRuntime, type EventContext, type Flow } from "./types";
import { COMMAND_HANDLERS } from "./commands";

export type RunResult = "completed" | "cancelled" | "error";

/** After this many commands without a real frame boundary the interpreter yields one frame. */
export const YIELD_EVERY_COMMANDS = 2000;

/**
 * Runs one command tree (an event state's `commands`).
 *
 *  - async: commands that wait (text, choices, wait, routes, fades) just `await`; time and input come
 *    from the injected services, so the interpreter itself has no Phaser or timer dependency;
 *  - nested: `conditional`, `showChoices` and `loop` run their branch lists through `runBranch`;
 *  - cancellable: `cancel()` aborts the signal handed to every service, rejects every pending wait and
 *    stops before the next command. `run()` never rejects; it resolves with how the run ended;
 *  - robust: a handler that throws is logged and skipped, planned/unknown commands warn once and are
 *    skipped, and long command streaks yield a frame so a bare `loop` cannot freeze the state.
 */
export class EventInterpreter {
  private readonly controller = new AbortController();
  private sinceYield = 0;
  private startedAt: Promise<RunResult> | null = null;
  private result: RunResult | null = null;

  private readonly rt: CommandRuntime;
  public readonly commands: readonly Command[];
  public readonly ctx: EventContext;

  constructor(commands: readonly Command[], ctx: EventContext) {
    this.commands = commands;
    this.ctx = ctx;
    this.rt = {
      ctx,
      signal: this.controller.signal,
      guard: (promise) => this.guard(promise),
      runBranch: (command, branchId) => this.runList(command.branches?.[branchId] ?? []),
      loopDepth: 0,
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
      await this.runList(this.commands);
      this.result = "completed";
    } catch (err) {
      if (err instanceof CancelledError || this.controller.signal.aborted) this.result = "cancelled";
      else {
        this.ctx.warn(`[Event] event stopped by an error: ${err instanceof Error ? err.message : String(err)}`);
        this.result = "error";
      }
    }
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

  private async runList(list: readonly Command[]): Promise<Flow> {
    // Entering a list counts as a command too, so a loop with an empty body still reaches the yield below.
    if (list.length === 0) await this.tick();
    for (const command of list) {
      if (this.controller.signal.aborted) throw new CancelledError();

      await this.tick();

      const flow = await this.runCommand(command);
      if (flow !== "next") return flow;
    }
    return "next";
  }

  /** Counts a command; after too many in a row the interpreter waits for the next frame. */
  private async tick(): Promise<void> {
    if (this.controller.signal.aborted) throw new CancelledError();
    if (++this.sinceYield > YIELD_EVERY_COMMANDS) {
      this.sinceYield = 0;
      await this.guard(this.ctx.clock.nextFrame(this.controller.signal));
    }
  }

  private async runCommand(command: Command): Promise<Flow> {
    const handler = COMMAND_HANDLERS.get(command.type);
    if (!handler) {
      const def = COMMAND_CATALOG[command.type];
      if (def?.status === "planned") {
        this.ctx.warnOnce(`planned:${command.type}`, `[Event] "${command.type}" is not implemented yet; skipped`);
      } else {
        this.ctx.warnOnce(`unknown:${command.type}`, `[Event] unknown command "${command.type}"; skipped`);
      }
      return "next";
    }

    try {
      const flow = await handler(command, this.rt);
      return flow ?? "next";
    } catch (err) {
      if (err instanceof CancelledError || this.controller.signal.aborted) throw err;
      this.ctx.warn(`[Event] command "${command.type}" failed: ${err instanceof Error ? err.message : String(err)}`);
      return "next";
    }
  }
}
