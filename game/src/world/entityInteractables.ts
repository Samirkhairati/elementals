import type { World } from "@/ecs/World";
import { TransformComponent } from "@/ecs/components/TransformComponent";
import { ColliderComponent } from "@/ecs/components/ColliderComponent";
import { InteractableComponent } from "@/ecs/components/InteractableComponent";
import { GAME_CONSTANTS } from "@/constants/game";
import type { Interactable } from "./InteractionSystem";

/**
 * Builds the tile-level interactables for every ECS entity that has an
 * Interactable component, from the entity's *current* position. Reading from the
 * world on demand (instead of snapshotting at map load) keeps dialogue and warps
 * attached to NPCs that wander.
 */
export function collectEntityInteractables(world: World, tileSize: number = GAME_CONSTANTS.TILE_SIZE): Interactable[] {
  const result: Interactable[] = [];

  for (const [entity, transform, interactable] of world.view(TransformComponent, InteractableComponent)) {
    const collider = world.getComponent(entity, ColliderComponent);

    const width = collider?.width || tileSize;
    const height = collider?.height || tileSize;
    const offsetX = collider?.offsetX || 0;
    const offsetY = collider?.offsetY || 0;

    const left = transform.x + offsetX - width / 2;
    const right = transform.x + offsetX + width / 2;
    const top = transform.y + offsetY - height;
    const bottom = transform.y + offsetY;

    const minTileX = Math.floor(Math.max(0, left) / tileSize);
    const maxTileX = Math.floor(Math.max(0, right - 1) / tileSize);
    const minTileY = Math.floor(Math.max(0, top) / tileSize);
    const maxTileY = Math.floor(Math.max(0, bottom - 1) / tileSize);

    for (let tx = minTileX; tx <= maxTileX; tx++) {
      for (let ty = minTileY; ty <= maxTileY; ty++) {
        result.push({
          x: tx,
          y: ty,
          type: interactable.type,
          message: interactable.message ?? "",
          eventKey: interactable.eventKey ?? "",
          targetMap: interactable.targetMap,
          targetX: interactable.targetX,
          targetY: interactable.targetY,
        });
      }
    }
  }

  return result;
}
