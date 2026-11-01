import {
  isFacing,
  type CommandTarget,
  type Facing,
  type RouteStep,
  type SpriteProps,
  createDefaultComponent,
} from "@shared/engine/index.ts";
import type { World } from "@/ecs/World";
import type { Entity } from "@/ecs/Entity";
import { TransformComponent } from "@/ecs/components/TransformComponent";
import { SpriteComponent } from "@/ecs/components/SpriteComponent";
import { AnimatorComponent } from "@/ecs/components/AnimatorComponent";
import { FreeMovementComponent } from "@/ecs/components/FreeMovementComponent";
import { AIWanderComponent } from "@/ecs/components/AIWanderComponent";
import { GridMovementComponent } from "@/ecs/components/GridMovementComponent";
import { PlayerControlComponent } from "@/ecs/components/PlayerControlComponent";
import { EntityInfoComponent } from "@/ecs/components/EntityInfoComponent";
import { MoveRouteComponent, type RouteRequest } from "@/ecs/components/MoveRouteComponent";
import type { SpriteRegistry } from "@/data/spriteRegistry";
import { applySpriteProps, getEntityFacing, setEntityFacing } from "@/sprites/spriteState";
import { playClip, setClipSpeed, stopClip, type PlayHandle, type SpeedChange } from "@/sprites/animatorOps";
import type { AppearanceOverrides, AppearancePersist } from "./AppearanceOverrides";
import type { EntityOps, PlayAnimationOptions, RouteOutcome } from "./types";

function tintToHex(tint: number | undefined): string {
  return tint === undefined ? "" : `#${(tint & 0xffffff).toString(16).padStart(6, "0")}`;
}

/** Entity-facing services of the event commands, implemented on the ECS world. */
export class WorldEntityOps implements EntityOps {
  private readonly world: World;
  private readonly sprites: SpriteRegistry;
  private readonly warn: (message: string) => void;
  private readonly appearance?: AppearanceOverrides;
  private readonly getMapId: () => string;
  private readonly ensureCharacter?: (id: string) => void;

  constructor(
    world: World,
    sprites: SpriteRegistry,
    warn: (message: string) => void = (m) => console.warn(m),
    appearance?: AppearanceOverrides,
    getMapId: () => string = () => "",
    ensureCharacter?: (id: string) => void,
  ) {
    this.world = world;
    this.sprites = sprites;
    this.warn = warn;
    this.appearance = appearance;
    this.getMapId = getMapId;
    this.ensureCharacter = ensureCharacter;
  }

  public findPlayer(): Entity | undefined {
    return this.world.query(PlayerControlComponent)[0];
  }

  public findByEditorId(editorId: string): Entity | undefined {
    for (const [entity, info] of this.world.view(EntityInfoComponent)) {
      if (info.editorId === editorId) return entity;
    }
    return undefined;
  }

  public resolve(target: CommandTarget, self: Entity): Entity | undefined {
    if (target === "self") return this.world.isAlive(self) ? self : undefined;
    if (target === "player") return this.findPlayer();
    return this.findByEditorId(target.entity);
  }

  public setFacing(entity: Entity, facing: Facing): void {
    setEntityFacing(this.world, entity, facing);
  }

