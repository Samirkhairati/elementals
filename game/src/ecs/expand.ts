import {
  isComponentType,
  normalizeProps,
  type ComponentType,
  type EngineEntity,
  type MovementProps,
  type SpriteProps,
  isRecord,
} from "@shared/engine/index.ts";
import { spriteRegistry, type SpriteRegistry } from "@/data/spriteRegistry";
import { buildSpriteComponents } from "@/sprites/spriteState";
import { TransformComponent } from "./components/TransformComponent";
import { ColliderComponent } from "./components/ColliderComponent";
import { AreaComponent } from "./components/AreaComponent";
import { ParentComponent } from "./components/ParentComponent";
import { GridMovementComponent } from "./components/GridMovementComponent";
import { FreeMovementComponent } from "./components/FreeMovementComponent";
import { PlayerControlComponent } from "./components/PlayerControlComponent";
import { AIWanderComponent } from "./components/AIWanderComponent";
import { TagComponent } from "./components/TagComponent";
import { EntityInfoComponent } from "./components/EntityInfoComponent";
import { EventComponent } from "./components/EventComponent";
import { isOffGrid } from "@shared/engine/placement.ts";

export interface ExpandContext {
  sprites: SpriteRegistry;
  warn: (message: string) => void;
}

export function defaultExpandContext(): ExpandContext {
  return { sprites: spriteRegistry, warn: (m) => console.warn(m) };
}


/** Runtime components for the Movement component (by controller). `facing` is the Sprite's initial facing. */
export function expandMovement(props: MovementProps, facing: SpriteProps["facing"]): unknown[] {
  const grid = new GridMovementComponent({ speed: props.speed, direction: facing });
  switch (props.controller) {
    case "player":
      return [
        grid,
        new FreeMovementComponent({ speed: props.speed, direction: facing }),
        new PlayerControlComponent({ canRun: props.canRun }),
      ];
    case "wander":
      return [
        grid,
        new AIWanderComponent({ radius: props.wanderRadius, interval: props.wanderInterval, speed: props.speed }),
      ];
    default:
      return [grid];
  }
}

/**
 * Expands one (already migrated) editor entity into the runtime components of the ECS:
 *
 *  - Transform -> TransformComponent
 *  - Sprite    -> SpriteComponent (+ AnimatorComponent); an empty asset means no
 *                 graphic, an unknown asset warns and means no graphic
 *  - Collider  -> ColliderComponent
 *  - Area      -> AreaComponent (where events trigger, when not the Collider)
 *  - Movement  -> GridMovement (+ FreeMovement + PlayerControl for `player`, + AIWander for `wander`)
 *  - Event     -> EventComponent (states; the state selector applies state overrides later)
 *  - Tag       -> TagComponent
 *  - `parent`  -> ParentComponent (it moves, turns and hides with the entity it sits in)
 *
 * An EntityInfo (editor id + name) is always added so event targets can find the entity.
 * Unknown component names are reported through `ctx.warn` and skipped. Never throws for bad props.
 */
export function expandEntity(entity: EngineEntity, ctx: ExpandContext = defaultExpandContext()): unknown[] {
  const out: unknown[] = [];
  const components: Record<string, unknown> = isRecord(entity.components) ? entity.components : {};

  for (const type of Object.keys(components)) {
    if (!isComponentType(type)) ctx.warn(`[ECS] Unknown component type: ${type}`);
  }

  const transform = normalizeProps("Transform", components.Transform);
  // An anchor off the tile grid keeps its pixel position (see Transform.free), whatever the flag says.
  const rawTransform = components.Transform;
  const positioned = isRecord(rawTransform) && typeof rawTransform.x === "number" && typeof rawTransform.y === "number";
  out.push(new TransformComponent({ ...transform, free: transform.free || (positioned && isOffGrid(transform.x, transform.y)) }));
  out.push(new EntityInfoComponent(typeof entity.id === "string" ? entity.id : "", typeof entity.name === "string" ? entity.name : ""));

  let spriteProps: SpriteProps | null = null;
  if (components.Sprite !== undefined) {
    spriteProps = normalizeProps("Sprite", components.Sprite);
    if (spriteProps.asset !== "") {
      const built = buildSpriteComponents(spriteProps, ctx.sprites);
      if (built.ok) {
        // The node's rotation turns its sprite around the anchor.
        if (typeof entity.rotation === "number" && Number.isFinite(entity.rotation)) built.value.sprite.angle = entity.rotation;
        out.push(built.value.sprite);
        out.push(built.value.animator);
      } else {
        ctx.warn(`[Sprite] entity "${entity.name ?? entity.id ?? "?"}": ${built.reason}; it will have no graphic`);
      }
    }
  }

  let baseSolid: boolean | null = null;
  if (components.Collider !== undefined) {
    const c = normalizeProps("Collider", components.Collider);
    baseSolid = c.isSolid;
    out.push(new ColliderComponent(c));
  }

  if (components.Area !== undefined) {
    out.push(new AreaComponent(normalizeProps("Area", components.Area)));
  }

  if (components.Movement !== undefined) {
    out.push(...expandMovement(normalizeProps("Movement", components.Movement), spriteProps?.facing ?? "down"));
  }

  if (components.Event !== undefined) {
    const event = normalizeProps("Event", components.Event);
    out.push(new EventComponent(event.states, spriteProps, baseSolid));
  }

  if (components.Tag !== undefined) {
    out.push(new TagComponent(normalizeProps("Tag", components.Tag).tag || "entity"));
  }

  // An entity inside an entity travels with it (ParentFollowSystem).
  if (typeof entity.parent === "string" && entity.parent !== "") out.push(new ParentComponent(entity.parent));

  return out;
}

export type { ComponentType };
