import type { Facing } from "@shared/engine/index.ts";
import { System } from "@/ecs/System";
import type { World } from "@/ecs/World";
import type { Entity } from "@/ecs/Entity";
import { TransformComponent } from "@/ecs/components/TransformComponent";
import { ColliderComponent } from "@/ecs/components/ColliderComponent";
import { EventComponent } from "@/ecs/components/EventComponent";
import { GridMovementComponent } from "@/ecs/components/GridMovementComponent";
import { FreeMovementComponent } from "@/ecs/components/FreeMovementComponent";
import { PlayerControlComponent } from "@/ecs/components/PlayerControlComponent";
import { MoveRouteComponent } from "@/ecs/components/MoveRouteComponent";
import { settingsStore } from "@/core/SettingsStore";
import { gameState } from "@/core/GameState";
import { EventBus, Events } from "@/utils/EventBus";
import { GAME_CONSTANTS } from "@/constants/game";
import type { EventRuntime } from "./EventRuntime";
import { coversTile, footprint, tileOfAnchor, type Tile } from "./footprint";

const OFFSETS: Record<Facing, { dc: number; dr: number }> = {
  left: { dc: -1, dr: 0 },
  right: { dc: 1, dr: 0 },
  up: { dc: 0, dr: -1 },
  down: { dc: 0, dr: 1 },
};
const FACINGS: Facing[] = ["down", "left", "right", "up"];

/** Consecutive instant restarts of one autorun state before we warn that it never switches itself off. */
const AUTORUN_WARN_AFTER = 300;

/**
 * Decides when events start. Runs after the MovementSystem (priority 350) so it sees arrivals of the
 * same frame.
 *
 *  - `action`: the queued action key / tap looks at the tile the player stands on, the tile in front,
 *    then the other three neighbours (first match wins), using each entity's LIVE footprint, so a
 *    wandering NPC keeps its dialogue;
 *  - `playerTouch`: fires when the player's step ENDS on a tile covered by the entity (also when the
 *    player chains straight into the next step), or when the player walks into a solid trigger
 *    (bump). Standing still never re-fires; arriving on a map does not fire for the spawn tile;
 *  - `eventTouch`: fires when another walking entity ends a step on the event's tiles;
 *  - `autorun`: starts as a blocking event (input locked) whenever the state is active and nothing is
 *    running on it, and restarts for as long as its state stays active;
 *  - `parallel`: runs in the background, restarts when finished, cancelled when its state is no longer
 *    active.
 */
export class TriggerSystem extends System {
  public priority = 350;

  private readonly runtime: EventRuntime;
  private readonly tileSize: number;
  private actionQueued = false;
  private lastPlayerTile: Tile | null = null;
  private readonly moverTiles = new Map<Entity, string>();
  private readonly autorunRestarts = new Map<Entity, number>();
  /**
   * Action key press. Presses made while input is locked are dropped on purpose: the press that
   * dismisses the last dialogue state must not start the same NPC's event again.
   */
  private readonly onAction = () => {
    this.requestAction();
  };
  private attached = false;

  constructor(runtime: EventRuntime, tileSize: number = GAME_CONSTANTS.TILE_SIZE) {
    super();
    this.runtime = runtime;
    this.tileSize = tileSize;
  }

  /** Listens for the action key (INPUT_ACTION). Taps call `tryActionAt` / `requestAction` themselves. */
  public attach(): void {
    if (this.attached) return;
    this.attached = true;
    EventBus.on(Events.INPUT_ACTION, this.onAction);
  }

  public detach(): void {
    if (!this.attached) return;
    this.attached = false;
    EventBus.off(Events.INPUT_ACTION, this.onAction);
  }

  public destroy(): void {
    this.detach();
  }

  /** Queues an action press; it is handled at the next update (never inside the key event). */
  public requestAction(): void {
    if (gameState.isInputLocked || this.runtime.isBlocking) return;
    this.actionQueued = true;
  }

  /** Forget where the player stands (call after a map load so the spawn tile does not fire). */
  public resetTouchState(world: World): void {
    this.lastPlayerTile = null;
    this.moverTiles.clear();
    this.autorunRestarts.clear();
    this.actionQueued = false;
    const player = this.findPlayer(world);
    if (player !== undefined) this.lastPlayerTile = this.settledTile(world, player);
  }

  public onEntityDestroyed(_world: World, entity: Entity): void {
    this.runtime.cancel(entity);
    this.moverTiles.delete(entity);
    this.autorunRestarts.delete(entity);
  }

