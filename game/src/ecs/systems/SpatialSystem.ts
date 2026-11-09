import { System } from "../System";
import type { World } from "../World";
import type { Entity } from "../Entity";
import { TransformComponent } from "../components/TransformComponent";
import { ColliderComponent } from "../components/ColliderComponent";
import { CollisionSystem } from "@/world/CollisionSystem";
import { isUsableShape, pointInShape, shapeBlocksMove, translatePoints } from "@shared/collisionShapes.ts";

/** The world-space polygon of a solid polygon collider, or null for a box / an unusable shape. */
function worldShape(transform: TransformComponent, collider: ColliderComponent) {
  if (collider.shape !== "polygon") return null;
  const shape = { points: translatePoints(collider.points, transform.x, transform.y), closed: collider.closed };
  return isUsableShape(shape) ? shape : null;
}

export class SpatialSystem extends System {
  public priority = 100;
  private collisionSystem: CollisionSystem;
  private currentWorld: World | null = null;

  constructor(collisionSystem?: CollisionSystem) {
    super();
    this.collisionSystem = collisionSystem ?? new CollisionSystem();
  }

  public setMap(map: Phaser.Tilemaps.Tilemap | null): void {
    if (map) {
      this.collisionSystem.setMap(map);
    }
  }

  public update(world: World, _delta: number): void {
    this.currentWorld = world;
  }

  public isWalkable(x: number, y: number, ignoreEntityId?: Entity, worldOverride?: World): boolean {
    // 1. Static tilemap collision
    if (!this.collisionSystem.isWalkable(x, y)) {
      return false;
    }

    const world = worldOverride ?? this.currentWorld;
    if (!world) return true;

    // 2. Dynamic entity collision
    const dynamicColliders = world.view(TransformComponent, ColliderComponent);
    for (const [entity, transform, collider] of dynamicColliders) {
      if (entity === ignoreEntityId || !collider.isSolid) continue;

      if (collider.shape === "polygon") {
        const shape = worldShape(transform, collider);
        if (shape && pointInShape(shape, x, y - 1)) return false;
        continue;
      }

      const left = transform.x + collider.offsetX - collider.width / 2;
      const right = transform.x + collider.offsetX + collider.width / 2;
      const top = transform.y + collider.offsetY - collider.height;
      const bottom = transform.y + collider.offsetY;

      // The top edge is exclusive: a one-tile (32px) box must not block the bottom-centre of the tile above it.
      if (x >= left && x <= right && y > top && y <= bottom) {
        return false;
      }
    }

    return true;
  }

  public canMoveTo(
    targetX: number,
    targetY: number,
    halfW: number = 8,
    feetH: number = 4,
    ignoreEntityId?: Entity,
    worldOverride?: World
  ): boolean {
    return (
      this.isWalkable(targetX, targetY, ignoreEntityId, worldOverride) &&
      this.isWalkable(targetX - halfW, targetY, ignoreEntityId, worldOverride) &&
      this.isWalkable(targetX + halfW, targetY, ignoreEntityId, worldOverride) &&
      this.isWalkable(targetX - halfW, targetY - feetH, ignoreEntityId, worldOverride) &&
      this.isWalkable(targetX + halfW, targetY - feetH, ignoreEntityId, worldOverride)
    );
  }

  /** Do static shapes or solid polygon entities stop a feet box going from one anchor to another? */
  public stepBlocked(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    ignoreEntityId?: Entity,
    worldOverride?: World,
    halfW: number = 8,
    feetH: number = 4
  ): boolean {
    if (this.collisionSystem.shapesBlockMove(fromX, fromY, toX, toY, halfW, feetH)) return true;
    const world = worldOverride ?? this.currentWorld;
    if (!world) return false;
    for (const [entity, transform, collider] of world.view(TransformComponent, ColliderComponent)) {
      if (entity === ignoreEntityId || !collider.isSolid) continue;
      const shape = worldShape(transform, collider);
      if (shape && shapeBlocksMove(shape, fromX, fromY, toX, toY, halfW, feetH)) return true;
    }
    return false;
  }

  /** `canMoveTo` plus polygon walls: the target must be free and the move must not cross a shape. */
  public canMove(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    halfW: number = 8,
    feetH: number = 4,
    ignoreEntityId?: Entity,
    worldOverride?: World
  ): boolean {
    return (
      this.canMoveTo(toX, toY, halfW, feetH, ignoreEntityId, worldOverride) &&
      !this.stepBlocked(fromX, fromY, toX, toY, ignoreEntityId, worldOverride, halfW, feetH)
    );
  }
}
