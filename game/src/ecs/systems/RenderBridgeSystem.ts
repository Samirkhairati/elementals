import { Scene, GameObjects } from "phaser";
import { System } from "../System";
import type { World } from "../World";
import type { Entity } from "../Entity";
import { TransformComponent } from "../components/TransformComponent";
import { SpriteComponent } from "../components/SpriteComponent";
import { AnimationComponent } from "../components/AnimationComponent";

export class RenderBridgeSystem extends System {
  public priority = 1000; // Run after simulation/physics systems
  private scene: Scene;
  private spriteMap: Map<Entity, GameObjects.Sprite> = new Map();

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
      activeEntities.add(entity);
      let sprite = this.spriteMap.get(entity);

      if (!sprite) {
        // Instantiate new Phaser Sprite GameObject
        sprite = this.scene.add.sprite(
          transform.x,
          transform.y,
          spriteComp.texture,
          spriteComp.frame
        );
        sprite.setOrigin(spriteComp.originX, spriteComp.originY);
        sprite.setDepth(transform.depth);
        sprite.setVisible(spriteComp.visible);
        sprite.setAlpha(spriteComp.alpha);
        sprite.setFlipX(spriteComp.flipX);
        if (spriteComp.tint !== undefined) {
          sprite.setTint(spriteComp.tint);
        }
        this.spriteMap.set(entity, sprite);

        // Play initial animation if present
        const anim = world.getComponent(entity, AnimationComponent);
        if (anim && anim.currentAnimKey) {
          sprite.play(anim.currentAnimKey, true);
        }
      } else {
        // Value-checked synchronization to avoid dirtying Phaser transform when unchanged
        if (sprite.x !== transform.x || sprite.y !== transform.y) {
          sprite.setPosition(transform.x, transform.y);
        }
        if (sprite.depth !== transform.depth) {
          sprite.setDepth(transform.depth);
        }
        if (sprite.visible !== spriteComp.visible) {
          sprite.setVisible(spriteComp.visible);
        }
        if (sprite.alpha !== spriteComp.alpha) {
          sprite.setAlpha(spriteComp.alpha);
        }
        if (sprite.flipX !== spriteComp.flipX) {
          sprite.setFlipX(spriteComp.flipX);
        }

        // Only manage static frame/texture if entity is NOT driven by character animations
        const anim = world.getComponent(entity, AnimationComponent);
        if (!anim) {
          if (spriteComp.frame !== undefined && sprite.frame.name !== String(spriteComp.frame)) {
            sprite.setFrame(spriteComp.frame);
          }
          if (sprite.texture.key !== spriteComp.texture) {
            sprite.setTexture(spriteComp.texture, spriteComp.frame);
          }
        } else if (anim.currentAnimKey) {
          if (sprite.anims.currentAnim?.key !== anim.currentAnimKey) {
            sprite.play(anim.currentAnimKey, true);
          }
        }
      }
    }

    // Clean up any sprites whose entity was deleted or components removed
    for (const [entity, sprite] of this.spriteMap.entries()) {
      if (!activeEntities.has(entity)) {
        sprite.destroy();
        this.spriteMap.delete(entity);
      }
    }
  }

  public onEntityDestroyed(_world: World, entity: Entity): void {
    const sprite = this.spriteMap.get(entity);
    if (sprite) {
      sprite.destroy();
      this.spriteMap.delete(entity);
    }
  }

  public destroy(_world: World): void {
    for (const sprite of this.spriteMap.values()) {
      sprite.destroy();
    }
    this.spriteMap.clear();
  }
}
