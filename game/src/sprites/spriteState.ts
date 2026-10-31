import {
  DEFAULT_MODE,
  clipFrames,
  resolveClip,
  sheetPivot,
  spriteTextureKey,
  staticSheetKey,
  type CharacterDef,
  type Facing,
  type SpriteProps,
} from "@shared/engine/index.ts";
import type { SpriteRegistry } from "@/data/spriteRegistry";
import type { World } from "@/ecs/World";
import type { Entity } from "@/ecs/Entity";
import { SpriteComponent } from "@/ecs/components/SpriteComponent";
import { AnimatorComponent } from "@/ecs/components/AnimatorComponent";
import { GridMovementComponent } from "@/ecs/components/GridMovementComponent";
import { FreeMovementComponent } from "@/ecs/components/FreeMovementComponent";
import { explicitClipName } from "./animatorOps";

/** '#rrggbb' -> 0xrrggbb, '' / invalid -> undefined (no tint). */
export function hexToTint(hex: string): number | undefined {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? parseInt(hex.slice(1), 16) : undefined;
}

export interface BuiltSprite {
  sprite: SpriteComponent;
  animator: AnimatorComponent;
}

export type BuildSpriteResult = { ok: true; value: BuiltSprite } | { ok: false; reason: string };

/** Texture and frame a character shows before (or without) a clip playing. */
function staticAppearance(id: string, def: CharacterDef, props: SpriteProps): { sheet: string; texture: string; frame: number } | null {
  // A four-facing character stands on the first frame of its idle clip for the facing it looks at.
  const idle = def.facing === "four" ? resolveClip(def, DEFAULT_MODE, "idle") : null;
  if (idle !== null) {
    const clip = def.clips[idle];
    const frames = clipFrames(clip, props.facing);
    if (frames) return { sheet: clip.sheet, texture: spriteTextureKey(id, clip.sheet), frame: frames.frames[0] };
  }
  const sheet = staticSheetKey(def);
  if (sheet === undefined) return null;
  const wanted = Math.max(0, Math.round(Number.isFinite(props.frame) ? props.frame : 0));
  return { sheet, texture: spriteTextureKey(id, sheet), frame: wanted > 0 ? wanted : def.still?.sheet === sheet ? def.still.frame : 0 };
}

/**
 * Runtime Sprite + Animator components for a Sprite props object.
 * Empty asset -> ok with an empty-texture sprite is NOT created: callers check `props.asset` first.
 */
export function buildSpriteComponents(props: SpriteProps, registry: SpriteRegistry): BuildSpriteResult {
  const def = registry.character(props.asset);
  if (!def) return { ok: false, reason: `unknown sprite asset "${props.asset}"` };
  const shown = staticAppearance(props.asset, def, props);
  if (!shown) return { ok: false, reason: `sprite asset "${props.asset}" has no sheets` };

  const pivot = sheetPivot(def, shown.sheet);
  const sprite = new SpriteComponent({
    assetId: props.asset,
    texture: shown.texture,
    frame: shown.frame,
    originX: pivot.x,
    originY: pivot.y,
    offsetX: props.offsetX,
    offsetY: props.offsetY,
    scale: props.scale,
    flipX: props.flipX,
    tint: hexToTint(props.tint),
    alpha: props.opacity,
    visible: props.visible,
  });
  const animator = new AnimatorComponent({
    characterId: props.asset,
    def,
    facing: props.facing,
    explicitClip: props.animation !== "" && explicitClipName(def, DEFAULT_MODE, props.animation) !== null ? props.animation : null,
    animSpeed: props.animSpeed,
  });
  return { ok: true, value: { sprite, animator } };
}

/**
 * Applies Sprite props to an entity in place (components are created, updated or removed so the render
 * bridge keeps its Phaser object). Returns false and leaves the entity untouched when the asset is unknown.
 * An empty asset removes the graphic.
 */
export function applySpriteProps(
  world: World,
  entity: Entity,
  props: SpriteProps,
  registry: SpriteRegistry,
  warn: (message: string) => void = (m) => console.warn(m),
): boolean {
  if (props.asset === "") {
    world.removeComponent(entity, SpriteComponent);
    world.removeComponent(entity, AnimatorComponent);
    return true;
  }
  const built = buildSpriteComponents(props, registry);
  if (!built.ok) {
    warn(`[Sprite] ${built.reason}`);
    return false;
  }
  const { sprite, animator } = built.value;

  const existing = world.getComponent(entity, SpriteComponent);
  if (existing) {
    Object.assign(existing, {
      texture: sprite.texture,
      frame: sprite.frame,
      originX: sprite.originX,
      originY: sprite.originY,
      offsetX: sprite.offsetX,
      offsetY: sprite.offsetY,
      scale: sprite.scale,
      visible: sprite.visible,
      alpha: sprite.alpha,
      flipX: sprite.flipX,
      tint: sprite.tint,
      assetId: sprite.assetId,
    });
  } else {
    world.addComponent(entity, sprite);
  }

  const current = world.getComponent(entity, AnimatorComponent);
  if (current) {
    // Facing, activity and movement mode survive a character swap; clips and speeds belong to the character.
    const swapped = current.characterId !== animator.characterId;
    if (swapped || current.explicitClip !== animator.explicitClip) {
      current.oneShot?.resolve();
      current.oneShot = null;
      current.revision++;
    }
    if (swapped) current.clipSpeeds = {};
    current.characterId = animator.characterId;
    current.def = animator.def;
    current.explicitClip = animator.explicitClip;
    current.animSpeed = animator.animSpeed;
    current.playSpeed = 1;
    current.facing = animator.facing;
  } else {
    world.addComponent(entity, animator);
  }
  return true;
}

/** Current facing of an entity (movement component first, then its animator). */
export function getEntityFacing(world: World, entity: Entity): Facing | undefined {
  return (
    world.getComponent(entity, GridMovementComponent)?.direction ??
    world.getComponent(entity, FreeMovementComponent)?.direction ??
    world.getComponent(entity, AnimatorComponent)?.facing
  );
}

/** Turns an entity: updates every component that stores a facing so the animation follows at once. */
export function setEntityFacing(world: World, entity: Entity, facing: Facing): void {
  const grid = world.getComponent(entity, GridMovementComponent);
  if (grid) grid.direction = facing;
  const free = world.getComponent(entity, FreeMovementComponent);
  if (free) free.direction = facing;
  const animator = world.getComponent(entity, AnimatorComponent);
  if (animator) animator.facing = facing;
}