  public update(world: World, delta: number): void {
    this.runtime.update(delta);

    const player = this.findPlayer(world);
    if (player === undefined) return;

    this.cancelStaleParallels(world);
    this.startAutoAndParallel(world);
    this.checkPlayerTouch(world, player);
    this.checkEventTouch(world, player);

    if (this.actionQueued) {
      this.actionQueued = false;
      if (!gameState.isInputLocked && !this.runtime.isBlocking) this.tryAction(world, player);
    }
  }

  // ── action ────────────────────────────────────────────────────────────────────────────────────

  /** Runs the action press now. Returns true when an event started. */
  public tryAction(world: World, player: Entity): boolean {
    const here = this.aheadTile(world, player);
    const facing = this.playerFacing(world, player);
    const front = { col: here.col + OFFSETS[facing].dc, row: here.row + OFFSETS[facing].dr };
    const candidates: Tile[] = [here, front];
    for (const f of FACINGS) {
      candidates.push({ col: here.col + OFFSETS[f].dc, row: here.row + OFFSETS[f].dr });
    }
    for (const tile of candidates) {
      if (this.startAt(world, player, tile, "action")) return true;
    }
    return false;
  }

  /**
   * Tap / click on a tile: turns the player towards it and triggers an `action` event covering it (or
   * next to it) when the player is within 3 tiles; returns true when an event started.
   */
  public tryActionAt(world: World, player: Entity, tile: Tile): boolean {
    if (gameState.isInputLocked || this.runtime.isBlocking) return false;
    const here = this.aheadTile(world, player);
    const dist = Math.abs(here.col - tile.col) + Math.abs(here.row - tile.row);
    if (dist > 3) return false;

    let target: Tile | null = null;
    for (const t of [tile, ...FACINGS.map((f) => ({ col: tile.col + OFFSETS[f].dc, row: tile.row + OFFSETS[f].dr }))]) {
      if (this.findAt(world, t, "action").length > 0) {
        target = t;
        break;
      }
    }
    if (!target) return false;

    const dc = target.col - here.col;
    const dr = target.row - here.row;
    if (dc !== 0 || dr !== 0) {
      const facing: Facing = Math.abs(dc) >= Math.abs(dr) ? (dc > 0 ? "right" : "left") : dr > 0 ? "down" : "up";
      this.runtime.ops.setFacing(player, facing);
    }
    return this.startAt(world, player, target, "action");
  }

  private startAt(world: World, player: Entity, tile: Tile, trigger: "action" | "playerTouch"): boolean {
    for (const [entity, index] of this.findAt(world, tile, trigger)) {
      const run = this.runtime.start(entity, index, { blocking: true, faceTarget: trigger === "action" ? player : undefined });
      if (run) return true;
    }
    return false;
  }

  /** [entity, active state index] of events with `trigger` whose footprint covers `tile`. */
  private findAt(world: World, tile: Tile, trigger: string): Array<[Entity, number]> {
    const out: Array<[Entity, number]> = [];
    for (const [entity, ev, transform] of world.view(EventComponent, TransformComponent)) {
      if (ev.activeState < 0 || ev.states[ev.activeState].trigger !== trigger) continue;
      if (this.runtime.isRunning(entity)) continue;
      const range = footprint(transform, world.getComponent(entity, ColliderComponent), this.tileSize);
      if (coversTile(range, tile)) out.push([entity, ev.activeState]);
    }
    return out;
  }

  // ── autorun / parallel ────────────────────────────────────────────────────────────────────────

  private startAutoAndParallel(world: World): void {
    for (const [entity, ev] of world.view(EventComponent)) {
      if (ev.activeState < 0 || this.runtime.isRunning(entity)) continue;
      const trigger = ev.states[ev.activeState].trigger;
      if (trigger === "parallel") {
        this.runtime.start(entity, ev.activeState, { blocking: false });
      } else if (trigger === "autorun") {
        if (this.runtime.isBlocking) continue;
        const n = (this.autorunRestarts.get(entity) ?? 0) + 1;
        this.autorunRestarts.set(entity, n);
        if (n === AUTORUN_WARN_AFTER) {
          this.runtime.warn(`[Event] an autorun state keeps restarting (${n} times); it should switch itself off (switch / self switch)`);
        }
        this.runtime.start(entity, ev.activeState, { blocking: true });
      } else {
        this.autorunRestarts.delete(entity);
      }
    }
  }

