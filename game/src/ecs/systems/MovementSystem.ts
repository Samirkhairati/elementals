import { RUN_SPEED_MULTIPLIER } from "@shared/engine/index.ts";
import { System } from "../System";
import type { World } from "../World";
import type { Entity } from "../Entity";
import { TransformComponent } from "../components/TransformComponent";
import { GridMovementComponent } from "../components/GridMovementComponent";
import { FreeMovementComponent } from "../components/FreeMovementComponent";
import { PlayerControlComponent } from "../components/PlayerControlComponent";
import { MoveRouteComponent } from "../components/MoveRouteComponent";
import { SpatialSystem } from "./SpatialSystem";
import { Direction, MovementType } from "@/utils/Direction";
import { GAME_CONSTANTS } from "@/constants/game";
import { settingsStore } from "@/core/SettingsStore";
import { gameState } from "@/core/GameState";
import { EventBus, Events } from "@/utils/EventBus";

const MOVE_OFFSETS = {
  [Direction.LEFT]: { dx: -1, dy: 0 },
  [Direction.RIGHT]: { dx: 1, dy: 0 },
  [Direction.UP]: { dx: 0, dy: -1 },
  [Direction.DOWN]: { dx: 0, dy: 1 },
} as const;

export class MovementSystem extends System {
  public priority = 300;
  private spatialSystem: SpatialSystem;
  private lastPlayerGridX: number = -1;
  private lastPlayerGridY: number = -1;

  constructor(spatialSystem: SpatialSystem) {
    super();
    this.spatialSystem = spatialSystem;

    this.onMovementModeChanged = this.onMovementModeChanged.bind(this);
    EventBus.on(Events.MOVEMENT_MODE_CHANGED, this.onMovementModeChanged);
  }

  public destroy(_world: World): void {
    EventBus.off(Events.MOVEMENT_MODE_CHANGED, this.onMovementModeChanged);
  }

  private onMovementModeChanged(isTileBased: boolean): void {
    if (!isTileBased) return;
    // When switching to tile-based, snap player position if needed
    const pos = gameState.playerPosition;
    const tileSize = GAME_CONSTANTS.TILE_SIZE;
    const gridX = Math.round((pos.worldX - tileSize / 2) / tileSize);
    const targetX = gridX * tileSize + tileSize / 2;
    const targetY = Math.round(pos.worldY / tileSize) * tileSize;
    gameState.updatePlayerPosition(targetX, targetY, gridX, Math.floor((targetY - 1) / tileSize), pos.direction);
  }

  public update(world: World, delta: number): void {
    const isTileBased = settingsStore.tileBasedMovement;

    // Grid movement runs in tile mode for everyone. In free mode it still runs for entities that have
    // no free movement (NPCs) and for entities walking a move route (the route needs tile steps).
    for (const [entity, transform, grid] of world.view(TransformComponent, GridMovementComponent)) {
      const routed = this.isRouted(world, entity);
      if (isTileBased || routed || !world.hasComponent(entity, FreeMovementComponent)) {
        this.updateGridMovement(entity, transform, grid, delta, world, routed);
      }
    }

    if (!isTileBased) {
      for (const [entity, transform, free] of world.view(TransformComponent, FreeMovementComponent)) {
        if (this.isRouted(world, entity)) continue;
        this.updateFreeMovement(entity, transform, free, delta, world);
      }
    }
  }

  private isRouted(world: World, entity: Entity): boolean {
    return world.getComponent(entity, MoveRouteComponent)?.active ?? false;
  }

  private updateGridMovement(
    entity: Entity,
    transform: TransformComponent,
    grid: GridMovementComponent,
    delta: number,
    world: World,
    routed: boolean = false
  ): void {
    const isPlayer = world.hasComponent(entity, PlayerControlComponent);
    // A running event locks player input, but must still be able to walk its own move routes.
    const isLocked = gameState.isInputLocked && !routed;

    if (grid.isMoving) {
      const speed = grid.movementType === MovementType.RUN ? grid.speed * RUN_SPEED_MULTIPLIER : grid.speed;
      const stepDist = speed * (delta / 1000);
      grid.progress += stepDist / GAME_CONSTANTS.TILE_SIZE;

      if (grid.progress >= 1) {
        grid.progress = 1;
        transform.x = grid.targetX;
        transform.y = grid.targetY;
        grid.isMoving = false;

        if (isPlayer) {
          this.syncPlayerGameState(transform.x, transform.y, grid.direction);
        }

        // Check if we should seamlessly chain into the next step
        if (grid.pendingDirection && !isLocked) {
          grid.direction = grid.pendingDirection;
          this.tryStartGridStep(entity, transform, grid, grid.direction, world);
        }
      } else {
        transform.x = grid.startX + (grid.targetX - grid.startX) * grid.progress;
        transform.y = grid.startY + (grid.targetY - grid.startY) * grid.progress;
      }
    } else {
      if (grid.pendingDirection && !isLocked) {
        if (grid.direction !== grid.pendingDirection) {
          grid.direction = grid.pendingDirection;
          if (isPlayer) {
            this.syncPlayerGameState(transform.x, transform.y, grid.direction);
          }
        }

        if (grid.holdDuration > grid.moveThreshold) {
          this.tryStartGridStep(entity, transform, grid, grid.direction, world);
        }
      }
    }
  }

