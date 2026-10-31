import { characterAnimKey } from "@shared/engine/index.ts";
import { System } from "../System";
import type { World } from "../World";
import { AnimationComponent } from "../components/AnimationComponent";
import { GridMovementComponent } from "../components/GridMovementComponent";
import { FreeMovementComponent } from "../components/FreeMovementComponent";
import { MoveRouteComponent } from "../components/MoveRouteComponent";
import { MovementType } from "@/utils/Direction";
import { settingsStore } from "@/core/SettingsStore";

/**
 * Chooses the animation of every `character` sprite: idle / walk / run of the current facing
 * (`sprite:<asset>:<phase>-<facing>`), from the movement component that actually moves the entity
 * (grid in tile mode or while a move route runs, free movement otherwise).
 */
export class AnimationSystem extends System {
  public priority = 400;

  public update(world: World, _delta: number): void {
    const isTileBased = settingsStore.tileBasedMovement;

    for (const [entity, anim] of world.view(AnimationComponent)) {
      const grid = world.getComponent(entity, GridMovementComponent);
      const free = world.getComponent(entity, FreeMovementComponent);
      const routed = world.getComponent(entity, MoveRouteComponent)?.active ?? false;

      const useGrid = !!grid && (isTileBased || routed || !free);
      if (useGrid && grid) {
        anim.direction = grid.direction;
        // Between two steps of a route the entity is still walking.
        anim.isMoving = grid.isMoving || routed;
        anim.movementType = grid.movementType;
      } else if (free) {
        anim.direction = free.direction;
        anim.isMoving = free.isMoving;
        anim.movementType = free.movementType;
      }

      let phase: "idle" | "walk" | "run";
      if (anim.forcedPhase) phase = anim.forcedPhase === "run" && !anim.hasRun ? "walk" : anim.forcedPhase;
      else if (anim.isMoving) phase = anim.movementType === MovementType.RUN && anim.hasRun ? "run" : "walk";
      else phase = "idle";

      anim.currentAnimKey = characterAnimKey(anim.assetId, phase, anim.direction);
    }
  }
}
