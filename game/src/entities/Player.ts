import { Scene, GameObjects } from "phaser";
import { GAME_CONSTANTS } from "@/constants/game";
import { settingsStore } from "@/core/SettingsStore";
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
  
  // Input tracking
  private pendingDirection: Direction | null = null;
  private inputVector: { x: number; y: number } = { x: 0, y: 0 };
  private isRunning: boolean = false;
  private lastGridX: number = -1;
  private lastGridY: number = -1;

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
    const initialGrid = this.getGridPosition();
    this.lastGridX = initialGrid.x;
    this.lastGridY = initialGrid.y;
    
    // Bind event listeners
    this.onInputDirection = this.onInputDirection.bind(this);
    this.onMovementModeChanged = this.onMovementModeChanged.bind(this);
    
    EventBus.on(Events.INPUT_DIRECTION, this.onInputDirection);
    EventBus.on(Events.MOVEMENT_MODE_CHANGED, this.onMovementModeChanged);
    
    this.on('destroy', this.cleanup, this);
  }

  private cleanup() {
    EventBus.off(Events.INPUT_DIRECTION, this.onInputDirection);
    EventBus.off(Events.MOVEMENT_MODE_CHANGED, this.onMovementModeChanged);
  }

  private initializeAppearance(scene: Scene) {
    scene.add.existing(this);
    this.setOrigin(0.5, 1);
    this.setDepth(GAME_CONSTANTS.PLAYER_DEPTH);
  }

  private onMovementModeChanged(isTileBased: boolean) {
    // 1. Kill any active tweens and reset moving state
    this.scene.tweens.killTweensOf(this);
    this.isMoving = false;

    // 2. Snap to nearest valid grid cell if entering tile-based mode
    if (isTileBased) {
      this.snapToGrid();
    }

    // 3. Update animation state
    const hasInput = this.pendingDirection !== null && 
      (this.inputVector.x !== 0 || this.inputVector.y !== 0);

    if (!hasInput || this.isMovementLocked) {
      this.animManager.stopMovement(this, "player", this.currentDirection);
    } else {
      this.currentMovementType = this.isRunning ? MovementType.RUN : MovementType.WALK;
      this.animManager.playMovement(this, "player", this.currentDirection, this.currentMovementType);
    }
  }

  public snapToGrid() {
    const tileSize = GAME_CONSTANTS.TILE_SIZE;
    
    // Find nearest tile center on X axis
    const gridX = Math.round((this.x - tileSize / 2) / tileSize);
    const targetX = gridX * tileSize + tileSize / 2;

    // Find nearest tile bottom on Y axis
    const targetY = Math.round(this.y / tileSize) * tileSize;

    // Check if target position is walkable; if so snap there, else fallback to current tile
    if (this.isWalkable(targetX, targetY)) {
      this.x = targetX;
      this.y = targetY;
    } else {
      const currentGrid = this.getGridPosition();
      const fallbackX = currentGrid.x * tileSize + tileSize / 2;
      const fallbackY = (currentGrid.y + 1) * tileSize;
      if (this.isWalkable(fallbackX, fallbackY)) {
        this.x = fallbackX;
        this.y = fallbackY;
      }
    }

    const finalGrid = this.getGridPosition();
    this.lastGridX = finalGrid.x;
    this.lastGridY = finalGrid.y;
  }

  update(delta: number = 16.67) {
    if (!settingsStore.tileBasedMovement) {
      this.updateContinuousMovement(delta);
    }
  }

  private updateContinuousMovement(delta: number) {
    if (this.isMovementLocked) {
      if (this.isMoving) {
        this.animManager.stopMovement(this, "player", this.currentDirection);
        this.isMoving = false;
      }
      return;
    }

    const vx = this.inputVector.x;
    const vy = this.inputVector.y;

    if (vx === 0 && vy === 0) {
      if (this.isMoving) {
        this.animManager.stopMovement(this, "player", this.currentDirection);
        this.isMoving = false;
      }
      return;
    }

    this.currentMovementType = this.isRunning ? MovementType.RUN : MovementType.WALK;
    this.animManager.playMovement(
      this,
      "player",
      this.currentDirection,
      this.currentMovementType
    );
    this.isMoving = true;

    const speed = this.isRunning ? GAME_CONSTANTS.PLAYER_SPEED * 1.5 : GAME_CONSTANTS.PLAYER_SPEED;
    const dist = speed * (delta / 1000);

    let normX = vx;
    let normY = vy;
    if (vx !== 0 && vy !== 0) {
      const len = Math.hypot(vx, vy);
      normX /= len;
      normY /= len;
    }

    let moved = false;
    const targetX = this.x + normX * dist;
    const targetY = this.y + normY * dist;

    // Sliding collision check: X axis
    if (normX !== 0 && this.canMoveTo(targetX, this.y)) {
      this.x = targetX;
      moved = true;
    }

    // Sliding collision check: Y axis
    if (normY !== 0 && this.canMoveTo(this.x, targetY)) {
      this.y = targetY;
      moved = true;
    }

    if (moved) {
      const currentGrid = this.getGridPosition();
      if (currentGrid.x !== this.lastGridX || currentGrid.y !== this.lastGridY) {
        this.lastGridX = currentGrid.x;
        this.lastGridY = currentGrid.y;
        EventBus.emit(Events.PLAYER_MOVED, { x: this.x, y: this.y });
      }
    }
  }

  private canMoveTo(targetX: number, targetY: number): boolean {
    const halfW = 8;
    const feetH = 4;

    return (
      this.isWalkable(targetX, targetY) &&
      this.isWalkable(targetX - halfW, targetY) &&
      this.isWalkable(targetX + halfW, targetY) &&
      this.isWalkable(targetX - halfW, targetY - feetH) &&
      this.isWalkable(targetX + halfW, targetY - feetH)
    );
  }

  setMovementLocked(locked: boolean) {
    this.isMovementLocked = locked;
    if (locked) {
      this.pendingDirection = null;
      this.inputVector = { x: 0, y: 0 };
      this.isMoving = false;
      this.animManager.stopMovement(this, "player", this.currentDirection);
    }
  }

  get movementLocked(): boolean {
    return this.isMovementLocked;
  }

  private onInputDirection(
    direction: Direction | null, 
    isRunning: boolean, 
    duration: number,
    vector?: { x: number; y: number }
  ) {
    this.pendingDirection = direction;
    this.isRunning = isRunning;
    this.inputVector = vector || (direction ? { x: MOVE_OFFSETS[direction].dx, y: MOVE_OFFSETS[direction].dy } : { x: 0, y: 0 });

    if (this.isMovementLocked) return;

    if (settingsStore.tileBasedMovement) {
      if (!this.isMoving) {
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
    } else {
      if (direction) {
        this.currentMovementType = isRunning ? MovementType.RUN : MovementType.WALK;
        this.updateDirection(direction);
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
    const { TILE_SIZE, PLAYER_SPEED } = GAME_CONSTANTS;
    const { dx, dy } = MOVE_OFFSETS[direction];

    // Ensure player is aligned to grid before tweening to the next grid cell
    this.snapToGrid();

    const nextX = this.x + dx * TILE_SIZE;
    const nextY = this.y + dy * TILE_SIZE;

    if (this.isWalkable(nextX, nextY)) {
      this.isMoving = true;

      // Use faster speed for running
      const speed =
        this.currentMovementType === MovementType.RUN
          ? PLAYER_SPEED * 1.5
          : PLAYER_SPEED;

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
        duration: (TILE_SIZE / speed) * 1000,
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
    } else {
      this.isMoving = false;
      this.animManager.stopMovement(this, "player", this.currentDirection);
    }
  }

  setWalkableCallback(callback: (x: number, y: number) => boolean) {
    this.isWalkable = callback;
  }

  getGridPosition() {
    return {
      x: Math.floor(this.x / GAME_CONSTANTS.TILE_SIZE),
      y: Math.floor((this.y - 1) / GAME_CONSTANTS.TILE_SIZE),
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
