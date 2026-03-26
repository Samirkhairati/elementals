import { Scene, GameObjects } from "phaser";

export const Direction = {
  DOWN: "down",
  LEFT: "left",
  RIGHT: "right",
  UP: "up",
} as const;

export type Direction = (typeof Direction)[keyof typeof Direction];

export const MovementType = {
  WALK: "walk",
  RUN: "run",
  SWIM: "swim",
} as const;

export type MovementType = (typeof MovementType)[keyof typeof MovementType];

/**
 * Handles character animations across the game.
 * Scalable to support NPCs and multiple movement types.
 */
export class AnimationManager {
  private static instance: AnimationManager;
  private scene: Scene;

  private constructor(scene: Scene) {
    this.scene = scene;
  }

  public static getInstance(scene: Scene): AnimationManager {
    if (!AnimationManager.instance || AnimationManager.instance.scene !== scene) {
      AnimationManager.instance = new AnimationManager(scene);
    }
    return AnimationManager.instance;
  }

  /**
   * Initializes animations for a specific movement type of a character.
   * Spritesheet Layout: 4x4 grid (Down, Left, Right, Up)
   */
  public createCharacterAnimations(
    characterKey: string,
    type: MovementType,
    spritesheetKey: string
  ) {
    const directions = [
      Direction.DOWN,
      Direction.LEFT,
      Direction.RIGHT,
      Direction.UP,
    ];

    directions.forEach((direction, index) => {
      const startFrame = index * 4;
      const endFrame = startFrame + 3;

      // Movement sequence
      this.scene.anims.create({
        key: `${characterKey}-${type}-${direction}`,
        frames: this.scene.anims.generateFrameNumbers(spritesheetKey, {
          start: startFrame,
          end: endFrame,
        }),
        frameRate: type === MovementType.RUN ? 15 : 10,
        repeat: -1,
      });

      // Facing direction (idle) - only create if it doesn't exist
      // We generally use the walk spritesheet for idle poses
      const idleKey = `${characterKey}-idle-${direction}`;
      if (!this.scene.anims.exists(idleKey)) {
        this.scene.anims.create({
          key: idleKey,
          frames: [{ key: spritesheetKey, frame: startFrame }],
          frameRate: 1,
        });
      }
    });
  }

  public playMovement(
    sprite: GameObjects.Sprite,
    characterKey: string,
    direction: Direction,
    movementType: MovementType = MovementType.WALK
  ) {
    const animKey = `${characterKey}-${movementType}-${direction}`;
    if (sprite.anims.currentAnim?.key !== animKey) {
      sprite.play(animKey);
    }
  }

  public stopMovement(
    sprite: GameObjects.Sprite,
    characterKey: string,
    direction: Direction
  ) {
    const idleKey = `${characterKey}-idle-${direction}`;
    if (sprite.anims.currentAnim?.key !== idleKey) {
      sprite.play(idleKey);
    }
  }
}
