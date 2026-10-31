import { SELF_SWITCH_KEYS, type SelfSwitchKey } from "@shared/engine/index.ts";
import { registerCommandHandler } from "./registry";
import { bool, num, str } from "./params";

registerCommandHandler("setSwitch", (cmd, rt) => {
  const id = str(cmd.params, "id");
  if (!id) {
    rt.ctx.warn("[Event] setSwitch without a switch; skipped");
    return;
  }
  if (!rt.ctx.state.hasSwitch(id)) rt.ctx.warnOnce(`switch:${id}`, `[Event] switch "${id}" is not in the database`);
  rt.ctx.state.setSwitch(id, bool(cmd.params, "value", true));
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
  if (!ctx.state.hasVariable(id)) ctx.warnOnce(`variable:${id}`, `[Event] variable "${id}" is not in the database`);

  let operand: number;
  switch (str(p, "operand", "const")) {
    case "variable":
      operand = ctx.state.getVariable(str(p, "sourceId"));
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

  const current = ctx.state.getVariable(id);
  switch (str(p, "op", "set")) {
    case "add":
      ctx.state.setVariable(id, current + operand);
      break;
    case "sub":
      ctx.state.setVariable(id, current - operand);
      break;
    case "mul":
      ctx.state.setVariable(id, current * operand);
      break;
    case "div":
      if (operand === 0) ctx.warn(`[Event] setVariable "${id}": division by zero ignored`);
      else ctx.state.setVariable(id, Math.trunc(current / operand));
      break;
    case "mod":
      if (operand === 0) ctx.warn(`[Event] setVariable "${id}": modulo by zero ignored`);
      else ctx.state.setVariable(id, current % operand);
      break;
    default:
      ctx.state.setVariable(id, operand);
  }
});

registerCommandHandler("setSelfSwitch", (cmd, rt) => {
  const key = str(cmd.params, "key", "A") as SelfSwitchKey;
  if (!(SELF_SWITCH_KEYS as readonly string[]).includes(key)) {
    rt.ctx.warn(`[Event] setSelfSwitch: unknown self switch "${key}"; skipped`);
    return;
  }
  rt.ctx.state.setSelfSwitch(rt.ctx.getMapId(), rt.ctx.entityId, key, bool(cmd.params, "value", true));
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
