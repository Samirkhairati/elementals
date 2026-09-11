import { System } from "../System";
import type { World } from "../World";
import { AnimationComponent } from "../components/AnimationComponent";
import { GridMovementComponent } from "../components/GridMovementComponent";
import { FreeMovementComponent } from "../components/FreeMovementComponent";
import { settingsStore } from "@/core/SettingsStore";
import { gameState } from "@/core/GameState";

export class AnimationSystem extends System {
  public priority = 400;

  public update(world: World, _delta: number): void {
    const animEntities = world.view(AnimationComponent);
    const isTileBased = settingsStore.tileBasedMovement;
    const isLocked = gameState.isInputLocked;

    for (const [entity, anim] of animEntities) {
      if (isTileBased) {
        const grid = world.getComponent(entity, GridMovementComponent);
        if (grid) {
          anim.direction = grid.direction;
          anim.isMoving = grid.isMoving;
          anim.movementType = grid.movementType;
        }
      } else {
        const free = world.getComponent(entity, FreeMovementComponent);
        if (free) {
          anim.direction = free.direction;
          anim.isMoving = free.isMoving;
          anim.movementType = free.movementType;
        }
      }

      if (anim.isMoving && !isLocked) {
        anim.currentAnimKey = `${anim.characterKey}-${anim.movementType}-${anim.direction}`;
      } else {
        anim.currentAnimKey = `${anim.characterKey}-idle-${anim.direction}`;
      }
    }
  }
}
