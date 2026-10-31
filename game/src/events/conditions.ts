import type { ComparisonOp, Condition } from "@shared/engine/index.ts";
import type { EventState } from "./EventState";
import type { Inventory } from "./Inventory";

/** What a condition can look at. `entityId` is the editor id of the event the condition belongs to. */
export interface ConditionContext {
  state: EventState;
  inventory: Inventory;
  mapId: string;
  entityId: string;
}

export function compareNumbers(a: number, op: ComparisonOp, b: number): boolean {
  switch (op) {
    case "==":
      return a === b;
    case "!=":
      return a !== b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    default:
      return false;
  }
}

/** One condition. Malformed conditions (unknown kind, bad operator) are false; nothing throws. */
export function evaluateCondition(condition: Condition, ctx: ConditionContext): boolean {
  switch (condition.kind) {
    case "switch":
      return ctx.state.getSwitch(condition.id) === condition.value;
    case "variable":
      return compareNumbers(ctx.state.getVariable(condition.id), condition.op, condition.value);
    case "selfSwitch":
      return ctx.state.getSelfSwitch(ctx.mapId, ctx.entityId, condition.key) === condition.value;
    case "hasItem":
      return ctx.inventory.get(condition.item) >= condition.qty;
    default:
      return false;
  }
}

/** Conditions are AND-ed; an empty list holds. */
export function evaluateConditions(conditions: readonly Condition[], ctx: ConditionContext): boolean {
  return conditions.every((c) => evaluateCondition(c, ctx));
}
