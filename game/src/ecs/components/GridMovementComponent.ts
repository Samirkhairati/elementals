import { Direction, MovementType } from "@/utils/AnimationManager";
import { GAME_CONSTANTS } from "@/constants/game";

export interface GridMovementInit {
  speed?: number;
  direction?: Direction;
}

export class GridMovementComponent {
  public isMoving: boolean = false;
  public direction: Direction;
  public pendingDirection: Direction | null = null;
  public startX: number = 0;
  public startY: number = 0;
  public targetX: number = 0;
  public targetY: number = 0;
  public progress: number = 0; // 0 to 1
  public speed: number;
  public holdDuration: number = 0;
  public movementType: MovementType = MovementType.WALK;
  public readonly moveThreshold: number = 50;

  constructor(init?: GridMovementInit) {
    this.speed = init?.speed ?? GAME_CONSTANTS.PLAYER_SPEED;
    this.direction = init?.direction ?? Direction.DOWN;
  }
}

export const GridMovement = (props?: GridMovementInit) => new GridMovementComponent(props);
