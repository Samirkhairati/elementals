import { System } from "../System";
import type { World } from "../World";
import type { Entity } from "../Entity";
import { TransformComponent } from "../components/TransformComponent";
import { SpriteComponent } from "../components/SpriteComponent";
import { ParentComponent } from "../components/ParentComponent";
import { EntityInfoComponent } from "../components/EntityInfoComponent";
import { GridMovementComponent } from "../components/GridMovementComponent";
import { AIWanderComponent } from "../components/AIWanderComponent";

/** Where an entity is, what angle its sprite has and whether it is shown (what its children follow). */
export interface FollowedEntity {
  x: number;
  y: number;
  angle: number;
  shown: boolean;
}

/** Whether an entity is shown: its sprite is visible (an entity without one counts as shown) and no parent hides it. */
export function entityShown(world: World, entity: Entity): boolean {
  const sprite = world.getComponent(entity, SpriteComponent);
  if (sprite) return sprite.visible && !sprite.hiddenByParent;
  return !(world.getComponent(entity, ParentComponent)?.hidden ?? false);
}

/** Editor id -> entity, for the entities of the world (what `parent` names). */
export function entitiesById(world: World): Map<string, Entity> {
  const out = new Map<string, Entity>();
  for (const [entity, info] of world.view(EntityInfoComponent)) if (info.editorId) out.set(info.editorId, entity);
  return out;
}

/** Turns (x, y) around (cx, cy) by `deg` degrees clockwise (y points down, like the screen). */
export function rotateAround(x: number, y: number, cx: number, cy: number, deg: number): { x: number; y: number } {
  if (!deg) return { x, y };
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = x - cx;
  const dy = y - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

/**
 * Entities inside entities (ParentComponent) travel with their parent, like child nodes in Godot: each frame a child
 * moves by however much its parent moved, turns around the parent's anchor when the parent's sprite turns, and is
 * hidden while the parent is hidden. Its own movement (a route, wandering) goes on on top of that: a step in progress
 * and a wander home move along. Runs after the MovementSystem (300) and before the triggers (350), parents before
 * their children, so a whole chain moves in one frame. A child whose parent is gone stays where it is.
 */
export class ParentFollowSystem extends System {
  public priority = 320;

  public update(world: World, _delta: number): void {
    const links = world.view(ParentComponent, TransformComponent);
    if (links.length === 0) return;
    const byId = entitiesById(world);
    // Parents before children: sort by how many parents are above each one.
    const depth = new Map<Entity, number>();
    const depthOf = (entity: Entity, guard = 0): number => {
      const known = depth.get(entity);
      if (known !== undefined) return known;
      const link = world.getComponent(entity, ParentComponent);
      const parent = link ? byId.get(link.parentId) : undefined;
      const d = parent === undefined || parent === entity || guard > 32 ? 0 : depthOf(parent, guard + 1) + 1;
      depth.set(entity, d);
      return d;
    };
    const ordered = [...links].sort((a, b) => depthOf(a[0]) - depthOf(b[0]));

    for (const [entity, link, transform] of ordered) {
      const parent = byId.get(link.parentId);
      const pt = parent === undefined || parent === entity ? undefined : world.getComponent(parent, TransformComponent);
      if (parent === undefined || !pt) continue;
      const angle = world.getComponent(parent, SpriteComponent)?.angle ?? 0;
      if (link.lastX === undefined || link.lastY === undefined) {
        link.lastX = pt.x;
        link.lastY = pt.y;
        link.lastAngle = angle;
      } else {
        const turn = angle - link.lastAngle;
        const dx = pt.x - link.lastX;
        const dy = pt.y - link.lastY;
        if (dx !== 0 || dy !== 0 || turn !== 0) this.carry(world, entity, transform, dx, dy, turn, pt);
        link.lastX = pt.x;
        link.lastY = pt.y;
        link.lastAngle = angle;
      }
      link.hidden = !entityShown(world, parent);
      const sprite = world.getComponent(entity, SpriteComponent);
      if (sprite) sprite.hiddenByParent = link.hidden;
    }
  }

  /** Moves a child by the parent's move (dx, dy), then turns it by `turn` degrees around the parent's anchor. */
  private carry(world: World, entity: Entity, transform: TransformComponent, dx: number, dy: number, turn: number, around: { x: number; y: number }): void {
    const move = (x: number, y: number) => rotateAround(x + dx, y + dy, around.x, around.y, turn);
    const p = move(transform.x, transform.y);
    transform.x = p.x;
    transform.y = p.y;
    const grid = world.getComponent(entity, GridMovementComponent);
    if (grid) {
      // A step in progress keeps going from where it is carried to; the next one starts from there.
      const s = move(grid.startX, grid.startY);
      const t = move(grid.targetX, grid.targetY);
      grid.startX = s.x;
      grid.startY = s.y;
      grid.targetX = t.x;
      grid.targetY = t.y;
    }
    const wander = world.getComponent(entity, AIWanderComponent);
    if (wander?.homeInitialized) {
      const h = move(wander.originX, wander.originY);
      wander.originX = h.x;
      wander.originY = h.y;
    }
    if (turn !== 0) {
      const sprite = world.getComponent(entity, SpriteComponent);
      if (sprite) sprite.angle += turn;
    }
  }
}
