import { MAX_TRIGGER_RANGE, stateInterval, statePriority, stateRange, type EventState, type EventTrigger, type Facing } from "@shared/engine/index.ts";
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

/** Consecutive instant restarts of one blocking, repeating state before we warn that it never switches itself off. */
const REPEAT_WARN_AFTER = 300;

/** An event whose active state has the trigger being looked for. */
interface Match {
  entity: Entity;
  index: number;
  state: EventState;
  /** Tiles between the player and the event (`interact`); the nearer one wins a tie in priority. */
  dist: number;
}

/**
 * Decides when events start (docs/event-triggers-proposal.md). Runs after the MovementSystem (priority 350)
 * so it sees arrivals of the same frame. Every start kind honours the state's `blocks` (input locked, one at
 * a time, or in the background); when several events could start from the same input the highest `priority`
 * wins, then the nearest, then entity order.
 *
 *  - `interact`: the queued action key / tap looks at the tile the player stands on, the tiles in front
 *    (up to the state's `range`), then, unless the state says `mustFace`, the other three neighbours,
 *    using each entity's LIVE footprint, so a wandering NPC keeps its dialogue;
 *  - `playerEnter` / `playerLeave`: the player's step ENDS on / has left a tile covered by the entity (also
 *    when the player chains straight into the next step); walking into a solid `playerEnter` event (bump)
 *    fires it too. Standing still never re-fires; arriving on a map does not fire for the spawn tile;
 *  - `eventEnter` / `eventLeave`: the same for another walking entity;
 *  - `playerNear`: the player comes within `range` tiles (optionally with a line of sight); fires once per
 *    approach;
 *  - `onActive`: once when the state becomes active (again and again while it stays active when it was
 *    migrated from autorun / parallel and carries `repeat`); a background run stops when the state ends;
 *  - `timer`: every `interval` seconds while the state is active;
 *  - `mapEnter`: once, when the map has been loaded; `mapLeave` runs from EventRuntime.runMapLeave.
 */
export class TriggerSystem extends System {
  public priority = 350;

  private readonly runtime: EventRuntime;
  private readonly tileSize: number;
  private actionQueued = false;
  private lastPlayerTile: Tile | null = null;
  /** The tile the player entered while a `playerLeave` event was running: its enter events start once that ends. */
  private pendingEnter: Tile | null = null;
  private readonly moverTiles = new Map<Entity, Tile>();
  private readonly activated = new Map<Entity, EventState>();
  private readonly timers = new Map<Entity, { state: EventState; elapsed: number }>();
  private readonly near = new Map<Entity, { state: EventState; inside: boolean }>();
  private readonly repeatRestarts = new Map<Entity, number>();
  private mapEnterPending: Array<{ entity: Entity; state: EventState }> = [];
  /** Tells whether a tile hides things from sight (a solid thing stands on it). Without it nothing does. */
  private sightBlocked: ((col: number, row: number, ignore: Entity) => boolean) | null = null;
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

  /** The line of sight of `playerNear` states stops at tiles this says are blocked (never the two end tiles). */
  public setSightBlocker(fn: ((col: number, row: number, ignore: Entity) => boolean) | null): void {
    this.sightBlocked = fn;
  }

  /** Queues an action press; it is handled at the next update (never inside the key event). */
  public requestAction(): void {
    if (gameState.isInputLocked || this.runtime.isBlocking) return;
    this.actionQueued = true;
  }

  /** Forget where the player stands (call after a map load or a same-map warp so the spawn tile does not fire). */
  public resetTouchState(world: World): void {
    this.lastPlayerTile = null;
    this.pendingEnter = null;
    this.moverTiles.clear();
    this.actionQueued = false;
    const player = this.findPlayer(world);
    if (player !== undefined) this.lastPlayerTile = this.settledTile(world, player);
  }

  /**
   * A map was loaded (call after `EventRuntime.onMapLoaded`): everything started per map begins afresh, and
   * the `mapEnter` states that are active now will run.
   */
  public onMapEntered(world: World): void {
    this.activated.clear();
    this.timers.clear();
    this.near.clear();
    this.repeatRestarts.clear();
    this.mapEnterPending = [];
    for (const [entity, ev] of world.view(EventComponent)) {
      const state = ev.activeState >= 0 ? ev.states[ev.activeState] : undefined;
      if (state?.trigger === "mapEnter") this.mapEnterPending.push({ entity, state });
    }
  }

