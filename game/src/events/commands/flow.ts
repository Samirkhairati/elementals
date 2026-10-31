import type { Condition } from "@shared/engine/index.ts";
import { registerCommandHandler } from "./registry";
import { num } from "./params";
import { evaluateConditions } from "../conditions";

/** conditional: port `then` when ALL conditions hold (an empty list holds), else port `else`. */
registerCommandHandler("conditional", (cmd, rt) => {
  const conditions = Array.isArray(cmd.params.conditions) ? (cmd.params.conditions as Condition[]) : [];
  const { ctx } = rt;
  const holds = evaluateConditions(conditions, {
    flags: ctx.flags,
    inventory: ctx.inventory,
    mapId: ctx.getMapId(),
    entityId: ctx.entityId,
  });
  return { port: holds ? "then" : "else" };
});

/** branchStage: follows the port named after the stage's current value when it is one of `cases`, else `default`. */
registerCommandHandler("branchStage", (cmd, rt) => {
  const cases = Array.isArray(cmd.params.cases) ? (cmd.params.cases as unknown[]) : [];
  const current = rt.ctx.flags.getStage(typeof cmd.params.id === "string" ? cmd.params.id : "");
  return { port: current !== "" && cases.includes(current) ? current : "default" };
});

// Loops are cycles in the graph (a wire back to an earlier node) and `exitEvent` is an `end` node, so
// `loop` / `breakLoop` / `exitEvent` have no handlers: `commandsToGraph` converts them. The interpreter
// yields a frame when too many nodes ran without waiting, so a fast cycle never freezes the game.

registerCommandHandler("wait", async (cmd, rt) => {
  const ms = Math.max(0, num(cmd.params, "ms", 0));
  await rt.guard(rt.ctx.clock.wait(ms, rt.signal));
});

registerCommandHandler("comment", () => {});
