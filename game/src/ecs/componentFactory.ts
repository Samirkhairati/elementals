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
import { Direction, MovementType } from "@/utils/Direction";

/**
 * Raw, untrusted component props as found in map JSON (editor output).
 * Values are validated / coerced per component; unknown keys are ignored.
 */
export type ComponentData = Record<string, unknown>;

/** Maps each component type name (identical to the editor's `ComponentType`) to its runtime class. */
export interface ComponentTypeMap {
  Transform: TransformComponent;
  SpriteView: SpriteComponent;
  Collider: ColliderComponent;
  GridMovement: GridMovementComponent;
  FreeMovement: FreeMovementComponent;
  PlayerControl: PlayerControlComponent;
  CharacterAnimation: AnimationComponent;
  Interactable: InteractableComponent;
  AIWander: AIWanderComponent;
  Tag: TagComponent;
}

export type ComponentTypeName = keyof ComponentTypeMap;
export type ComponentInstance = ComponentTypeMap[ComponentTypeName];

/** Thrown when a component's props are unusable (e.g. SpriteView without a texture). */
export class ComponentDataError extends Error {
  constructor(type: string, message: string) {
    super(`[${type}] ${message}`);
    this.name = "ComponentDataError";
  }
}

// --- Light runtime coercion helpers -------------------------------------------------
// Each returns `undefined` when the value is absent or unusable so that the component
// constructors' own defaults apply.

function num(data: ComponentData, key: string): number | undefined {
  const v = data[key];
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function str(data: ComponentData, key: string): string | undefined {
  const v = data[key];
  return typeof v === "string" ? v : undefined;
}

function bool(data: ComponentData, key: string): boolean | undefined {
  const v = data[key];
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

function oneOf<T extends string>(data: ComponentData, key: string, allowed: readonly T[]): T | undefined {
  const v = data[key];
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

const DIRECTIONS = Object.values(Direction);
const MOVEMENT_TYPES = Object.values(MovementType);
const INTERACT_TYPES = ["on_interact", "on_step"] as const;

/** Drops undefined entries so constructor defaults (`init?.x ?? default`) kick in. */
function defined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

type Factory<T> = (data: ComponentData) => T;

const FACTORIES: { [K in ComponentTypeName]: Factory<ComponentTypeMap[K]> } = {
  Transform: (d) =>
    new TransformComponent(defined({ x: num(d, "x"), y: num(d, "y"), depth: num(d, "depth") })),

  SpriteView: (d) => {
    const texture = str(d, "texture");
    if (!texture) throw new ComponentDataError("SpriteView", 'missing required string "texture"');
    // `frame` may be a frame name or an index.
    const frame = typeof d.frame === "string" ? d.frame : num(d, "frame");
    return new SpriteComponent(
      defined({
        texture,
        frame,
        originX: num(d, "originX"),
        originY: num(d, "originY"),
        visible: bool(d, "visible"),
        alpha: num(d, "alpha"),
        flipX: bool(d, "flipX"),
        tint: num(d, "tint"),
      }),
    );
  },

  Collider: (d) =>
    new ColliderComponent(
      defined({
        width: num(d, "width"),
        height: num(d, "height"),
        offsetX: num(d, "offsetX"),
        offsetY: num(d, "offsetY"),
        isSolid: bool(d, "isSolid"),
      }),
    ),

  GridMovement: (d) =>
    new GridMovementComponent(defined({ speed: num(d, "speed"), direction: oneOf(d, "direction", DIRECTIONS) })),

  FreeMovement: (d) =>
    new FreeMovementComponent(defined({ speed: num(d, "speed"), direction: oneOf(d, "direction", DIRECTIONS) })),

  PlayerControl: () => new PlayerControlComponent(),

  CharacterAnimation: (d) => {
    const characterKey = str(d, "characterKey");
    if (!characterKey) throw new ComponentDataError("CharacterAnimation", 'missing required string "characterKey"');
    return new AnimationComponent(
      defined({
        characterKey,
        direction: oneOf(d, "direction", DIRECTIONS),
        movementType: oneOf(d, "movementType", MOVEMENT_TYPES),
      }),
    );
  },

  Interactable: (d) =>
    new InteractableComponent(
      defined({
        type: oneOf(d, "type", INTERACT_TYPES),
        message: str(d, "message"),
        eventKey: str(d, "eventKey"),
        targetMap: str(d, "targetMap"),
        targetX: num(d, "targetX"),
        targetY: num(d, "targetY"),
      }),
    ),

  AIWander: (d) =>
    new AIWanderComponent(defined({ radius: num(d, "radius"), interval: num(d, "interval"), speed: num(d, "speed") })),

  Tag: (d) => new TagComponent(str(d, "tag") || "entity"),
};

/** All component type names understood by the factory (kept identical to the editor's `ComponentType`). */
export const COMPONENT_TYPE_NAMES = Object.keys(FACTORIES) as ComponentTypeName[];

export function isComponentTypeName(type: string): type is ComponentTypeName {
  return Object.hasOwn(FACTORIES, type);
}

/**
 * Builds a component from untrusted map data.
 *
 * - Known type: returns a validated component instance (invalid optional props fall back to
 *   the component defaults; unknown props are ignored). Throws `ComponentDataError` if a
 *   required prop (SpriteView.texture, CharacterAnimation.characterKey) is missing.
 * - Unknown type: reports a warning (via `onWarning`, default `console.warn`) and returns `null`.
 */
export function createComponentFromData<K extends ComponentTypeName>(
  type: K,
  props?: unknown,
  onWarning?: (message: string) => void,
): ComponentTypeMap[K];
export function createComponentFromData(
  type: string,
  props?: unknown,
  onWarning?: (message: string) => void,
): ComponentInstance | null;
export function createComponentFromData(
  type: string,
  props?: unknown,
  onWarning: (message: string) => void = (m) => console.warn(m),
): ComponentInstance | null {
  if (!isComponentTypeName(type)) {
    onWarning(`[ECS] Unknown component type: ${type}`);
    return null;
  }
  const data: ComponentData =
    props !== null && typeof props === "object" && !Array.isArray(props) ? (props as ComponentData) : {};
  return (FACTORIES[type] as Factory<ComponentInstance>)(data);
}
