import { Scene, GameObjects, type Types } from "phaser";
import { CONFIG } from "../config";
import {
  AnimationManager,
  Direction,
  type MovementType,
} from "../utils/AnimationManager";

export class Player extends GameObjects.Sprite {
  private cursors: Types.Input.Keyboard.CursorKeys;
  private isMoving = false;
  private currentDirection: Direction = Direction.DOWN;
  private currentMovementType: MovementType = "walk";
  private animManager: AnimationManager;

  // Custom threshold for "light press" to just change direction
  private readonly LIGHT_PRESS_THRESHOLD = 50;

  constructor(scene: Scene, x: number, y: number) {
    super(scene, x, y, "player");

    this.initializeAppearance(scene);
    this.cursors = scene.input.keyboard!.createCursorKeys();
    this.animManager = AnimationManager.getInstance(scene);

    // Initial state
    this.animManager.stopMovement(this, "player", this.currentDirection);
  }

  private initializeAppearance(scene: Scene) {
    scene.add.existing(this);
    this.setOrigin(0.5, 1);
  }

  update() {
    if (!this.isMoving) {
      this.handleInput();
    }
  }

  private handleInput() {
    const activeMapping = this.getKeyboardMapping();

    if (activeMapping) {
      const { direction, key } = activeMapping;
      this.updateDirection(direction);

      // Only move if key is held past threshold
      if (key.getDuration() > this.LIGHT_PRESS_THRESHOLD) {
        this.executeMovement(direction);
      }
    } else {
      this.animManager.stopMovement(this, "player", this.currentDirection);
    }
  }

  private getKeyboardMapping() {
    const { left, right, up, down } = this.cursors;

    if (left.isDown) return { direction: Direction.LEFT, key: left };
    if (right.isDown) return { direction: Direction.RIGHT, key: right };
    if (up.isDown) return { direction: Direction.UP, key: up };
    if (down.isDown) return { direction: Direction.DOWN, key: down };

    return null;
  }

  private updateDirection(newDirection: Direction) {
    if (this.currentDirection !== newDirection) {
      this.currentDirection = newDirection;
      this.animManager.stopMovement(this, "player", this.currentDirection);
    }
  }

  private executeMovement(direction: Direction) {
    const { tileSize, playerSpeed } = CONFIG;
    const offsets = {
      [Direction.LEFT]: { dx: -1, dy: 0 },
      [Direction.RIGHT]: { dx: 1, dy: 0 },
      [Direction.UP]: { dx: 0, dy: -1 },
      [Direction.DOWN]: { dx: 0, dy: 1 },
    };

    const { dx, dy } = offsets[direction];
    const nextX = this.x + dx * tileSize;
    const nextY = this.y + dy * tileSize;

    if (this.isWithinBounds(nextX, nextY)) {
      this.isMoving = true;
      this.animManager.playMovement(
        this,
        "player",
        direction,
        this.currentMovementType,
      );

      this.scene.tweens.add({
        targets: this,
        x: nextX,
        y: nextY,
        duration: (tileSize / playerSpeed) * 1000,
        onComplete: () => {
          this.isMoving = false;
          this.handleInput(); // Re-trigger for fluid movement
        },
      });
    }
  }

  private isWithinBounds(x: number, y: number) {
    const { width, height, tileSize } = CONFIG;
    return x >= 0 && x <= width && y >= tileSize && y <= height;
  }

  getGridPosition() {
    const { tileSize } = CONFIG;
    return {
      x: Math.floor(this.x / tileSize),
      y: Math.floor((this.y - tileSize) / tileSize),
    };
  }

  // API for future movement modes
  setMovementType(type: MovementType) {
    this.currentMovementType = type;
  }
}
