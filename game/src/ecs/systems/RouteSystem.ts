import type { Facing } from "@shared/engine/index.ts";
import { System } from "../System";
import type { World } from "../World";
import type { Entity } from "../Entity";
import { GridMovementComponent } from "../components/GridMovementComponent";
import { MoveRouteComponent, type RouteRequest } from "../components/MoveRouteComponent";
import { Direction, MovementType } from "@/utils/Direction";
import { setEntityFacing } from "@/sprites/spriteState";

const OPPOSITE: Record<Facing, Facing> = { up: "down", down: "up", left: "right", right: "left" };

/**
 * Executes move routes (`moveRoute` event command) through the same intent mechanism as the player's
 * InputSystem and the wander AI: it writes `GridMovement.pendingDirection` / `holdDuration` and the
 * MovementSystem performs the step (collision, easing, animation all shared).
 *
 * One request per step cycle:
 *   idle -> (write intent) issued -> (MovementSystem consumed it next frame) moving -> next step
 * A step whose intent was not accepted (something in the way) is skipped and counted as blocked.
 * Zero-time steps (`turn`, `speed`) run back to back in the same frame; `wait` counts game time.
 *
 * Priority 260: after InputSystem (200) and AIWanderSystem (250), before MovementSystem (300).
 * The component stays on the entity while a route is queued; the AI and player input leave routed
 * entities alone and the movement system ignores the event input lock for them.
 */
export class RouteSystem extends System {
  public priority = 260;

  public update(world: World, delta: number): void {
    for (const [entity, route] of world.view(MoveRouteComponent)) {
      const grid = world.getComponent(entity, GridMovementComponent);
      if (!grid) {
        this.finishAll(route, false);
        world.removeComponent(entity, MoveRouteComponent);
        continue;
      }

      while (route.queue.length > 0) {
        const req = route.queue[0];
        if (!this.advance(world, entity, grid, req, delta)) break;
        route.queue.shift();
        req.resolve({ completed: true, blocked: req.blocked });
      }

      if (route.queue.length === 0) {
        grid.pendingDirection = null;
        grid.holdDuration = 0;
        world.removeComponent(entity, MoveRouteComponent);
      }
    }
  }

  public onEntityDestroyed(world: World, entity: Entity): void {
    const route = world.getComponent(entity, MoveRouteComponent);
    if (route) this.finishAll(route, false);
  }

  private finishAll(route: MoveRouteComponent, completed: boolean): void {
    const pending = route.queue.splice(0);
    for (const req of pending) req.resolve({ completed, blocked: req.blocked });
  }

  /** Returns true when the request has finished. */
  private advance(world: World, entity: Entity, grid: GridMovementComponent, req: RouteRequest, delta: number): boolean {
    // `delta` is consumed by the first waiting step of this frame only.
    let dt = delta;
    for (let guard = 0; guard < 1000; guard++) {
      if (req.phase === "issued") {
        // The MovementSystem ran after us last frame: the step started (isMoving) or was refused.
        grid.pendingDirection = null;
        grid.holdDuration = 0;
        if (grid.isMoving) {
          req.phase = "moving";
        } else {
          req.blocked++;
          req.index++;
          req.phase = "idle";
        }
        continue;
      }

      if (req.phase === "moving") {
        if (grid.isMoving) return false;
        req.index++;
        req.phase = "idle";
        continue;
      }

      if (req.phase === "waiting") {
        req.timer -= dt;
        dt = 0;
        if (req.timer > 0) return false;
        req.index++;
        req.phase = "idle";
        continue;
      }

      // idle: start the next step
      const step = req.steps[req.index];
      if (!step) return true;

      switch (step.type) {
        case "turn":
          setEntityFacing(world, entity, step.value as Facing);
          req.index++;
          break;
        case "speed":
          grid.speed = Number(step.value);
          req.index++;
          break;
        case "wait":
          req.timer = Number(step.value) || 0;
          req.phase = "waiting";
          break;
        default: {
          // A previous (non-route) step may still be finishing; wait for it.
          if (grid.isMoving) return false;
          const direction = this.directionOf(step.type, grid.direction);
          grid.movementType = MovementType.WALK;
          grid.pendingDirection = direction;
          grid.holdDuration = grid.moveThreshold + 1;
          req.phase = "issued";
          return false;
        }
      }
    }
    return false;
  }

  private directionOf(type: string, current: Facing): Direction {
    switch (type) {
      case "up":
        return Direction.UP;
      case "down":
        return Direction.DOWN;
      case "left":
        return Direction.LEFT;
      case "right":
        return Direction.RIGHT;
      case "back":
        return OPPOSITE[current];
      default:
        return current; // forward
    }
  }
}
