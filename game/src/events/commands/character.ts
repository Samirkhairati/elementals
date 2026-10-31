import { ROUTE_STEP_TYPES, isFacing, type RouteStep } from "@shared/engine/index.ts";
import type { Entity } from "@/ecs/Entity";
import type { CommandRuntime } from "../types";
import { registerCommandHandler } from "./registry";
import type { AfterClip } from "@/ecs/components/AnimatorComponent";
import type { AppearancePersist } from "../AppearanceOverrides";
import { bool, facing, num, str, target, type Params } from "./params";

/** Resolves `params[key]` to an entity; warns (once per command) and returns undefined when it does not exist. */
function resolveTarget(p: Params, key: string, rt: CommandRuntime, commandType: string): Entity | undefined {
  const t = target(p, key);
  if (t === null) {
    rt.ctx.warn(`[Event] ${commandType}: invalid ${key}; skipped`);
    return undefined;
  }
  const entity = rt.ctx.ops.resolve(t, rt.ctx.entity);
  if (entity === undefined) {
    const label = typeof t === "string" ? t : `entity ${t.entity}`;
    rt.ctx.warnOnce(`target:${commandType}:${label}`, `[Event] ${commandType}: ${label} not found; skipped`);
  }
  return entity;
}

registerCommandHandler("setFacing", (cmd, rt) => {
  const dir = facing(cmd.params, "facing");
  if (!dir) return rt.ctx.warn("[Event] setFacing without a direction; skipped");
  const entity = resolveTarget(cmd.params, "target", rt, "setFacing");
  if (entity !== undefined) rt.ctx.ops.setFacing(entity, dir);
});

registerCommandHandler("faceTowards", (cmd, rt) => {
  const entity = resolveTarget(cmd.params, "target", rt, "faceTowards");
  const other = resolveTarget(cmd.params, "other", rt, "faceTowards");
  if (entity !== undefined && other !== undefined) rt.ctx.ops.faceTowards(entity, other);
});

/** Keeps valid steps only (unknown types, `turn` without a direction, `speed` <= 0 are dropped). */
export function normalizeRouteSteps(raw: unknown): RouteStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: RouteStep[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") continue;
    const type = (s as { type?: unknown }).type;
    const value = (s as { value?: unknown }).value;
    if (typeof type !== "string" || !(ROUTE_STEP_TYPES as readonly string[]).includes(type)) continue;
    const t = type as RouteStep["type"];
    if (t === "turn") {
      if (isFacing(value)) steps.push({ type: t, value });
    } else if (t === "wait") {
      const ms = typeof value === "number" ? value : Number(value);
      steps.push({ type: t, value: Number.isFinite(ms) ? Math.max(0, ms) : 0 });
    } else if (t === "speed") {
      const v = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(v) && v > 0) steps.push({ type: t, value: v });
    } else {
      steps.push({ type: t });
    }
  }
  return steps;
}

/**
 * moveRoute: walks the steps with the target's normal movement (collision applies; a blocked step is
 * skipped). `wait` (default true) makes the event wait until the route ended; with `wait: false` the
 * route keeps running on its own even after the event finished.
 */
registerCommandHandler("moveRoute", async (cmd, rt) => {
  const entity = resolveTarget(cmd.params, "target", rt, "moveRoute");
  if (entity === undefined) return;
  const steps = normalizeRouteSteps(cmd.params.steps);
  if (steps.length === 0) return;
  if (bool(cmd.params, "wait", true)) {
    await rt.guard(rt.ctx.ops.moveRoute(entity, steps, rt.signal));
  } else {
    void rt.ctx.ops.moveRoute(entity, steps);
  }
});

registerCommandHandler("setVisible", (cmd, rt) => {
  const entity = resolveTarget(cmd.params, "target", rt, "setVisible");
  if (entity !== undefined) rt.ctx.ops.setVisible(entity, bool(cmd.params, "visible", true));
});

const PERSISTS: readonly AppearancePersist[] = ["state", "map", "forever"];

registerCommandHandler("changeSprite", (node, rt) => {
  const asset = str(node.params, "asset");
  if (!asset) return rt.ctx.warn("[Event] changeSprite without a sprite; skipped");
  const entity = resolveTarget(node.params, "target", rt, "changeSprite");
  if (entity === undefined) return;
  const persist = PERSISTS.find((p) => p === node.params.persist) ?? "state";
  rt.ctx.ops.changeSprite(entity, asset, str(node.params, "animation"), persist);
});

const AFTER: readonly AfterClip[] = ["auto", "hold", "loop"];

/**
 * playAnimation: plays a clip of the target's character. `speed` multiplies its speed for this play;
 * `wait` pauses the event until a non-looping clip ended; `then` says what follows (return to automatic,
 * stay on the last frame, repeat). A node saved before `then` existed keeps the old behaviour (hold).
 */
registerCommandHandler("playAnimation", async (node, rt) => {
  const animation = str(node.params, "animation");
  if (!animation) return rt.ctx.warn("[Event] playAnimation without an animation; skipped");
  const entity = resolveTarget(node.params, "target", rt, "playAnimation");
  if (entity === undefined) return;
  const speed = num(node.params, "speed", 1);
  const then = AFTER.find((a) => a === node.params.then) ?? "hold";
  const handle = rt.ctx.ops.playAnimation(entity, animation, { speed: speed < 0 ? 1 : speed, then });
  if (!handle) {
    rt.ctx.warnOnce(`anim:${animation}`, `[Event] playAnimation: the sprite has no animation "${animation}"`);
    return;
  }
  if (!bool(node.params, "wait", false)) return;
  if (handle.done === null) {
    rt.ctx.warnOnce(`anim-wait:${animation}`, `[Event] playAnimation: "${animation}" loops, so waiting for it would never finish; continuing`);
    return;
  }
  await rt.guard(handle.done);
});

registerCommandHandler("stopAnimation", (node, rt) => {
  const entity = resolveTarget(node.params, "target", rt, "stopAnimation");
  if (entity !== undefined) rt.ctx.ops.stopAnimation(entity);
});

registerCommandHandler("setAnimationSpeed", (node, rt) => {
  const entity = resolveTarget(node.params, "target", rt, "setAnimationSpeed");
  if (entity === undefined) return;
  const clip = str(node.params, "clip").trim();
  rt.ctx.ops.setAnimationSpeed(entity, {
    value: num(node.params, "value", 1),
    mode: node.params.mode === "fps" ? "fps" : "scale",
    ...(clip ? { clip } : {}),
  });
});

registerCommandHandler("setMoveSpeed", (node, rt) => {
  const entity = resolveTarget(node.params, "target", rt, "setMoveSpeed");
  if (entity === undefined) return;
  const speed = num(node.params, "speed", 0);
  if (!(speed > 0)) return rt.ctx.warn("[Event] setMoveSpeed needs a speed above 0; skipped");
  if (!rt.ctx.ops.setMoveSpeed(entity, speed)) rt.ctx.warnOnce("move-speed:none", "[Event] setMoveSpeed: the target cannot move; skipped");
});