  public onEntityDestroyed(_world: World, entity: Entity): void {
    this.runtime.cancel(entity);
    this.moverTiles.delete(entity);
    this.activated.delete(entity);
    this.timers.delete(entity);
    this.near.delete(entity);
    this.repeatRestarts.delete(entity);
  }

  public update(world: World, delta: number): void {
    this.runtime.update(delta);

    const player = this.findPlayer(world);
    if (player === undefined) return;

    this.cancelStaleBackground(world);
    this.startMapEnter(world);
    this.startOnActive(world);
    this.startTimers(world, delta);
    this.checkPlayerTile(world, player);
    this.checkPlayerNear(world, player);
    this.checkMovers(world, player);

    if (this.actionQueued) {
      this.actionQueued = false;
      if (!gameState.isInputLocked && !this.runtime.isBlocking) this.tryAction(world, player);
    }
  }

  // ── interact ──────────────────────────────────────────────────────────────────────────────────

  /** Runs the action press now. Returns true when an event started. */
  public tryAction(world: World, player: Entity): boolean {
    const here = this.aheadTile(world, player);
    const facing = this.playerFacing(world, player);
    const matches: Match[] = [];
    const seen = new Set<Entity>();
    const collect = (tile: Tile, dist: number, inFront: boolean) => {
      for (const m of this.findAt(world, tile, "interact", dist, (s) => dist <= stateRange(s) && (inFront || !s.mustFace))) {
        if (seen.has(m.entity)) continue;
        seen.add(m.entity);
        matches.push(m);
      }
    };
    collect(here, 0, true);
    for (let k = 1; k <= MAX_TRIGGER_RANGE; k++) {
      collect({ col: here.col + OFFSETS[facing].dc * k, row: here.row + OFFSETS[facing].dr * k }, k, true);
    }
    for (const f of FACINGS) collect({ col: here.col + OFFSETS[f].dc, row: here.row + OFFSETS[f].dr }, 1, false);
    return this.startFirst(matches, player);
  }

