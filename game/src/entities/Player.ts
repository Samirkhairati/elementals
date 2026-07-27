import { Scene, GameObjects } from "phaser";
import { CONFIG } from "@/config";
import {
  AnimationManager,
  Direction,
  MovementType,
} from "@/utils/AnimationManager";
import { EventBus, Events } from "@/utils/EventBus";

const MOVE_OFFSETS = {
  [Direction.LEFT]: { dx: -1, dy: 0 },
  [Direction.RIGHT]: { dx: 1, dy: 0 },
  [Direction.UP]: { dx: 0, dy: -1 },
  [Direction.DOWN]: { dx: 0, dy: 1 },
} as const;

export class Player extends GameObjects.Sprite {
  private isMoving = false;
  private currentDirection: Direction = Direction.DOWN;
  private currentMovementType: MovementType = MovementType.WALK;
  private animManager: AnimationManager;

  private readonly MOVE_THRESHOLD = 50;
  private isMovementLocked = false;
  private isWalkable: (x: number, y: number) => boolean;
  
  // Keep track of the latest input for continuous movement
  private pendingDirection: Direction | null = null;
  private isRunning: boolean = false;

  constructor(
    scene: Scene, 
    x: number, 
    y: number, 
    isWalkable: (x: number, y: number) => boolean
  ) {
    super(scene, x, y, "player");

    this.isWalkable = isWalkable;

    this.initializeAppearance(scene);
    this.animManager = AnimationManager.getInstance(scene);

    // Initial state
    this.animManager.stopMovement(this, "player", this.currentDirection);
    
    // Bind event listeners
    this.onInputDirection = this.onInputDirection.bind(this);
    EventBus.on(Events.INPUT_DIRECTION, this.onInputDirection);
    
    this.on('destroy', this.cleanup, this);
  }

  private cleanup() {
      EventBus.off(Events.INPUT_DIRECTION, this.onInputDirection);
  }

  private initializeAppearance(scene: Scene) {
    scene.add.existing(this);
    this.setOrigin(0.5, 1);
    this.setDepth(CONFIG.playerDepth);
  }

  update() {
      // Logic for non-input frame-by-frame updates can go here in the future
  }

  setMovementLocked(locked: boolean) {
    this.isMovementLocked = locked;
    if (locked) {
      this.pendingDirection = null;
      this.animManager.stopMovement(this, "player", this.currentDirection);
    }
  }

  get movementLocked(): boolean {
    return this.isMovementLocked;
  }

  private onInputDirection(direction: Direction | null, isRunning: boolean, duration: number) {
      this.pendingDirection = direction;
      this.isRunning = isRunning;
      
      if (!this.isMoving && !this.isMovementLocked) {
          if (direction) {
              this.currentMovementType = isRunning ? MovementType.RUN : MovementType.WALK;
              this.updateDirection(direction);
              
              if (duration > this.MOVE_THRESHOLD) {
                  this.executeMovement(direction);
              }
          } else {
              this.animManager.stopMovement(this, "player", this.currentDirection);
          }
      }
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

    if (this.isWalkable(nextX, nextY)) {
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
          EventBus.emit(Events.PLAYER_MOVED, { x: this.x, y: this.y });
          
          // Check if we should keep moving based on pending input
          if (this.pendingDirection && !this.isMovementLocked) {
              this.currentMovementType = this.isRunning ? MovementType.RUN : MovementType.WALK;
              this.updateDirection(this.pendingDirection);
              this.executeMovement(this.pendingDirection);
          } else {
              this.animManager.stopMovement(this, "player", this.currentDirection);
          }
        },
      });
    }
  }

  setWalkableCallback(callback: (x: number, y: number) => boolean) {
    this.isWalkable = callback;
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

  get direction(): Direction {
    return this.currentDirection;
  }
}
