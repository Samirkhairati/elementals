import { Scene } from "phaser";
import { tileToAnchor, type Facing } from "@shared/engine/index.ts";
import { GAME_CONSTANTS } from "@/constants/game";
import { settingsStore } from "@/core/SettingsStore";
import { gameState } from "@/core/GameState";
import { bootParams } from "@/core/bootParams";
import { MapSystem } from "@/world/MapSystem";
import { InputManager } from "@/components/InputManager";
import { MAPS } from "@/constants/assets";
import { EventBus, Events } from "@/utils/EventBus";
import { Direction } from "@/utils/Direction";
import { gameData } from "@/data/gameData";
import { spriteRegistry } from "@/data/spriteRegistry";
import {
  World,
  SpatialSystem,
  InputSystem,
  MovementSystem,
  AIWanderSystem,
  RouteSystem,
  AnimationSystem,
  RenderBridgeSystem,
  hydrateMapEntities,
  spawnPlayer,
  type Entity,
} from "@/ecs";
import { legacyInteractableEntities } from "@/ecs/legacyInteractables";
import { TransformComponent } from "@/ecs/components/TransformComponent";
import { ColliderComponent } from "@/ecs/components/ColliderComponent";
import { EventComponent } from "@/ecs/components/EventComponent";
import { GridMovementComponent } from "@/ecs/components/GridMovementComponent";
import { setEntityFacing } from "@/sprites/spriteState";
import { EventRuntime } from "@/events/EventRuntime";
import { TriggerSystem } from "@/events/TriggerSystem";
import { BusEventUI } from "@/events/BusEventUI";
import { CameraEffects } from "@/events/CameraEffects";
import type { MapService, WarpRequest } from "@/events/types";

const FADE_MS = 250;

/** Handle exposed on `window.__game` (dev server or `?debug=1`) for console experiments and browser tests. */
export interface GameDebugHandle {
  scene: Game;
  world: World;
  runtime: EventRuntime;
  triggers: TriggerSystem;
  spawn(defs: unknown[]): Entity[];
  switchMap(mapId: string, spawn?: { col: number; row: number; facing?: Facing }): void;
}

export class Game extends Scene {
  private mapSystem!: MapSystem;
  private inputManager!: InputManager;
  private world!: World;
  private spatialSystem!: SpatialSystem;
  private inputSystem!: InputSystem;
  private movementSystem!: MovementSystem;
  private aiWanderSystem!: AIWanderSystem;
  private routeSystem!: RouteSystem;
  private animationSystem!: AnimationSystem;
  private renderBridgeSystem!: RenderBridgeSystem;
  private triggerSystem!: TriggerSystem;
  private runtime!: EventRuntime;
  private cameraEffects!: CameraEffects;
  private playerEntity?: Entity;
  private currentMapKey = "";
  private debugGraphics?: Phaser.GameObjects.Graphics;

  constructor() {
    super("Game");
  }

