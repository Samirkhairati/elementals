import {
  isFacing,
  objectAnimKey,
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
import { AnimationComponent } from "@/ecs/components/AnimationComponent";
import { GridMovementComponent } from "@/ecs/components/GridMovementComponent";
import { PlayerControlComponent } from "@/ecs/components/PlayerControlComponent";
import { EntityInfoComponent } from "@/ecs/components/EntityInfoComponent";
import { MoveRouteComponent, type RouteRequest } from "@/ecs/components/MoveRouteComponent";
import type { SpriteRegistry } from "@/data/spriteRegistry";
import { applySpriteProps, getEntityFacing, setEntityFacing } from "@/sprites/spriteState";
import type { EntityOps, RouteOutcome } from "./types";

function tintToHex(tint: number | undefined): string {
  return tint === undefined ? "" : `#${(tint & 0xffffff).toString(16).padStart(6, "0")}`;
}

/** Entity-facing services of the event commands, implemented on the ECS world. */
export class WorldEntityOps implements EntityOps {
  private readonly world: World;
  private readonly sprites: SpriteRegistry;
  private readonly warn: (message: string) => void;

  constructor(world: World, sprites: SpriteRegistry, warn: (message: string) => void = (m) => console.warn(m)) {
    this.world = world;
    this.sprites = sprites;
    this.warn = warn;
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
    const anim = this.world.getComponent(entity, AnimationComponent);
    const base = createDefaultComponent("Sprite");
    if (!sprite) return { ...base, facing: getEntityFacing(this.world, entity) ?? base.facing };
    const named = sprite.animKey && sprite.assetId ? sprite.animKey.slice(objectAnimKey(sprite.assetId, "").length) : "";
    return {
      asset: sprite.assetId,
      facing: getEntityFacing(this.world, entity) ?? "down",
      animation: anim?.forcedPhase ?? named,
      animSpeed: 1,
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

  public changeSprite(entity: Entity, asset: string, animation: string): boolean {
    const current = this.readSpriteProps(entity);
    const facing = current.facing;
    const ok = applySpriteProps(this.world, entity, { ...current, asset, animation, frame: 0 }, this.sprites, this.warn);
    if (ok && isFacing(facing)) setEntityFacing(this.world, entity, facing);
    return ok;
  }

  public playAnimation(entity: Entity, animation: string): boolean {
    const sprite = this.world.getComponent(entity, SpriteComponent);
    if (!sprite) return false;
    const meta = this.sprites.meta(sprite.assetId);
    if (!meta) return false;
    if (meta.kind === "character") {
      const anim = this.world.getComponent(entity, AnimationComponent);
      if (anim && (animation === "idle" || animation === "walk" || animation === "run")) {
        anim.forcedPhase = animation;
        return true;
      }
      return false;
    }
    if (!meta.animations || !Object.hasOwn(meta.animations, animation)) return false;
    sprite.animKey = objectAnimKey(sprite.assetId, animation);
    sprite.animRevision++;
    return true;
  }
}
