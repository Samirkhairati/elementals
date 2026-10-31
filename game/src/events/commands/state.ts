import { SELF_SWITCH_KEYS, type SelfSwitchKey } from "@shared/engine/index.ts";
import { registerCommandHandler } from "./registry";
import { bool, num, str } from "./params";

registerCommandHandler("setSwitch", (cmd, rt) => {
  const id = str(cmd.params, "id");
  if (!id) {
    rt.ctx.warn("[Event] setSwitch without a switch; skipped");
    return;
  }
  if (!rt.ctx.flags.hasSwitch(id)) rt.ctx.warnOnce(`switch:${id}`, `[Event] switch "${id}" is not in the database`);
  rt.ctx.flags.setSwitch(id, bool(cmd.params, "value", true));
});

/**
 * setVariable: `set | add | sub | mul | div | mod` with a constant, another variable or a random integer
 * (inclusive `min`..`max`, swapped if reversed). `div` is an integer division (truncated towards zero) and
 * `div`/`mod` by zero leave the variable unchanged (with a warning).
 */
registerCommandHandler("setVariable", (cmd, rt) => {
  const { ctx } = rt;
  const p = cmd.params;
  const id = str(p, "id");
  if (!id) {
    ctx.warn("[Event] setVariable without a variable; skipped");
    return;
  }
  if (!ctx.flags.hasVariable(id)) ctx.warnOnce(`variable:${id}`, `[Event] variable "${id}" is not in the database`);

  let operand: number;
  switch (str(p, "operand", "const")) {
    case "variable":
      operand = ctx.flags.getVariable(str(p, "sourceId"));
      break;
    case "random": {
      let min = Math.trunc(num(p, "min", 0));
      let max = Math.trunc(num(p, "max", 10));
      if (min > max) [min, max] = [max, min];
      operand = min + Math.floor(ctx.random() * (max - min + 1));
      break;
    }
    default:
      operand = num(p, "value", 0);
  }

  const current = ctx.flags.getVariable(id);
  switch (str(p, "op", "set")) {
    case "add":
      ctx.flags.setVariable(id, current + operand);
      break;
    case "sub":
      ctx.flags.setVariable(id, current - operand);
      break;
    case "mul":
      ctx.flags.setVariable(id, current * operand);
      break;
    case "div":
      if (operand === 0) ctx.warn(`[Event] setVariable "${id}": division by zero ignored`);
      else ctx.flags.setVariable(id, Math.trunc(current / operand));
      break;
    case "mod":
      if (operand === 0) ctx.warn(`[Event] setVariable "${id}": modulo by zero ignored`);
      else ctx.flags.setVariable(id, current % operand);
      break;
    default:
      ctx.flags.setVariable(id, operand);
  }
});

/** setStage: `mode: "set"` moves the stage to `value` (a value id), `mode: "advance"` to its next value. */
registerCommandHandler("setStage", (cmd, rt) => {
  const { ctx } = rt;
  const id = str(cmd.params, "id");
  if (!id) {
    ctx.warn("[Event] setStage without a stage; skipped");
    return;
  }
  if (!ctx.flags.hasStage(id)) {
    ctx.warnOnce(`stage:${id}`, `[Event] stage "${id}" is not in the database; skipped`);
    return;
  }
  if (str(cmd.params, "mode", "set") === "advance") {
    ctx.flags.advanceStage(id);
    return;
  }
  const value = str(cmd.params, "value");
  if (!ctx.flags.setStage(id, value)) ctx.warn(`[Event] setStage: stage "${id}" has no value "${value}"; skipped`);
});

registerCommandHandler("setSelfSwitch", (cmd, rt) => {
  const key: SelfSwitchKey = str(cmd.params, "key", SELF_SWITCH_KEYS[0]).trim();
  if (!key) {
    rt.ctx.warn("[Event] setSelfSwitch without a name; skipped");
    return;
  }
  rt.ctx.flags.setSelfSwitch(rt.ctx.getMapId(), rt.ctx.entityId, key, bool(cmd.params, "value", true));
});

registerCommandHandler("giveItem", (cmd, rt) => {
  const item = str(cmd.params, "item");
  if (!item) return rt.ctx.warn("[Event] giveItem without an item; skipped");
  rt.ctx.inventory.add(item, Math.max(1, Math.trunc(num(cmd.params, "qty", 1))));
});

/** removeItem removes up to `qty` (never goes below 0). */
registerCommandHandler("removeItem", (cmd, rt) => {
  const item = str(cmd.params, "item");
  if (!item) return rt.ctx.warn("[Event] removeItem without an item; skipped");
  rt.ctx.inventory.remove(item, Math.max(1, Math.trunc(num(cmd.params, "qty", 1))));
});

registerCommandHandler("emit", (cmd, rt) => {
  const event = str(cmd.params, "event").trim();
  if (!event) return rt.ctx.warn("[Event] emit without an event name; skipped");
  rt.ctx.emit(event, { payload: str(cmd.params, "payload"), entity: rt.ctx.entityId, map: rt.ctx.getMapId() });
});