  /** Parallel events stop when their state is no longer the active (parallel) state. */
  private cancelStaleParallels(world: World): void {
    for (const [entity, ev] of world.view(EventComponent)) {
      const run = this.runtime.getRunning(entity);
      if (!run || run.blocking) continue;
      if (ev.activeState < 0 || ev.states[ev.activeState] !== run.state) this.runtime.cancel(entity);
    }
  }

  // ── player touch ──────────────────────────────────────────────────────────────────────────────

  private checkPlayerTouch(world: World, player: Entity): void {
    const tile = this.settledTile(world, player);

    if (!this.lastPlayerTile || this.lastPlayerTile.col !== tile.col || this.lastPlayerTile.row !== tile.row) {
      if (this.runtime.isBlocking) return; // retried once the running event ended
      this.lastPlayerTile = tile;
      this.startAt(world, player, tile, "playerTouch");
      return;
    }

    // Bump: walking into a solid trigger that blocks the way.
    const grid = world.getComponent(player, GridMovementComponent);
    if (!grid || grid.isMoving || !grid.pendingDirection || grid.holdDuration <= grid.moveThreshold) return;
    if (gameState.isInputLocked || this.runtime.isBlocking) return;
    const o = OFFSETS[grid.pendingDirection];
    const next = { col: tile.col + o.dc, row: tile.row + o.dr };
    for (const [entity, index] of this.findAt(world, next, "playerTouch")) {
      const solid = world.getComponent(entity, ColliderComponent)?.isSolid ?? false;
      if (!solid) continue; // walkable triggers fire on arrival instead
      if (this.runtime.start(entity, index, { blocking: true })) return;
    }
  }

  // ── event touch ───────────────────────────────────────────────────────────────────────────────

  private checkEventTouch(world: World, player: Entity): void {
    const touchers = world.view(EventComponent).filter(([, ev]) => ev.activeState >= 0 && ev.states[ev.activeState].trigger === "eventTouch");
    for (const [entity, transform, grid] of world.view(TransformComponent, GridMovementComponent)) {
      if (entity === player || grid.isMoving) continue;
      const tile = tileOfAnchor(transform.x, transform.y, this.tileSize);
      const key = `${tile.col},${tile.row}`;
      if (this.moverTiles.get(entity) === key) continue;
      const first = !this.moverTiles.has(entity);
      this.moverTiles.set(entity, key);
      if (first || touchers.length === 0 || this.runtime.isBlocking) continue;
      for (const [other, ev] of touchers) {
        if (other === entity) continue;
        const t = world.getComponent(other, TransformComponent);
        if (!t) continue;
        const range = footprint(t, world.getComponent(other, ColliderComponent), this.tileSize);
        if (coversTile(range, tile) && this.runtime.start(other, ev.activeState, { blocking: true })) break;
      }
    }
  }

  // ── player position helpers ───────────────────────────────────────────────────────────────────

  private findPlayer(world: World): Entity | undefined {
    return world.query(PlayerControlComponent)[0];
  }

  private usesGrid(world: World, player: Entity): boolean {
    const routed = world.getComponent(player, MoveRouteComponent)?.active ?? false;
    return (settingsStore.tileBasedMovement || routed || !world.hasComponent(player, FreeMovementComponent)) && world.hasComponent(player, GridMovementComponent);
  }

  /** The tile the player is standing on; during a step it is still the tile being left. */
  private settledTile(world: World, player: Entity): Tile {
    const t = world.getComponent(player, TransformComponent);
    if (!t) return { col: 0, row: 0 };
    const grid = world.getComponent(player, GridMovementComponent);
    if (grid && grid.isMoving && this.usesGrid(world, player)) return tileOfAnchor(grid.startX, grid.startY, this.tileSize);
    return tileOfAnchor(t.x, t.y, this.tileSize);
  }

  /** The tile the player is standing on or about to stand on (the destination while stepping). */
  private aheadTile(world: World, player: Entity): Tile {
    const t = world.getComponent(player, TransformComponent);
    if (!t) return { col: 0, row: 0 };
    const grid = world.getComponent(player, GridMovementComponent);
    if (grid && grid.isMoving && this.usesGrid(world, player)) return tileOfAnchor(grid.targetX, grid.targetY, this.tileSize);
    return tileOfAnchor(t.x, t.y, this.tileSize);
  }

  private playerFacing(world: World, player: Entity): Facing {
    const grid = world.getComponent(player, GridMovementComponent);
    const free = world.getComponent(player, FreeMovementComponent);
    if (this.usesGrid(world, player) && grid) return grid.direction;
    return free?.direction ?? grid?.direction ?? "down";
  }
}