  create() {
    this.mapSystem = new MapSystem(this);
    this.inputManager = new InputManager(this);
    this.cameraEffects = new CameraEffects(this);

    // Initialize ECS World and Systems
    this.world = new World();
    this.spatialSystem = new SpatialSystem(this.mapSystem.collisions);
    this.inputSystem = new InputSystem();
    this.movementSystem = new MovementSystem(this.spatialSystem);
    this.aiWanderSystem = new AIWanderSystem(this.spatialSystem);
    this.routeSystem = new RouteSystem();
    this.animationSystem = new AnimationSystem();
    this.renderBridgeSystem = new RenderBridgeSystem(this);

    // Event runtime: state/states/interpreters + the system that decides when they start
    const maps: MapService = {
      hasMap: (id) => MAPS.some((m) => m.key === id),
      warp: (request) => this.warpPlayer(request),
    };
    this.runtime = new EventRuntime({
      world: this.world,
      sprites: spriteRegistry,
      ui: new BusEventUI(this.cameraEffects),
      maps,
      database: gameData.database,
    });
    this.triggerSystem = new TriggerSystem(this.runtime);
    this.triggerSystem.attach();

    this.world.addSystem(this.spatialSystem);
    this.world.addSystem(this.inputSystem);
    this.world.addSystem(this.aiWanderSystem);
    this.world.addSystem(this.routeSystem);
    this.world.addSystem(this.movementSystem);
    this.world.addSystem(this.triggerSystem);
    this.world.addSystem(this.animationSystem);
    this.world.addSystem(this.renderBridgeSystem);

    // Wire up events
    this.switchMap = this.switchMap.bind(this);
    this.handleResize = this.handleResize.bind(this);

    EventBus.on(Events.MAP_SWITCH_REQUEST, this.switchMap);
    this.scale.on('resize', this.handleResize);

    // Calculate initial scale before loading map and spawning player
    this.handleResize({ width: this.scale.width, height: this.scale.height });

    // Initial map load (?map=<id> picks another one)
    const requested = bootParams.map && MAPS.some((m) => m.key === bootParams.map) ? bootParams.map : undefined;
    if (bootParams.map && !requested) console.warn(`[Game] ?map=${bootParams.map}: no such map, starting on "${MAPS[0].key}"`);
    this.switchMap(requested ?? MAPS[0].key);

    // Pointer / touch: tap an event next to the player. While a dialogue, choice menu or event is up the
    // HUD handles taps itself (it turns them into the action key).
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (gameState.isInputLocked || this.runtime.isBlocking || this.playerEntity === undefined) return;
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      if (!worldPoint) return;
      const col = Math.floor(worldPoint.x / GAME_CONSTANTS.TILE_SIZE);
      const row = Math.floor(worldPoint.y / GAME_CONSTANTS.TILE_SIZE);
      const handled = this.triggerSystem.tryActionAt(this.world, this.playerEntity, { col, row });
      if (!handled) {
        const pos = gameState.playerPosition;
        if (Math.abs(pos.gridX - col) + Math.abs(pos.gridY - row) <= 1) this.triggerSystem.requestAction();
      }
    });

    // Launch UI Scene
    this.scene.launch("UIScene");

    if (settingsStore.debug.enabled) {
      this.debugGraphics = this.add.graphics();
      this.debugGraphics.setDepth(101);
    }

    this.exposeDebugHandle();
    this.events.on('destroy', this.cleanup, this);
  }

  private handleResize(gameSize: { width: number; height: number }) {
    const visibleWidth = GAME_CONSTANTS.LOGICAL_WIDTH;
    const visibleHeight = GAME_CONSTANTS.LOGICAL_HEIGHT;

    // Calculate integer scale factor to fit the visible area into the game size
    const scaleX = Math.max(1, Math.floor(gameSize.width / visibleWidth));
    const scaleY = Math.max(1, Math.floor(gameSize.height / visibleHeight));
    const newScale = Math.min(scaleX, scaleY);
    
    const viewportWidth = visibleWidth * newScale;
    const viewportHeight = visibleHeight * newScale;
    const viewportX = Math.floor((gameSize.width - viewportWidth) / 2);
    const viewportY = Math.floor((gameSize.height - viewportHeight) / 2);

    this.cameras.main.setViewport(viewportX, viewportY, viewportWidth, viewportHeight);
    this.cameras.main.setZoom(newScale);

    settingsStore.setRenderScale(newScale);
  }

  private cleanup() {
      EventBus.off(Events.MAP_SWITCH_REQUEST, this.switchMap);
      this.scale.off('resize', this.handleResize);
      this.input.off('pointerdown');
      this.triggerSystem?.detach();
      this.runtime?.destroy();
      this.world?.destroy();
      const w = window as unknown as { __game?: GameDebugHandle };
      if (w.__game?.scene === this) delete w.__game;
  }

  /**
   * Loads a map and places the player: at the map centre by default, on a tile for warps.
   * Everything event-related of the old map is cancelled first; global switches/variables and self
   * switches persist, the new map's events pick their states from them.
   */
  private switchMap(mapKey: string, spawn?: { col: number; row: number; facing?: Facing }) {
    if (!MAPS.some((m) => m.key === mapKey)) {
      console.warn(`[Game] unknown map "${mapKey}"`);
      return;
    }
    this.runtime.cancelAll();

    const map = this.mapSystem.loadMap(mapKey);
    const rawMapData = this.cache.tilemap.get(mapKey)?.data;
    this.currentMapKey = mapKey;

    this.spatialSystem.setMap(map);

    // Clear ECS world on map transition
    this.world.clear();
    gameState.setInputLocked(false);
    this.cameraEffects.reset();

    // Spawn the player (map centre by default), then the editor-placed entities and the entities
    // converted from legacy `interactables` object layers.
    const tileSize = GAME_CONSTANTS.TILE_SIZE;
    const spawned = spawnPlayer(this.world, map, tileSize, spawn);
    this.playerEntity = spawned.entity;
    const entityDefs = [
      ...(Array.isArray(rawMapData?.entities) ? rawMapData.entities : []),
      ...legacyInteractableEntities(rawMapData),
    ];
    hydrateMapEntities(this.world, entityDefs);

    // Events of the new map: states, then no touch event fires for the tile we arrive on.
    this.runtime.onMapLoaded(mapKey);
    this.triggerSystem.resetTouchState(this.world);

    // Tick world with 0 delta to instantiate sprites on the render bridge immediately
    this.world.update(0);

    const playerSprite = this.renderBridgeSystem.getSprite(this.playerEntity);
    if (playerSprite) {
      if (settingsStore.camera.smoothFollow) {
        this.cameras.main.startFollow(playerSprite, false, 0.05, 0.05);
      } else {
        this.cameras.main.startFollow(playerSprite, true, 1, 1);
      }
      // Warps jump the camera instead of gliding across the new map
      this.cameras.main.centerOn(spawned.x, spawned.y - 24);
    }

    // Ensure player position is synced to GameState on spawn
    gameState.updatePlayerPosition(
      spawned.x,
      spawned.y,
      Math.floor(spawned.x / tileSize),
      Math.floor((spawned.y - 1) / tileSize),
      (spawn?.facing as Direction | undefined) ?? Direction.DOWN
    );
  }

  /** `warp` command: same map = move the player, other map = load it (this cancels the running events). */
  private async warpPlayer(request: WarpRequest): Promise<void> {
    const never = new AbortController().signal;
    const spawn = { col: request.x, row: request.y, facing: request.facing };

    if (request.fade) await this.cameraEffects.fade("out", FADE_MS, never);

    if (request.map === this.currentMapKey && this.playerEntity !== undefined) {
      this.teleportPlayer(spawn);
    } else {
      this.switchMap(request.map, spawn);
    }

    // After a fade (ours or an earlier fadeScreen command) the new map fades in.
    if (this.cameraEffects.faded) void this.cameraEffects.fade("in", FADE_MS, never);
  }

  /** Same-map warp: moves the player to a tile without reloading the map (NPCs keep their state). */
  private teleportPlayer(spawn: { col: number; row: number; facing?: Facing }) {
    const player = this.playerEntity;
    if (player === undefined) return;
    const { x, y } = tileToAnchor(spawn.col, spawn.row);
    const transform = this.world.getComponent(player, TransformComponent);
    if (!transform) return;
    transform.x = x;
    transform.y = y;
    const grid = this.world.getComponent(player, GridMovementComponent);
    if (grid) {
      grid.isMoving = false;
      grid.pendingDirection = null;
      grid.progress = 0;
    }
    if (spawn.facing) setEntityFacing(this.world, player, spawn.facing);
    const tileSize = GAME_CONSTANTS.TILE_SIZE;
    gameState.updatePlayerPosition(x, y, Math.floor(x / tileSize), Math.floor((y - 1) / tileSize), (spawn.facing as Direction | undefined) ?? gameState.playerPosition.direction);
    this.triggerSystem.resetTouchState(this.world);
    this.cameras.main.centerOn(x, y - 24);
  }

  /** Footprints of event entities (yellow = solid, magenta = walkable trigger, grey = no active state). */
  private redrawDebugOverlay() {
    const g = this.debugGraphics;
    if (!g) return;
    g.clear();
    for (const [, transform, ev, collider] of this.world.view(TransformComponent, EventComponent, ColliderComponent)) {
      const color = ev.state ? (collider.isSolid ? 0xffff00 : 0xff00ff) : 0x888888;
      g.lineStyle(2, color, 0.8);
      g.strokeRect(transform.x + collider.offsetX - collider.width / 2, transform.y + collider.offsetY - collider.height, collider.width, collider.height);
    }
  }

  private exposeDebugHandle() {
    if (!import.meta.env.DEV && !bootParams.debug) return;
    const handle: GameDebugHandle = {
      scene: this,
      world: this.world,
      runtime: this.runtime,
      triggers: this.triggerSystem,
      spawn: (defs) => {
        const result = hydrateMapEntities(this.world, defs);
        this.runtime.markDirty();
        this.runtime.states.refreshAll();
        this.world.update(0);
        return result.entities;
      },
      switchMap: (mapId, spawn) => this.switchMap(mapId, spawn),
    };
    (window as unknown as { __game?: GameDebugHandle }).__game = handle;
  }

  update(_time: number, delta: number) {
    this.inputManager?.update();
    const input = this.inputManager?.getSnapshot();
    if (input) {
      this.inputSystem?.setSnapshot(input);
    }
    this.world?.update(delta);
    this.redrawDebugOverlay();
  }
}
