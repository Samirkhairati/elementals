import {
  DEFAULT_MODE,
  RUN_SPEED_MULTIPLIER,
  clipPlayback,
  effectiveFps,
  resolveClip,
  sheetPivot,
  type Activity,
} from "@shared/engine/index.ts";
import { System } from "../System";
import type { World } from "../World";
import type { Entity } from "../Entity";
import { AnimatorComponent } from "../components/AnimatorComponent";
import { SpriteComponent } from "../components/SpriteComponent";
import { GridMovementComponent } from "../components/GridMovementComponent";
import { FreeMovementComponent } from "../components/FreeMovementComponent";
import { MoveRouteComponent } from "../components/MoveRouteComponent";
import { MovementType } from "@/utils/Direction";
import { settingsStore } from "@/core/SettingsStore";
import { explicitClipName } from "@/sprites/animatorOps";

/**
 * Chooses what every sprite plays (docs/database-and-characters-spec.md §10.1). Per entity:
 *  1. facing, activity (idle / walk / run) and movement speed come from the movement component that
 *     actually moves the entity (grid in tile mode or while a move route runs, free movement otherwise);
 *  2. the clip is the explicit one (`playAnimation`, `Sprite.animation`) or, when none, the character's
 *     binding for `<mode>.<activity>` (`resolveClip`);
 *  3. that clip + facing give the Phaser animation key (`sprite:<id>:<clip>-<facing>`) and whether the
 *     frames are drawn mirrored; the render bridge plays it;
 *  4. `timeScale` = effective fps / authored fps, so speed changes need no re-registration.
 */
export class AnimationSystem extends System {
  public priority = 400;

  public update(world: World, _delta: number): void {
    const isTileBased = settingsStore.tileBasedMovement;

    for (const [entity, a] of world.view(AnimatorComponent)) {
      const grid = world.getComponent(entity, GridMovementComponent);
      const free = world.getComponent(entity, FreeMovementComponent);
      const routed = world.getComponent(entity, MoveRouteComponent)?.active ?? false;

      const useGrid = !!grid && (isTileBased || routed || !free);
      if (useGrid && grid) {
        a.facing = grid.direction;
        // Between two steps of a route the entity is still walking.
        a.isMoving = grid.isMoving || routed;
        a.movementType = grid.movementType;
        a.entitySpeed = grid.movementType === MovementType.RUN ? grid.speed * RUN_SPEED_MULTIPLIER : grid.speed;
      } else if (free) {
        a.facing = free.direction;
        a.isMoving = free.isMoving;
        a.movementType = free.movementType;
        a.entitySpeed = free.isRunning ? free.speed * RUN_SPEED_MULTIPLIER : free.speed;
      }

      const activity: Activity = a.isMoving ? (a.movementType === MovementType.RUN ? "run" : "walk") : "idle";
      a.activity = activity;
      this.choose(a);
      this.alignPivot(world, entity, a);
    }
  }

  /** A clip on a sheet with its own pivot (a bigger attack frame) draws around that pivot. */
  private alignPivot(world: World, entity: Entity, a: AnimatorComponent): void {
    if (!a.def || a.currentClip === null) return;
    const sprite = world.getComponent(entity, SpriteComponent);
    const clip = a.def.clips[a.currentClip];
    if (!sprite || !clip) return;
    const pivot = sheetPivot(a.def, clip.sheet);
    sprite.originX = pivot.x;
    sprite.originY = pivot.y;
  }

  /** Fills currentClip / currentAnimKey / flipX / timeScale from the animator's inputs. */
  private choose(a: AnimatorComponent): void {
    const def = a.def;
    const mode = a.mode || DEFAULT_MODE;
    const clipName = !def
      ? null
      : a.explicitClip !== null
        ? explicitClipName(def, mode, a.explicitClip)
        : resolveClip(def, mode, a.activity);
    const playback = def && clipName !== null ? clipPlayback(a.characterId, def, clipName, a.facing) : null;

    if (!playback || clipName === null || !def) {
      a.currentClip = null;
      a.currentAnimKey = "";
      a.flipX = false;
      a.timeScale = 1;
      // Nothing can play: a waiting `playAnimation` must not hang.
      if (a.oneShot) {
        const shot = a.oneShot;
        a.oneShot = null;
        shot.resolve();
      }
      return;
    }

    const override = a.clipSpeeds[clipName] ?? a.clipSpeeds["*"];
    const authored = playback.clip;
    const speed = a.animSpeed * a.playSpeed * (override?.scale ?? 1);
    const fps =
      override?.fps !== undefined
        ? override.fps * a.animSpeed * a.playSpeed
        : effectiveFps(authored, a.entitySpeed, speed);

    a.currentClip = clipName;
    a.currentAnimKey = playback.key;
    a.flipX = playback.flipX;
    a.timeScale = authored.fps > 0 ? fps / authored.fps : 1;
  }
}
