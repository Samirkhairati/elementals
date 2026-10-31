import { System } from "../System";
import type { World } from "../World";
import { PlayerControlComponent } from "../components/PlayerControlComponent";
import { GridMovementComponent } from "../components/GridMovementComponent";
import { FreeMovementComponent } from "../components/FreeMovementComponent";
import { MoveRouteComponent } from "../components/MoveRouteComponent";
import type { InputSnapshot } from "@/input/InputSnapshot";
import { gameState } from "@/core/GameState";
import { MovementType } from "@/utils/Direction";

export class InputSystem extends System {
  public priority = 200;
  private currentSnapshot: InputSnapshot | null = null;

  public setSnapshot(snapshot: InputSnapshot): void {
    this.currentSnapshot = snapshot;
  }

  public update(world: World, _delta: number): void {
    const controlledEntities = world.view(PlayerControlComponent);
    const isLocked = gameState.isInputLocked;

    for (const [entity, control] of controlledEntities) {
      control.isMovementLocked = isLocked;

      // A move route (cutscene) owns the player's movement; input is ignored while it runs.
      if (world.getComponent(entity, MoveRouteComponent)?.active) continue;

      const grid = world.getComponent(entity, GridMovementComponent);
      const free = world.getComponent(entity, FreeMovementComponent);

      if (isLocked || !this.currentSnapshot) {
        if (grid) {
          grid.pendingDirection = null;
        }
        if (free) {
          free.vx = 0;
          free.vy = 0;
        }
        continue;
      }

      const snapshot = this.currentSnapshot;

      if (grid) {
        grid.pendingDirection = snapshot.direction;
        grid.holdDuration = snapshot.holdDuration;
        grid.movementType = snapshot.isRunning && control.canRun ? MovementType.RUN : MovementType.WALK;
      }

      if (free) {
        free.vx = snapshot.vector.x;
        free.vy = snapshot.vector.y;
        free.isRunning = snapshot.isRunning && control.canRun;
        free.movementType = free.isRunning ? MovementType.RUN : MovementType.WALK;
        if (snapshot.direction) {
          free.direction = snapshot.direction;
        }
      }
    }
  }
}
