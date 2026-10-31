import type { Scene, GameObjects } from "phaser";
import { System } from "../System";
import type { World } from "../World";
import type { Entity } from "../Entity";
import { TransformComponent } from "../components/TransformComponent";
import { SpriteComponent } from "../components/SpriteComponent";
import { AnimatorComponent } from "../components/AnimatorComponent";
import { completeClip } from "@/sprites/animatorOps";

/** Phaser.Animations.Events.ANIMATION_COMPLETE (a literal: the pure tests run without Phaser). */
const ANIMATION_COMPLETE = "animationcomplete";

/**
 * Mirrors ECS Transform + Sprite (+ Animator) onto Phaser sprites.
 *
 * Position = Transform anchor + Sprite offset, origin = the character pivot. What the sprite shows:
 *  - entity has an Animator that chose an animation: that key, restarted when the animator's `revision`
 *    changes, at `anims.timeScale = effective fps / authored fps`, flipped when the facing is mirrored
 *    (XOR the authored `flipX`); a finished one-shot is reported back to the animator;
 *  - else the static texture + frame (the character's `still` / authored `Sprite.frame`).
 * Sprites with an empty or not yet loaded texture are skipped (no graphic, no crash).
 */
export class RenderBridgeSystem extends System {
  public priority = 1000; // Run after simulation/physics systems
  private scene: Scene;
  private world: World | null = null;
  private spriteMap: Map<Entity, GameObjects.Sprite> = new Map();
  private revisions: Map<Entity, number> = new Map();
  private warnedAnimations: Set<string> = new Set();

  constructor(scene: Scene) {
    super();
    this.scene = scene;
  }

  public getSprite(entity: Entity): GameObjects.Sprite | undefined {
    return this.spriteMap.get(entity);
  }

  public update(world: World, _delta: number): void {
    this.world = world;
    const entries = world.view(TransformComponent, SpriteComponent);
    const activeEntities = new Set<Entity>();

    for (const [entity, transform, spriteComp] of entries) {
      if (!spriteComp.texture || !this.scene.textures.exists(spriteComp.texture)) continue;
      activeEntities.add(entity);
      let sprite = this.spriteMap.get(entity);
      const animator = world.getComponent(entity, AnimatorComponent);
      const flipX = spriteComp.flipX !== (animator?.flipX ?? false);

      const x = transform.x + spriteComp.offsetX;
      const y = transform.y + spriteComp.offsetY;

      if (!sprite) {
        sprite = this.scene.add.sprite(x, y, spriteComp.texture, spriteComp.frame);
        sprite.setOrigin(spriteComp.originX, spriteComp.originY);
        sprite.setDepth(transform.depth);
        sprite.setVisible(spriteComp.visible);
        sprite.setAlpha(spriteComp.alpha);
        sprite.setFlipX(flipX);
        sprite.setScale(spriteComp.scale);
        if (spriteComp.tint !== undefined) sprite.setTint(spriteComp.tint);
        this.spriteMap.set(entity, sprite);
        sprite.on(ANIMATION_COMPLETE, (animation: { key: string }) => this.onAnimationComplete(entity, animation.key));

        if (animator) {
          this.revisions.set(entity, animator.revision);
          if (animator.currentAnimKey) {
            this.playIfExists(sprite, animator.currentAnimKey, false);
            this.applyTimeScale(sprite, animator);
          }
        }
        continue;
      }

      // Value-checked synchronization to avoid dirtying Phaser transform when unchanged
      if (sprite.x !== x || sprite.y !== y) sprite.setPosition(x, y);
      if (sprite.depth !== transform.depth) sprite.setDepth(transform.depth);
      if (sprite.visible !== spriteComp.visible) sprite.setVisible(spriteComp.visible);
      if (sprite.alpha !== spriteComp.alpha) sprite.setAlpha(spriteComp.alpha);
      if (sprite.flipX !== flipX) sprite.setFlipX(flipX);
      if (sprite.scaleX !== spriteComp.scale) sprite.setScale(spriteComp.scale);
      if (sprite.originX !== spriteComp.originX || sprite.originY !== spriteComp.originY) {
        sprite.setOrigin(spriteComp.originX, spriteComp.originY);
      }
      if (spriteComp.tint === undefined) {
        if (sprite.isTinted) sprite.clearTint();
      } else if (sprite.tintTopLeft !== spriteComp.tint || !sprite.isTinted) {
        sprite.setTint(spriteComp.tint);
      }

      if (animator && animator.currentAnimKey) {
        const restart = this.revisions.get(entity) !== animator.revision;
        if (restart || sprite.anims.currentAnim?.key !== animator.currentAnimKey) {
          this.revisions.set(entity, animator.revision);
          // Same key and no restart requested: keep the running animation (ignoreIfPlaying).
          this.playIfExists(sprite, animator.currentAnimKey, !restart);
        }
        this.applyTimeScale(sprite, animator);
      } else {
        if (animator) this.revisions.set(entity, animator.revision);
        if (sprite.anims.isPlaying || sprite.anims.currentAnim) sprite.anims.stop();
        if (sprite.texture.key !== spriteComp.texture) {
          sprite.setTexture(spriteComp.texture, spriteComp.frame);
        } else if (spriteComp.frame !== undefined && sprite.frame.name !== String(spriteComp.frame)) {
          sprite.setFrame(spriteComp.frame);
        }
      }
    }

    // Clean up any sprites whose entity was deleted or components removed
    for (const [entity, sprite] of this.spriteMap.entries()) {
      if (!activeEntities.has(entity)) {
        sprite.destroy();
        this.spriteMap.delete(entity);
        this.revisions.delete(entity);
      }
    }
  }

  private applyTimeScale(sprite: GameObjects.Sprite, animator: AnimatorComponent): void {
    if (sprite.anims.timeScale !== animator.timeScale) sprite.anims.timeScale = animator.timeScale;
  }

  /** A non-looping animation ended: let the animator follow its one-shot's `then` and release waiters. */
  private onAnimationComplete(entity: Entity, key: string): void {
    const animator = this.world?.getComponent(entity, AnimatorComponent);
    if (animator) completeClip(animator, key);
  }

  private playIfExists(sprite: GameObjects.Sprite, key: string, ignoreIfPlaying: boolean): void {
    if (!this.scene.anims.exists(key)) {
      if (!this.warnedAnimations.has(key)) {
        this.warnedAnimations.add(key);
        console.warn(`[Render] animation "${key}" is not registered`);
      }
      return;
    }
    sprite.play(key, ignoreIfPlaying);
  }

  public onEntityDestroyed(_world: World, entity: Entity): void {
    const sprite = this.spriteMap.get(entity);
    if (sprite) {
      sprite.destroy();
      this.spriteMap.delete(entity);
      this.revisions.delete(entity);
    }
  }

  public destroy(_world: World): void {
    for (const sprite of this.spriteMap.values()) {
      sprite.destroy();
    }
    this.spriteMap.clear();
    this.revisions.clear();
  }
}