  private tryStartGridStep(
    entity: Entity,
    transform: TransformComponent,
    grid: GridMovementComponent,
    direction: Direction,
    world: World
  ): void {
    const { TILE_SIZE } = GAME_CONSTANTS;
    const { dx, dy } = MOVE_OFFSETS[direction];

    // Ensure alignment to tile grid before stepping
    this.snapTransformToGrid(transform, entity, world);

    const nextX = transform.x + dx * TILE_SIZE;
    const nextY = transform.y + dy * TILE_SIZE;

    if (this.spatialSystem.isWalkable(nextX, nextY, entity, world)) {
      grid.isMoving = true;
      grid.startX = transform.x;
      grid.startY = transform.y;
      grid.targetX = nextX;
      grid.targetY = nextY;
      grid.progress = 0;
    } else {
      grid.isMoving = false;
    }
  }

  private updateFreeMovement(
    entity: Entity,
    transform: TransformComponent,
    free: FreeMovementComponent,
    delta: number,
    world: World
  ): void {
    const isPlayer = world.hasComponent(entity, PlayerControlComponent);
    const isLocked = gameState.isInputLocked;

    if (isLocked || (free.vx === 0 && free.vy === 0)) {
      free.isMoving = false;
      return;
    }

    free.isMoving = true;
    const speed = free.isRunning ? free.speed * RUN_SPEED_MULTIPLIER : free.speed;
    const dist = speed * (delta / 1000);

    const len = Math.hypot(free.vx, free.vy);
    const normX = free.vx / len;
    const normY = free.vy / len;

    const targetX = transform.x + normX * dist;
    const targetY = transform.y + normY * dist;

    let moved = false;

    // Sliding collision on X
    if (normX !== 0 && this.spatialSystem.canMoveTo(targetX, transform.y, 8, 4, entity, world)) {
      transform.x = targetX;
      moved = true;
    }

    // Sliding collision on Y
    if (normY !== 0 && this.spatialSystem.canMoveTo(transform.x, targetY, 8, 4, entity, world)) {
      transform.y = targetY;
      moved = true;
    }

    if (moved && isPlayer) {
      this.syncPlayerGameState(transform.x, transform.y, free.direction);
    }
  }

  public snapTransformToGrid(transform: TransformComponent, entity: Entity, world: World): void {
    const tileSize = GAME_CONSTANTS.TILE_SIZE;
    const gridX = Math.round((transform.x - tileSize / 2) / tileSize);
    const targetX = gridX * tileSize + tileSize / 2;
    const targetY = Math.round(transform.y / tileSize) * tileSize;

    if (this.spatialSystem.isWalkable(targetX, targetY, entity, world)) {
      transform.x = targetX;
      transform.y = targetY;
    } else {
      const currentGridX = Math.floor(transform.x / tileSize);
      const currentGridY = Math.floor((transform.y - 1) / tileSize);
      const fallbackX = currentGridX * tileSize + tileSize / 2;
      const fallbackY = (currentGridY + 1) * tileSize;
      if (this.spatialSystem.isWalkable(fallbackX, fallbackY, entity, world)) {
        transform.x = fallbackX;
        transform.y = fallbackY;
      }
    }
  }

  private syncPlayerGameState(x: number, y: number, direction: Direction): void {
    const gridX = Math.floor(x / GAME_CONSTANTS.TILE_SIZE);
    const gridY = Math.floor((y - 1) / GAME_CONSTANTS.TILE_SIZE);

    if (gridX !== this.lastPlayerGridX || gridY !== this.lastPlayerGridY) {
      this.lastPlayerGridX = gridX;
      this.lastPlayerGridY = gridY;
      EventBus.emit(Events.PLAYER_MOVED, { x, y });
    }

    gameState.updatePlayerPosition(x, y, gridX, gridY, direction);
  }
}
