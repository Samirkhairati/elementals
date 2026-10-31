import type { Condition } from "@shared/engine/index.ts";
import { registerCommandHandler } from "./registry";
import { num } from "./params";
import { evaluateConditions } from "../conditions";

/** conditional: `then` when ALL conditions hold (an empty list holds), else `else`. */
registerCommandHandler("conditional", (cmd, rt) => {
  const conditions = Array.isArray(cmd.params.conditions) ? (cmd.params.conditions as Condition[]) : [];
  const { ctx } = rt;
  const holds = evaluateConditions(conditions, {
    state: ctx.state,
    inventory: ctx.inventory,
    mapId: ctx.getMapId(),
    entityId: ctx.entityId,
  });
  return rt.runBranch(cmd, holds ? "then" : "else");
});

/**
 * loop: repeats `body` until `breakLoop` / `exitEvent`. The interpreter yields a frame when too many
 * commands ran without waiting, so an empty or fast loop never freezes the game.
 */
registerCommandHandler("loop", async (cmd, rt) => {
  rt.loopDepth++;
  try {
    for (;;) {
      const flow = await rt.runBranch(cmd, "body");
      if (flow === "exit") return "exit";
      if (flow === "break") return "next";
    }
  } finally {
    rt.loopDepth--;
  }
});

registerCommandHandler("breakLoop", (_cmd, rt) => {
  if (rt.loopDepth === 0) {
    rt.ctx.warn("[Event] breakLoop outside of a loop; ignored");
    return "next";
  }
  return "break";
});

registerCommandHandler("exitEvent", () => "exit");

registerCommandHandler("wait", async (cmd, rt) => {
  const ms = Math.max(0, num(cmd.params, "ms", 0));
  await rt.guard(rt.ctx.clock.wait(ms, rt.signal));
});

registerCommandHandler("comment", () => {});
