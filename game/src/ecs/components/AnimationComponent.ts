import { Direction, MovementType } from "@/utils/Direction";

export interface AnimationComponentInit {
  /** Sprite asset id of the character (`characters/player`). */
  assetId: string;
  direction?: Direction;
  movementType?: MovementType;
  /** The asset has a run sheet (otherwise running falls back to walking). */
  hasRun?: boolean;
  /** Forces an animation phase regardless of movement ('' / null = automatic). */
  forcedPhase?: "idle" | "walk" | "run" | null;
}

/** Drives the walk/run/idle animation of a `character` sprite asset from movement + facing. */
export class AnimationComponent {
  public assetId: string;
  public direction: Direction;
  public movementType: MovementType;
  public hasRun: boolean;
  public forcedPhase: "idle" | "walk" | "run" | null;
  public isMoving: boolean = false;
  public currentAnimKey: string = "";

  constructor(init: AnimationComponentInit) {
    this.assetId = init.assetId;
    this.direction = init.direction ?? Direction.DOWN;
    this.movementType = init.movementType ?? MovementType.WALK;
    this.hasRun = init.hasRun ?? false;
    this.forcedPhase = init.forcedPhase ?? null;
  }
}

export const CharacterAnimation = (props: AnimationComponentInit) => new AnimationComponent(props);
