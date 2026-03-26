import { Scene, GameObjects, Input, type Types } from "phaser";
import { CONFIG } from "../config";
import {
  AnimationManager,
  Direction,
  MovementType,
} from "../utils/AnimationManager";

const MOVE_OFFSETS = {
  [Direction.LEFT]: { dx: -1, dy: 0 },
  [Direction.RIGHT]: { dx: 1, dy: 0 },
  [Direction.UP]: { dx: 0, dy: -1 },
  [Direction.DOWN]: { dx: 0, dy: 1 },
} as const;

export class Player extends GameObjects.Sprite {
  private cursors: Types.Input.Keyboard.CursorKeys;
  private runKey: Input.Keyboard.Key;
  private isMoving = false;
  private currentDirection: Direction = Direction.DOWN;
  private currentMovementType: MovementType = MovementType.WALK;
  private animManager: AnimationManager;

  private readonly MOVE_THRESHOLD = 50;

  constructor(scene: Scene, x: number, y: number) {
    super(scene, x, y, "player");

    this.initializeAppearance(scene);
    this.cursors = scene.input.keyboard!.createCursorKeys();
    this.runKey = scene.input.keyboard!.addKey("X");
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

      // Update movement type based on 'X' key
      this.currentMovementType = this.runKey.isDown
        ? MovementType.RUN
        : MovementType.WALK;

      this.updateDirection(direction);

      // Trigger movement if held past threshold
      if (key.getDuration() > this.MOVE_THRESHOLD) {
        this.executeMovement(direction);
      }
    } else {
      this.animManager.stopMovement(this, "player", this.currentDirection);
    }
  }

  private getKeyboardMapping() {
    const { left, right, up, down } = this.cursors;
    const keys = [
      { direction: Direction.LEFT, key: left },
      { direction: Direction.RIGHT, key: right },
      { direction: Direction.UP, key: up },
      { direction: Direction.DOWN, key: down },
    ];

    // Filter for pressed keys and find the most recently pressed one
    return (
      keys
        .filter((k) => k.key.isDown)
        .sort((a, b) => b.key.timeDown - a.key.timeDown)[0] || null
    );
  }

  private updateDirection(newDirection: Direction) {
    if (this.currentDirection !== newDirection) {
      this.currentDirection = newDirection;
      this.animManager.stopMovement(this, "player", this.currentDirection);
    }
  }

  private executeMovement(direction: Direction) {
    const { tileSize, playerSpeed } = CONFIG;
    const { dx, dy } = MOVE_OFFSETS[direction];

    const nextX = this.x + dx * tileSize;
    const nextY = this.y + dy * tileSize;

    if (this.isWithinBounds(nextX, nextY)) {
      this.isMoving = true;

      // Use faster speed for running
      const speed =
        this.currentMovementType === MovementType.RUN
          ? playerSpeed * 1.5
          : playerSpeed;

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
        duration: (tileSize / speed) * 1000,
        ease: "Linear",
        onComplete: () => {
          this.isMoving = false;
          // Check for continuous input immediately to avoid 1-frame stutter
          this.handleInput();
        },
      });
    }
  }

  private isWithinBounds(x: number, y: number) {
    const { width, height, tileSize } = CONFIG;
    // Bounds checking: must be within the map [0, width] and [tileSize, height]
    // origin(0.5, 1) means we check the bottom center of the sprite
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
