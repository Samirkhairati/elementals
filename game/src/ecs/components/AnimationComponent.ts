import { Direction, MovementType } from "@/utils/AnimationManager";

export interface AnimationComponentInit {
  characterKey: string;
  direction?: Direction;
  movementType?: MovementType;
}

export class AnimationComponent {
  public characterKey: string;
  public direction: Direction;
  public movementType: MovementType;
  public isMoving: boolean = false;
  public currentAnimKey: string = "";

  constructor(init: AnimationComponentInit) {
    this.characterKey = init.characterKey;
    this.direction = init.direction ?? Direction.DOWN;
    this.movementType = init.movementType ?? MovementType.WALK;
  }
}

export const CharacterAnimation = (props: AnimationComponentInit) => new AnimationComponent(props);
