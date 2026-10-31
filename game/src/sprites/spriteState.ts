import {
  characterFrameIndex,
  objectAnimKey,
  spriteTextureKey,
  type Facing,
  type SpriteProps,
} from "@shared/engine/index.ts";
import type { SpriteRegistry } from "@/data/spriteRegistry";
import type { World } from "@/ecs/World";
import type { Entity } from "@/ecs/Entity";
import { SpriteComponent } from "@/ecs/components/SpriteComponent";
import { AnimationComponent } from "@/ecs/components/AnimationComponent";
import { GridMovementComponent } from "@/ecs/components/GridMovementComponent";
import { FreeMovementComponent } from "@/ecs/components/FreeMovementComponent";

/** '#rrggbb' -> 0xrrggbb, '' / invalid -> undefined (no tint). */
export function hexToTint(hex: string): number | undefined {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? parseInt(hex.slice(1), 16) : undefined;
}

export type PhaseName = "idle" | "walk" | "run";

function forcedPhaseOf(animation: string): PhaseName | null {
  return animation === "idle" || animation === "walk" || animation === "run" ? animation : null;
}

export interface BuiltSprite {
  sprite: SpriteComponent;
  /** Present for `character` assets. */
  animation: AnimationComponent | null;
}

export type BuildSpriteResult = { ok: true; value: BuiltSprite } | { ok: false; reason: string };

/**
 * Runtime Sprite components for a Sprite props object.
 * Empty asset -> ok with an empty-texture sprite is NOT created: callers check `props.asset` first.
 */
export function buildSpriteComponents(props: SpriteProps, registry: SpriteRegistry): BuildSpriteResult {
  const meta = registry.meta(props.asset);
  if (!meta) return { ok: false, reason: `unknown sprite asset "${props.asset}"` };

  const common = {
    assetId: props.asset,
    originX: meta.pivotX,
    originY: meta.pivotY,
    offsetX: props.offsetX,
    offsetY: props.offsetY,
    scale: props.scale,
    flipX: props.flipX,
    tint: hexToTint(props.tint),
    alpha: props.opacity,
    visible: props.visible,
  };

  if (meta.kind === "character" && meta.character) {
    const sprite = new SpriteComponent({
      ...common,
      texture: spriteTextureKey(props.asset, "walk"),
      frame: characterFrameIndex(meta, props.facing, "idle", 0),
    });
    const animation = new AnimationComponent({
      assetId: props.asset,
      direction: props.facing,
      hasRun: !!meta.character.sheets.run,
      forcedPhase: forcedPhaseOf(props.animation),
    });
    return { ok: true, value: { sprite, animation } };
  }

  const named = props.animation && meta.animations && Object.hasOwn(meta.animations, props.animation) ? props.animation : undefined;
  const sprite = new SpriteComponent({
    ...common,
    texture: spriteTextureKey(props.asset, "sheet"),
    frame: Math.max(0, Math.round(props.frame)),
    animKey: named ? objectAnimKey(props.asset, named) : undefined,
  });
  return { ok: true, value: { sprite, animation: null } };
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
    world.removeComponent(entity, AnimationComponent);
    return true;
  }
  const built = buildSpriteComponents(props, registry);
  if (!built.ok) {
    warn(`[Sprite] ${built.reason}`);
    return false;
  }
  const { sprite, animation } = built.value;

  const existing = world.getComponent(entity, SpriteComponent);
  if (existing) {
    const restart = sprite.animKey !== existing.animKey;
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
      animKey: sprite.animKey,
    });
    if (restart) existing.animRevision++;
  } else {
    world.addComponent(entity, sprite);
  }

  const existingAnim = world.getComponent(entity, AnimationComponent);
  if (animation) {
    if (existingAnim) {
      existingAnim.assetId = animation.assetId;
      existingAnim.hasRun = animation.hasRun;
      existingAnim.forcedPhase = animation.forcedPhase;
      existingAnim.direction = animation.direction;
    } else {
      world.addComponent(entity, animation);
    }
  } else if (existingAnim) {
    world.removeComponent(entity, AnimationComponent);
  }
  return true;
}

/** Current facing of an entity (movement component first, then its character animation). */
export function getEntityFacing(world: World, entity: Entity): Facing | undefined {
  return (
    world.getComponent(entity, GridMovementComponent)?.direction ??
    world.getComponent(entity, FreeMovementComponent)?.direction ??
    world.getComponent(entity, AnimationComponent)?.direction
  );
}

/** Turns an entity: updates every component that stores a facing so the animation follows at once. */
export function setEntityFacing(world: World, entity: Entity, facing: Facing): void {
  const grid = world.getComponent(entity, GridMovementComponent);
  if (grid) grid.direction = facing;
  const free = world.getComponent(entity, FreeMovementComponent);
  if (free) free.direction = facing;
  const anim = world.getComponent(entity, AnimationComponent);
  if (anim) anim.direction = facing;
}