  public faceTowards(entity: Entity, other: Entity): boolean {
    const a = this.world.getComponent(entity, TransformComponent);
    const b = this.world.getComponent(other, TransformComponent);
    if (!a || !b) return false;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) return false;
    const facing: Facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    setEntityFacing(this.world, entity, facing);
    return true;
  }

  public moveRoute(entity: Entity, steps: RouteStep[], signal?: AbortSignal): Promise<RouteOutcome> {
    return new Promise<RouteOutcome>((resolve) => {
      if (!this.world.isAlive(entity) || steps.length === 0 || signal?.aborted) {
        resolve({ completed: false, blocked: 0 });
        return;
      }
      // Entities without Movement can still be moved by a route (e.g. a statue sliding aside).
      if (!this.world.hasComponent(entity, GridMovementComponent)) {
        this.world.addComponent(entity, new GridMovementComponent({ speed: 100, direction: getEntityFacing(this.world, entity) ?? "down" }));
      }
      let route = this.world.getComponent(entity, MoveRouteComponent);
      if (!route) route = this.world.addComponent(entity, new MoveRouteComponent());
      const queue = route;

      let onAbort: (() => void) | undefined;
      const request: RouteRequest = {
        steps,
        index: 0,
        phase: "idle",
        timer: 0,
        blocked: 0,
        resolve: (result) => {
          if (onAbort) signal?.removeEventListener("abort", onAbort);
          resolve(result);
        },
      };
      onAbort = () => {
        const i = queue.queue.indexOf(request);
        if (i >= 0) queue.queue.splice(i, 1);
        if (i === 0) {
          const grid = this.world.getComponent(entity, GridMovementComponent);
          if (grid) {
            grid.pendingDirection = null;
            grid.holdDuration = 0;
          }
        }
        request.resolve({ completed: false, blocked: request.blocked });
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      queue.queue.push(request);
    });
  }

  public setVisible(entity: Entity, visible: boolean): boolean {
    const sprite = this.world.getComponent(entity, SpriteComponent);
    if (!sprite) return false;
    sprite.visible = visible;
    return true;
  }

  /** The sprite props an entity currently shows (for edits that keep everything but the asset). */
  public readSpriteProps(entity: Entity): SpriteProps {
    const sprite = this.world.getComponent(entity, SpriteComponent);
    const animator = this.world.getComponent(entity, AnimatorComponent);
    const base = createDefaultComponent("Sprite");
    if (!sprite) return { ...base, facing: getEntityFacing(this.world, entity) ?? base.facing };
    return {
      asset: sprite.assetId,
      facing: getEntityFacing(this.world, entity) ?? "down",
      animation: animator?.explicitClip ?? "",
      animSpeed: animator?.animSpeed ?? 1,
      frame: typeof sprite.frame === "number" ? sprite.frame : 0,
      offsetX: sprite.offsetX,
      offsetY: sprite.offsetY,
      scale: sprite.scale,
      flipX: sprite.flipX,
      tint: tintToHex(sprite.tint),
      opacity: sprite.alpha,
      visible: sprite.visible,
    };
  }

  public changeSprite(entity: Entity, asset: string, animation: string, persist: AppearancePersist = "state"): boolean {
    const ok = this.swapCharacter(entity, asset, animation);
    if (ok && persist !== "state" && this.appearance) {
      const editorId = this.world.getComponent(entity, EntityInfoComponent)?.editorId;
      if (editorId) {
        const isPlayer = this.world.hasComponent(entity, PlayerControlComponent);
        this.appearance.set(this.getMapId(), editorId, { asset, animation, persist }, persist === "forever" && isPlayer);
      }
    }
    return ok;
  }

  /** Re-applies the stored override (map / forever) of an entity, e.g. after its event state changed or it spawned. */
  public applyStoredAppearance(entity: Entity): boolean {
    const editorId = this.world.getComponent(entity, EntityInfoComponent)?.editorId;
    const stored = editorId ? this.appearance?.get(this.getMapId(), editorId) : undefined;
    if (!stored) return false;
    return this.swapCharacter(entity, stored.asset, stored.animation);
  }

  /** A character swap keeps facing, activity and mode; an explicit clip is dropped unless `animation` names one. */
  private swapCharacter(entity: Entity, asset: string, animation: string): boolean {
    const current = this.readSpriteProps(entity);
    const facing = current.facing;
    // A character nobody asked for yet is loaded now; its graphic shows as soon as the texture arrives.
    if (asset) this.ensureCharacter?.(asset);
    const before = this.world.getComponent(entity, AnimatorComponent)?.def?.profile;
    const after = this.sprites.character(asset)?.profile;
    if (before && after && before !== after) this.warn(`[Event] changeSprite: "${asset}" is a "${after}" character but this one is "${before}"; animations may not match`);
    const ok = applySpriteProps(this.world, entity, { ...current, asset, animation, frame: 0 }, this.sprites, this.warn);
    if (ok && isFacing(facing)) setEntityFacing(this.world, entity, facing);
    return ok;
  }

  public playAnimation(entity: Entity, animation: string, options: PlayAnimationOptions = {}): PlayHandle | null {
    const animator = this.world.getComponent(entity, AnimatorComponent);
    return animator ? playClip(animator, animation, options) : null;
  }

  public stopAnimation(entity: Entity): boolean {
    const animator = this.world.getComponent(entity, AnimatorComponent);
    if (!animator) return false;
    stopClip(animator);
    return true;
  }

  public setAnimationSpeed(entity: Entity, change: SpeedChange): boolean {
    const animator = this.world.getComponent(entity, AnimatorComponent);
    if (!animator) return false;
    setClipSpeed(animator, change);
    return true;
  }

  public setMovementMode(entity: Entity, mode: string): boolean {
    const animator = this.world.getComponent(entity, AnimatorComponent);
    if (!animator || !/^[A-Za-z0-9_-]+$/.test(mode)) return false;
    animator.mode = mode;
    return true;
  }

  public setMoveSpeed(entity: Entity, speed: number): boolean {
    if (!Number.isFinite(speed) || speed <= 0) return false;
    const grid = this.world.getComponent(entity, GridMovementComponent);
    const free = this.world.getComponent(entity, FreeMovementComponent);
    if (!grid && !free) return false;
    if (grid) grid.speed = speed;
    if (free) free.speed = speed;
    // A wandering NPC applies its own speed to the grid on every step.
    const wander = this.world.getComponent(entity, AIWanderComponent);
    if (wander) wander.speed = speed;
    return true;
  }
}
