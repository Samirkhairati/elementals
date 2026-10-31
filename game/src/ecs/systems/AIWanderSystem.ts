import { System } from "../System";
import type { World } from "../World";
import type { Entity } from "../Entity";
import { TransformComponent } from "../components/TransformComponent";
import { GridMovementComponent } from "../components/GridMovementComponent";
import { AIWanderComponent } from "../components/AIWanderComponent";
import { PlayerControlComponent } from "../components/PlayerControlComponent";
import { MoveRouteComponent } from "../components/MoveRouteComponent";
import { Direction, MovementType } from "@/utils/Direction";
import { GAME_CONSTANTS } from "@/constants/game";
import { settingsStore } from "@/core/SettingsStore";
import { gameState } from "@/core/GameState";

/** The slice of SpatialSystem the wander AI needs (lets tests inject a stub). */
export interface WalkabilityQuery {
  isWalkable(x: number, y: number, ignoreEntityId?: Entity, worldOverride?: World): boolean;
}

const STEP_OFFSETS: ReadonlyArray<{ dir: Direction; dx: number; dy: number }> = [
  { dir: Direction.UP, dx: 0, dy: -1 },
  { dir: Direction.DOWN, dx: 0, dy: 1 },
  { dir: Direction.LEFT, dx: -1, dy: 0 },
  { dir: Direction.RIGHT, dx: 1, dy: 0 },
];

/**
 * Makes entities with `AIWander` + `GridMovement` + `Transform` roam around their home tile.
 *
 * It drives movement through the same intent fields the player's InputSystem writes
 * (`GridMovementComponent.pendingDirection` / `holdDuration`); MovementSystem then performs
 * the actual step, so collision, easing and animation are shared with the player.
 *
 * Rules:
 * - runs only in tile-based movement mode (MovementSystem only steps GridMovement then);
 * - the idle timer only advances while the entity is standing still and input is not locked
 *   (dialogue / menu open freezes every wanderer; there is no per-NPC lock notion);
 * - every `interval` ms it picks one random cardinal direction among those whose target tile is
 *   within `radius` tiles (Chebyshev distance) of the home tile and walkable, and requests one step;
 * - `speed` is applied to the entity's GridMovement while wandering.
 *
 * Priority 250 sits between InputSystem (200) and MovementSystem (300).
 */
export class AIWanderSystem extends System {
  public priority = 250;

  private readonly walkability: WalkabilityQuery;
  private readonly rng: () => number;

  /**
   * @param walkability collision query (normally the SpatialSystem)
   * @param rng random source in [0, 1); injectable for deterministic tests
   */
  constructor(walkability: WalkabilityQuery, rng: () => number = Math.random) {
    super();
    this.walkability = walkability;
    this.rng = rng;
  }

  public update(world: World, delta: number): void {
    const isTileBased = settingsStore.tileBasedMovement;
    const isLocked = gameState.isInputLocked;
    const tileSize = GAME_CONSTANTS.TILE_SIZE;

    for (const [entity, transform, grid, wander] of world.view(TransformComponent, GridMovementComponent, AIWanderComponent)) {
      // The player is never AI driven, even if someone attached the component to it.
      if (world.hasComponent(entity, PlayerControlComponent)) continue;
      // An entity walking a move route is driven by the route, not by the AI.
      if (world.getComponent(entity, MoveRouteComponent)?.active) continue;

      // Any intent issued last frame has been consumed by MovementSystem (or rejected) by now.
      grid.pendingDirection = null;

      if (!wander.homeInitialized) {
        this.initHome(wander, transform, tileSize);
      }

      if (!isTileBased || isLocked || grid.isMoving) continue;

      wander.timer += delta;
      if (wander.timer < wander.interval) continue;
      wander.timer = 0;

      const dir = this.pickDirection(entity, transform, wander, world, tileSize);
      if (!dir) continue;

      grid.speed = wander.speed;
      grid.movementType = MovementType.WALK;
      grid.pendingDirection = dir;
      grid.holdDuration = grid.moveThreshold + 1;
    }
  }

  private initHome(wander: AIWanderComponent, transform: TransformComponent, tileSize: number): void {
    const gridX = Math.floor(transform.x / tileSize);
    const gridY = Math.floor((transform.y - 1) / tileSize);
    wander.originX = gridX * tileSize + tileSize / 2;
    wander.originY = (gridY + 1) * tileSize;
    wander.homeInitialized = true;
    // Desynchronise NPCs that spawn together: random head start on the first interval.
    wander.timer = Math.max(0, wander.interval) * this.rng();
  }

  private pickDirection(
    entity: Entity,
    transform: TransformComponent,
    wander: AIWanderComponent,
    world: World,
    tileSize: number,
  ): Direction | null {
    const homeX = Math.floor(wander.originX / tileSize);
    const homeY = Math.floor((wander.originY - 1) / tileSize);
    const curX = Math.floor(transform.x / tileSize);
    const curY = Math.floor((transform.y - 1) / tileSize);

    const options: Direction[] = [];
    for (const { dir, dx, dy } of STEP_OFFSETS) {
      const tx = curX + dx;
      const ty = curY + dy;
      if (Math.abs(tx - homeX) > wander.radius || Math.abs(ty - homeY) > wander.radius) continue;
      // Same sample point MovementSystem uses: bottom-centre of the target tile.
      const wx = tx * tileSize + tileSize / 2;
      const wy = (ty + 1) * tileSize;
      if (!this.walkability.isWalkable(wx, wy, entity, world)) continue;
      options.push(dir);
    }

    if (options.length === 0) return null;
    const idx = Math.min(options.length - 1, Math.floor(this.rng() * options.length));
    return options[idx];
  }
}
