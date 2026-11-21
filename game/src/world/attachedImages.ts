// Pictures inside an entity (the export gives them a `parent`) travel with it: each frame they keep the offset from
// the entity's anchor they had when the map loaded, turn with the entity's sprite and hide while it is hidden. When the
// entity has a sprite they draw just above it (in their own order), so a hat stays on the head however the NPC sorts.

import { System } from "@/ecs/System";
import type { World } from "@/ecs/World";
import type { Entity } from "@/ecs/Entity";
import { TransformComponent } from "@/ecs/components/TransformComponent";
import { SpriteComponent } from "@/ecs/components/SpriteComponent";
import { entitiesById, entityShown, rotateAround } from "@/ecs/systems/ParentFollowSystem";
import type { ImageObject, ImageObjectDef } from "./imageLayers";

/** Depth steps above the parent's sprite, one per attached picture (far below the gap between two depths in use). */
const DEPTH_STEP = 1e-4;

interface Attachment {
  image: ImageObject;
  def: ImageObjectDef;
  /** Offset from the parent's anchor and the parent's angle when it was first found. */
  dx?: number;
  dy?: number;
  angle0?: number;
  /** Order among the pictures of the same parent. */
  order: number;
}

export interface AttachedImagesOptions {
  /** The pictures of the map shown now (ImageLayerRenderer.items). */
  items: () => readonly { image: ImageObject; def: ImageObjectDef }[];
  /** The depth of an entity's drawn sprite, when it has one (RenderBridgeSystem). */
  spriteDepth?: (entity: Entity) => number | undefined;
}

/**
 * Keeps the pictures inside entities on their entity. Runs after the RenderBridgeSystem (1000) so the entity's sprite
 * depth of this frame is known.
 */
export class AttachedImagesSystem extends System {
  public priority = 1010;
  private readonly options: AttachedImagesOptions;
  private source: readonly { image: ImageObject; def: ImageObjectDef }[] | null = null;
  private attached: Attachment[] = [];

  constructor(options: AttachedImagesOptions) {
    super();
    this.options = options;
  }

  /** The pictures being carried (tests, debug). */
  public get count(): number {
    return this.attached.length;
  }

  public update(world: World, _delta: number): void {
    const items = this.options.items();
    if (items !== this.source) this.rebuild(items);
    if (this.attached.length === 0) return;
    const byId = entitiesById(world);
    for (const a of this.attached) {
      const parent = byId.get(a.def.parent!);
      const t = parent === undefined ? undefined : world.getComponent(parent, TransformComponent);
      if (parent === undefined || !t) {
        // The entity is gone (erased): its pictures go with it.
        if (a.image.visible !== false) a.image.setVisible?.(false);
        continue;
      }
      const angle = world.getComponent(parent, SpriteComponent)?.angle ?? 0;
      if (a.dx === undefined || a.dy === undefined || a.angle0 === undefined) {
        a.dx = a.def.x - t.x;
        a.dy = a.def.y - t.y;
        a.angle0 = angle;
      }
      const turn = angle - a.angle0;
      const p = rotateAround(t.x + a.dx, t.y + a.dy, t.x, t.y, turn);
      if (a.image.x !== p.x || a.image.y !== p.y) a.image.setPosition?.(p.x, p.y);
      const deg = a.def.rotation + turn;
      if ((a.image.angle ?? 0) !== deg) a.image.setAngle?.(deg);
      const shown = entityShown(world, parent);
      if (a.image.visible !== shown) a.image.setVisible?.(shown);
      const base = this.options.spriteDepth?.(parent);
      if (base !== undefined) {
        const depth = base + DEPTH_STEP * (a.order + 1);
        if (a.image.depth !== depth) a.image.setDepth(depth);
      }
    }
  }

  private rebuild(items: readonly { image: ImageObject; def: ImageObjectDef }[]): void {
    this.source = items;
    const perParent = new Map<string, number>();
    this.attached = items.flatMap(({ image, def }) => {
      if (!def.parent) return [];
      // Their draw order among themselves: the layer order, then the order in the layer (as the renderer made them).
      const order = perParent.get(def.parent) ?? 0;
      perParent.set(def.parent, order + 1);
      return [{ image, def, order }];
    });
  }
}
