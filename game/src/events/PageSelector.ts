import {
  createDefaultComponent,
  type EventPage,
  type SpriteProps,
} from "@shared/engine/index.ts";
import type { World } from "@/ecs/World";
import type { Entity } from "@/ecs/Entity";
import { EventComponent } from "@/ecs/components/EventComponent";
import { EntityInfoComponent } from "@/ecs/components/EntityInfoComponent";
import { ColliderComponent } from "@/ecs/components/ColliderComponent";
import { SpriteComponent } from "@/ecs/components/SpriteComponent";
import type { SpriteRegistry } from "@/data/spriteRegistry";
import { applySpriteProps, getEntityFacing, setEntityFacing } from "@/sprites/spriteState";
import { evaluateConditions, type ConditionContext } from "./conditions";
import type { GameFlags } from "./GameFlags";
import type { Inventory } from "./Inventory";

/**
 * Index of the active page: the LAST page whose conditions all hold, -1 when none does.
 * Pure: depends only on the pages and the condition context.
 */
export function selectActivePage(pages: readonly EventPage[], ctx: ConditionContext): number {
  for (let i = pages.length - 1; i >= 0; i--) {
    if (evaluateConditions(pages[i].conditions, ctx)) return i;
  }
  return -1;
}

export interface PageSelectorDeps {
  world: World;
  flags: GameFlags;
  inventory: Inventory;
  sprites: SpriteRegistry;
  getMapId: () => string;
  warn?: (message: string) => void;
}

/**
 * Keeps every Event entity on its active page and applies the page's `appearance` and `solid`
 * overrides to the entity:
 *
 *  - appearance fields replace the authored Sprite props (`asset`, `animation`, `frame`, `facing`,
 *    `visible`); omitted fields keep the entity's Sprite. The change goes through the Sprite component
 *    (applySpriteProps) so the render bridge updates the Phaser sprite in place;
 *  - `solid` overrides Collider.isSolid (null = authored value);
 *  - an entity with NO active page is inactive like in RPG Maker: hidden and not solid, no triggers.
 *
 * Overrides are applied when the active page CHANGES (and once on the first evaluation), so runtime
 * tweaks such as `changeSprite` survive until the page changes.
 */
export class PageSelector {
  private readonly deps: PageSelectorDeps;

  constructor(deps: PageSelectorDeps) {
    this.deps = deps;
  }

  private warn(message: string): void {
    (this.deps.warn ?? ((m) => console.warn(m)))(message);
  }

  public conditionContext(entity: Entity): ConditionContext {
    const info = this.deps.world.getComponent(entity, EntityInfoComponent);
    return {
      flags: this.deps.flags,
      inventory: this.deps.inventory,
      mapId: this.deps.getMapId(),
      entityId: info?.editorId ?? `entity#${entity}`,
    };
  }

  /** Re-evaluates one entity. Returns true when its active page changed (or was set for the first time). */
  public refresh(entity: Entity): boolean {
    const ev = this.deps.world.getComponent(entity, EventComponent);
    if (!ev) return false;
    const next = selectActivePage(ev.pages, this.conditionContext(entity));
    if (ev.evaluated && next === ev.activePage) return false;
    ev.evaluated = true;
    ev.activePage = next;
    this.applyPage(entity, ev, next);
    return true;
  }

  /** Re-evaluates every Event entity; returns the ones whose page changed. */
  public refreshAll(): Entity[] {
    const changed: Entity[] = [];
    for (const [entity] of this.deps.world.view(EventComponent)) {
      if (this.refresh(entity)) changed.push(entity);
    }
    return changed;
  }

  private applyPage(entity: Entity, ev: EventComponent, index: number): void {
    const { world } = this.deps;
    const page = index >= 0 ? ev.pages[index] : undefined;

    // solid override
    const collider = world.getComponent(entity, ColliderComponent);
    if (collider) {
      collider.isSolid = page ? (page.solid ?? ev.baseSolid ?? true) : false;
    }

    // appearance override
    const app = page?.appearance ?? {};
    const base = ev.baseSprite;
    const hasSprite = world.hasComponent(entity, SpriteComponent);
    if (!base && !app.asset) return; // nothing to draw and nothing to draw with

    const authored: SpriteProps = base ?? createDefaultComponent("Sprite");
    const overridesAsset = typeof app.asset === "string" && app.asset !== "";
    const facing = app.facing ?? getEntityFacing(world, entity) ?? authored.facing;
    const wanted: SpriteProps = {
      ...authored,
      asset: overridesAsset ? (app.asset as string) : authored.asset,
      animation: app.animation ?? (overridesAsset ? "" : authored.animation),
      frame: app.frame ?? (overridesAsset ? 0 : authored.frame),
      facing,
      visible: page ? (app.visible ?? authored.visible) : false,
    };

    let ok = applySpriteProps(world, entity, wanted, this.deps.sprites, (m) => this.warn(m));
    if (!ok && overridesAsset) {
      // unknown override asset: fall back to the authored graphic (warning already issued)
      ok = applySpriteProps(world, entity, { ...wanted, asset: authored.asset, animation: authored.animation, frame: authored.frame }, this.deps.sprites, (m) => this.warn(m));
    }
    if (ok && (app.facing || !hasSprite)) setEntityFacing(world, entity, facing);
  }
}
