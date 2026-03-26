import { Scene, GameObjects } from "phaser";

export const Direction = {
  DOWN: "down",
  LEFT: "left",
  RIGHT: "right",
  UP: "up",
} as const;

export type Direction = (typeof Direction)[keyof typeof Direction];

export type MovementType = "walk" | "run" | "swim";

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
   * Initializes animations for a character.
   * Spritesheet Layout: 4x4 (Down, Left, Right, Up)
   */
  public createCharacterAnimations(characterKey: string, spritesheetKey: string) {
    const directions = [Direction.DOWN, Direction.LEFT, Direction.RIGHT, Direction.UP];
    const movementTypes: MovementType[] = ["walk"]; // Future: "run", "swim"

    movementTypes.forEach((type) => {
      directions.forEach((direction, index) => {
        const startFrame = index * 4;
        const endFrame = startFrame + 3;

        // Walking sequence
        this.scene.anims.create({
          key: `${characterKey}-${type}-${direction}`,
          frames: this.scene.anims.generateFrameNumbers(spritesheetKey, {
            start: startFrame,
            end: endFrame,
          }),
          frameRate: 10,
          repeat: -1,
        });

        // Facing direction (idle)
        this.scene.anims.create({
          key: `${characterKey}-idle-${direction}`,
          frames: [{ key: spritesheetKey, frame: startFrame }],
          frameRate: 1,
        });
      });
    });
  }

  public playMovement(
    sprite: GameObjects.Sprite,
    characterKey: string,
    direction: Direction,
    movementType: MovementType = "walk"
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
