import { TransformComponent } from "./components/TransformComponent";
import { SpriteComponent } from "./components/SpriteComponent";
import { ColliderComponent } from "./components/ColliderComponent";
import { GridMovementComponent } from "./components/GridMovementComponent";
import { FreeMovementComponent } from "./components/FreeMovementComponent";
import { PlayerControlComponent } from "./components/PlayerControlComponent";
import { AnimationComponent } from "./components/AnimationComponent";
import { TagComponent } from "./components/TagComponent";
import { InteractableComponent } from "./components/InteractableComponent";
import { AIWanderComponent } from "./components/AIWanderComponent";

export function createComponentFromData(type: string, props: Record<string, any>): any {
  switch (type) {
    case "Transform":
      return new TransformComponent(props);
    case "SpriteView":
      return new SpriteComponent(props as any);
    case "Collider":
      return new ColliderComponent(props);
    case "GridMovement":
      return new GridMovementComponent(props);
    case "FreeMovement":
      return new FreeMovementComponent(props);
    case "PlayerControl":
      return new PlayerControlComponent();
    case "CharacterAnimation":
      return new AnimationComponent(props as any);
    case "Interactable":
      return new InteractableComponent(props);
    case "AIWander":
      return new AIWanderComponent(props);
    case "Tag":
      return new TagComponent(props?.tag || "entity");
    default:
      console.warn(`[ECS] Unknown component type: ${type}`);
      return null;
  }
}
