import { Direction, MovementType } from "@/utils/Direction";
import { settingsStore } from "@/core/SettingsStore";

export interface FreeMovementInit {
  speed?: number;
  direction?: Direction;
}

export class FreeMovementComponent {
  public vx: number = 0;
  public vy: number = 0;
  public isMoving: boolean = false;
  public isRunning: boolean = false;
  public direction: Direction;
  public movementType: MovementType = MovementType.WALK;
  public speed: number;

  constructor(init?: FreeMovementInit) {
    this.speed = init?.speed ?? settingsStore.movement.playerSpeed;
    this.direction = init?.direction ?? Direction.DOWN;
  }
}

export const FreeMovement = (props?: FreeMovementInit) => new FreeMovementComponent(props);
