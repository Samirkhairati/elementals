import { System } from "../System";
import type { World } from "../World";
import type { Entity } from "../Entity";
import { TransformComponent } from "../components/TransformComponent";
import { ColliderComponent } from "../components/ColliderComponent";
import { CollisionSystem } from "@/world/CollisionSystem";

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

      const left = transform.x + collider.offsetX - collider.width / 2;
      const right = transform.x + collider.offsetX + collider.width / 2;
      const top = transform.y + collider.offsetY - collider.height;
      const bottom = transform.y + collider.offsetY;

      if (x >= left && x <= right && y >= top && y <= bottom) {
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
}