  /**
   * Tap / click on a tile: turns the player towards it and triggers an `interact` event covering it (or
   * next to it) when the player is within 3 tiles; returns true when an event started.
   */
  public tryActionAt(world: World, player: Entity, tile: Tile): boolean {
    if (gameState.isInputLocked || this.runtime.isBlocking) return false;
    const here = this.aheadTile(world, player);
    const dist = Math.abs(here.col - tile.col) + Math.abs(here.row - tile.row);
    if (dist > 3) return false;

    let target: Tile | null = null;
    for (const t of [tile, ...FACINGS.map((f) => ({ col: tile.col + OFFSETS[f].dc, row: tile.row + OFFSETS[f].dr }))]) {
      if (this.findAt(world, t, "interact").length > 0) {
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
    return this.startFirst(this.findAt(world, target, "interact"), player);
  }

  /** Starts the best of `matches` (highest priority, then nearest, then the order given); one press starts one event. */
  private startFirst(matches: Match[], player: Entity): boolean {
    for (const m of this.byPriority(matches)) {
      if (this.runtime.start(m.entity, m.index, { blocking: m.state.blocks, faceTarget: player })) return true;
    }
    return false;
  }

  /** Starts every event of `matches` that can (a blocking one keeps the others waiting out, a background one does not). */
  private startAll(matches: Match[]): boolean {
    let any = false;
    for (const m of this.byPriority(matches)) {
      if (this.runtime.start(m.entity, m.index, { blocking: m.state.blocks })) any = true;
    }
    return any;
  }

  private byPriority(matches: Match[]): Match[] {
    return [...matches].sort((a, b) => statePriority(b.state) - statePriority(a.state) || a.dist - b.dist);
  }

  /** Events whose active state has `trigger` and whose footprint covers `tile` (and that `accept`, when given). */
  private findAt(world: World, tile: Tile, trigger: EventTrigger, dist = 0, accept?: (state: EventState) => boolean): Match[] {
    const out: Match[] = [];
    for (const [entity, ev, transform] of world.view(EventComponent, TransformComponent)) {
      if (ev.activeState < 0) continue;
      const state = ev.states[ev.activeState];
      if (state.trigger !== trigger || (accept && !accept(state))) continue;
      if (this.runtime.isRunning(entity)) continue;
      const range = footprint(transform, world.getComponent(entity, ColliderComponent), this.tileSize);
      if (coversTile(range, tile)) out.push({ entity, index: ev.activeState, state, dist });
    }
    return out;
  }

  // ── onActive / timer / mapEnter ───────────────────────────────────────────────────────────────

  /** Background runs of `onActive` and `timer` states stop when their state is no longer the active one. */
  private cancelStaleBackground(world: World): void {
    for (const [entity, ev] of world.view(EventComponent)) {
      const run = this.runtime.getRunning(entity);
      if (!run || run.blocking) continue;
      if (run.state.trigger !== "onActive" && run.state.trigger !== "timer") continue;
      if (ev.activeState < 0 || ev.states[ev.activeState] !== run.state) this.runtime.cancel(entity);
    }
  }

  private startMapEnter(world: World): void {
    if (this.mapEnterPending.length === 0) return;
    const waiting: Array<{ entity: Entity; state: EventState }> = [];
    for (const p of this.mapEnterPending) {
      const ev = world.getComponent(p.entity, EventComponent);
      if (!ev || ev.activeState < 0 || ev.states[ev.activeState] !== p.state) continue; // gone or changed state: skip
      if (this.runtime.isRunning(p.entity) || (p.state.blocks && this.runtime.isBlocking)) {
        waiting.push(p);
        continue;
      }
      if (!this.runtime.start(p.entity, ev.activeState, { blocking: p.state.blocks })) waiting.push(p);
    }
    this.mapEnterPending = waiting;
  }

  private startOnActive(world: World): void {
    for (const [entity, ev] of world.view(EventComponent)) {
      const state = ev.activeState >= 0 ? ev.states[ev.activeState] : undefined;
      if (!state || state.trigger !== "onActive") {
        this.activated.delete(entity);
        this.repeatRestarts.delete(entity);
        continue;
      }
      if (this.activated.get(entity) === state && !state.repeat) continue;
      if (this.runtime.isRunning(entity)) continue;
      if (state.blocks && this.runtime.isBlocking) continue;
      if (state.blocks && state.repeat) {
        const n = (this.repeatRestarts.get(entity) ?? 0) + 1;
        this.repeatRestarts.set(entity, n);
        if (n === REPEAT_WARN_AFTER) {
          this.runtime.warn(`[Event] a repeating state keeps restarting (${n} times); it should switch itself off (switch / self switch)`);
        }
      }
      if (this.runtime.start(entity, ev.activeState, { blocking: state.blocks })) this.activated.set(entity, state);
    }
  }

  private startTimers(world: World, delta: number): void {
    for (const [entity, ev] of world.view(EventComponent)) {
      const state = ev.activeState >= 0 ? ev.states[ev.activeState] : undefined;
      if (!state || state.trigger !== "timer") {
        this.timers.delete(entity);
        continue;
      }
      let rec = this.timers.get(entity);
      if (!rec || rec.state !== state) {
        rec = { state, elapsed: 0 };
        this.timers.set(entity, rec);
      }
      const interval = stateInterval(state);
      rec.elapsed = Math.min(interval, rec.elapsed + delta / 1000); // no burst of runs after a long wait
      if (rec.elapsed < interval) continue;
      if (this.runtime.isRunning(entity) || (state.blocks && this.runtime.isBlocking)) continue;
      if (this.runtime.start(entity, ev.activeState, { blocking: state.blocks })) rec.elapsed = 0;
    }
  }

  // ── player enter / leave / bump ───────────────────────────────────────────────────────────────

  private checkPlayerTile(world: World, player: Entity): void {
    const tile = this.settledTile(world, player);

    if (this.pendingEnter && !this.runtime.isBlocking) {
      const entered = this.pendingEnter;
      this.pendingEnter = null;
      this.startAll(this.findAt(world, entered, "playerEnter"));
    }

    const last = this.lastPlayerTile;
    if (!last || last.col !== tile.col || last.row !== tile.row) {
      if (this.runtime.isBlocking) return; // retried once the running event ended
      this.lastPlayerTile = tile;
      if (last) this.startAll(this.leaving(world, last, tile, "playerLeave"));
      if (this.runtime.isBlocking) this.pendingEnter = tile; // a leave event is running: enter after it
      else this.startAll(this.findAt(world, tile, "playerEnter"));
      return;
    }

    // Bump: walking into a solid trigger that blocks the way.
    const grid = world.getComponent(player, GridMovementComponent);
    if (!grid || grid.isMoving || !grid.pendingDirection || grid.holdDuration <= grid.moveThreshold) return;
    if (gameState.isInputLocked || this.runtime.isBlocking) return;
    const o = OFFSETS[grid.pendingDirection];
    const next = { col: tile.col + o.dc, row: tile.row + o.dr };
    for (const m of this.byPriority(this.findAt(world, next, "playerEnter"))) {
      const solid = world.getComponent(m.entity, ColliderComponent)?.isSolid ?? false;
      if (!solid) continue; // walkable triggers fire on arrival instead
      if (this.runtime.start(m.entity, m.index, { blocking: m.state.blocks })) return;
    }
  }

  /** `trigger` events that covered `from` and no longer cover `to`. */
  private leaving(world: World, from: Tile, to: Tile, trigger: "playerLeave" | "eventLeave", self?: Entity): Match[] {
    return this.findAt(world, from, trigger).filter((m) => {
      if (m.entity === self) return false;
      const t = world.getComponent(m.entity, TransformComponent);
      return !t || !coversTile(footprint(t, world.getComponent(m.entity, ColliderComponent), this.tileSize), to);
    });
  }

  // ── player near ───────────────────────────────────────────────────────────────────────────────

  private checkPlayerNear(world: World, player: Entity): void {
    const tile = this.settledTile(world, player);
    for (const [entity, ev, transform] of world.view(EventComponent, TransformComponent)) {
      const state = ev.activeState >= 0 ? ev.states[ev.activeState] : undefined;
      if (!state || state.trigger !== "playerNear") {
        this.near.delete(entity);
        continue;
      }
      let rec = this.near.get(entity);
      if (!rec || rec.state !== state) {
        rec = { state, inside: false };
        this.near.set(entity, rec);
      }
      const area = footprint(transform, world.getComponent(entity, ColliderComponent), this.tileSize);
      const dist = Math.max(area.minCol - tile.col, 0, tile.col - area.maxCol, area.minRow - tile.row, 0, tile.row - area.maxRow);
      const inside = dist <= stateRange(state) && (!state.lineOfSight || this.canSee(entity, area, tile));
      if (!inside) {
        rec.inside = false;
        continue;
      }
      if (rec.inside) continue;
      if (this.runtime.isRunning(entity)) {
        rec.inside = true; // already reacting: do not start it again for the same approach
        continue;
      }
      if (state.blocks && this.runtime.isBlocking) continue; // retried next frame
      if (this.runtime.start(entity, ev.activeState, { blocking: state.blocks })) rec.inside = true;
    }
  }

  /** A straight line of tiles from the player to the nearest tile of the event meets nothing that blocks sight. */
  private canSee(entity: Entity, area: { minCol: number; maxCol: number; minRow: number; maxRow: number }, from: Tile): boolean {
    const blocked = this.sightBlocked;
    if (!blocked) return true;
    const to = { col: Math.min(Math.max(from.col, area.minCol), area.maxCol), row: Math.min(Math.max(from.row, area.minRow), area.maxRow) };
    const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row));
    for (let i = 1; i < steps; i++) {
      const col = Math.round(from.col + ((to.col - from.col) * i) / steps);
      const row = Math.round(from.row + ((to.row - from.row) * i) / steps);
      if (blocked(col, row, entity)) return false;
    }
    return true;
  }

  // ── other characters entering / leaving ───────────────────────────────────────────────────────

  private checkMovers(world: World, player: Entity): void {
    const active = (trigger: EventTrigger) => world.view(EventComponent).filter(([, ev]) => ev.activeState >= 0 && ev.states[ev.activeState].trigger === trigger);
    const enterers = active("eventEnter");
    const leavers = active("eventLeave");
    for (const [entity, transform, grid] of world.view(TransformComponent, GridMovementComponent)) {
      if (entity === player || grid.isMoving) continue;
      const tile = tileOfAnchor(transform.x, transform.y, this.tileSize);
      const prev = this.moverTiles.get(entity);
      if (prev && prev.col === tile.col && prev.row === tile.row) continue;
      this.moverTiles.set(entity, tile);
      if (!prev || (enterers.length === 0 && leavers.length === 0) || this.runtime.isBlocking) continue;
      if (leavers.length > 0) this.startAll(this.leaving(world, prev, tile, "eventLeave", entity));
      if (enterers.length > 0 && !this.runtime.isBlocking) {
        this.startAll(this.findAt(world, tile, "eventEnter").filter((m) => m.entity !== entity));
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
