import { Scene, GameObjects } from "phaser";
import { System } from "../System";
import type { World } from "../World";
import type { Entity } from "../Entity";
import { TransformComponent } from "../components/TransformComponent";
import { SpriteComponent } from "../components/SpriteComponent";
import { AnimationComponent } from "../components/AnimationComponent";

/**
 * Mirrors ECS Transform + Sprite (+ Animation) onto Phaser sprites.
 *
 * Position = Transform anchor + Sprite offset, origin = the asset pivot. What the sprite shows:
 *  - entity has an AnimationComponent (character asset): the animation key the AnimationSystem chose;
 *  - else `SpriteComponent.animKey` (object / animated asset animation): played, restarted when
 *    `animRevision` changes;
 *  - else the static frame.
 * Sprites with an empty or not yet loaded texture are skipped (no graphic, no crash).
 */
export class RenderBridgeSystem extends System {
  public priority = 1000; // Run after simulation/physics systems
  private scene: Scene;
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
    const entries = world.view(TransformComponent, SpriteComponent);
    const activeEntities = new Set<Entity>();

    for (const [entity, transform, spriteComp] of entries) {
      if (!spriteComp.texture || !this.scene.textures.exists(spriteComp.texture)) continue;
      activeEntities.add(entity);
      let sprite = this.spriteMap.get(entity);
      const anim = world.getComponent(entity, AnimationComponent);

      const x = transform.x + spriteComp.offsetX;
      const y = transform.y + spriteComp.offsetY;

      if (!sprite) {
        sprite = this.scene.add.sprite(x, y, spriteComp.texture, spriteComp.frame);
        sprite.setOrigin(spriteComp.originX, spriteComp.originY);
        sprite.setDepth(transform.depth);
        sprite.setVisible(spriteComp.visible);
        sprite.setAlpha(spriteComp.alpha);
        sprite.setFlipX(spriteComp.flipX);
        sprite.setScale(spriteComp.scale);
        if (spriteComp.tint !== undefined) sprite.setTint(spriteComp.tint);
        this.spriteMap.set(entity, sprite);
        this.revisions.set(entity, spriteComp.animRevision);

        if (anim && anim.currentAnimKey) {
          this.playIfExists(sprite, anim.currentAnimKey, true);
        } else if (spriteComp.animKey) {
          this.playIfExists(sprite, spriteComp.animKey, false);
        }
        continue;
      }

      // Value-checked synchronization to avoid dirtying Phaser transform when unchanged
      if (sprite.x !== x || sprite.y !== y) sprite.setPosition(x, y);
      if (sprite.depth !== transform.depth) sprite.setDepth(transform.depth);
      if (sprite.visible !== spriteComp.visible) sprite.setVisible(spriteComp.visible);
      if (sprite.alpha !== spriteComp.alpha) sprite.setAlpha(spriteComp.alpha);
      if (sprite.flipX !== spriteComp.flipX) sprite.setFlipX(spriteComp.flipX);
      if (sprite.scaleX !== spriteComp.scale) sprite.setScale(spriteComp.scale);
      if (sprite.originX !== spriteComp.originX || sprite.originY !== spriteComp.originY) {
        sprite.setOrigin(spriteComp.originX, spriteComp.originY);
      }
      if (spriteComp.tint === undefined) {
        if (sprite.isTinted) sprite.clearTint();
      } else if (sprite.tintTopLeft !== spriteComp.tint || !sprite.isTinted) {
        sprite.setTint(spriteComp.tint);
      }

      if (anim) {
        if (anim.currentAnimKey && sprite.anims.currentAnim?.key !== anim.currentAnimKey) {
          this.playIfExists(sprite, anim.currentAnimKey, true);
        }
      } else if (spriteComp.animKey) {
        const restart = this.revisions.get(entity) !== spriteComp.animRevision;
        if (restart || sprite.anims.currentAnim?.key !== spriteComp.animKey) {
          this.revisions.set(entity, spriteComp.animRevision);
          this.playIfExists(sprite, spriteComp.animKey, !restart);
        }
      } else {
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
