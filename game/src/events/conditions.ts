import type { ComparisonOp, Condition } from "@shared/engine/index.ts";
import type { GameFlags } from "./GameFlags";
import type { Inventory } from "./Inventory";

/** What a condition can look at. `entityId` is the editor id of the event the condition belongs to. */
export interface ConditionContext {
  flags: GameFlags;
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
      return ctx.flags.getSwitch(condition.id) === condition.value;
    case "variable":
      return compareNumbers(ctx.flags.getVariable(condition.id), condition.op, condition.value);
    case "stage": {
      // Compared by the order of the stage's values; an unknown stage or value never holds.
      const current = ctx.flags.stageIndex(condition.id);
      const wanted = ctx.flags.stageValueIndex(condition.id, condition.value);
      return current >= 0 && wanted >= 0 && compareNumbers(current, condition.op, wanted);
    }
    case "selfSwitch":
      return ctx.flags.getSelfSwitch(ctx.mapId, ctx.entityId, condition.key) === condition.value;
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
