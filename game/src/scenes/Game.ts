import { Scene } from "phaser";
import { tileToAnchor, type Facing } from "@shared/engine/index.ts";
import { GAME_CONSTANTS } from "@/constants/game";
import { settingsStore } from "@/core/SettingsStore";
import { gameState } from "@/core/GameState";
import { bootParams } from "@/core/bootParams";
import { MapSystem } from "@/world/MapSystem";
import { ImageLayerRenderer } from "@/world/imageLayers";
import { followLerp, snapToScreenPixel } from "@/world/cameraFollow";
import { InputManager } from "@/components/InputManager";
import { MAPS } from "@/constants/assets";
import { resolveMapKey } from "@/data/mapIds";
import { EventBus, Events } from "@/utils/EventBus";
import { Direction } from "@/utils/Direction";
import { gameData } from "@/data/gameData";
import { spriteRegistry } from "@/data/spriteRegistry";
import { CharacterLoader } from "@/sprites/characterLoader";
import { phaserLoaderPort } from "@/sprites/phaserLoaderPort";
import { charactersForMap } from "@/sprites/preloadSets";
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

const FOLLOW_OFFSET_Y = 24;

export class Game extends Scene {
  private mapSystem!: MapSystem;
  private imageLayers!: ImageLayerRenderer;
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
  /** What the camera follows (the player's sprite). */
  private followSprite: Phaser.GameObjects.Sprite | null = null;
  /** The eased camera position before it is put on the screen-pixel grid (see updateCameraLag). */
  private smoothScroll = { x: 0, y: 0 };
  private currentMapKey = "";
  private characters!: CharacterLoader;
  private debugGraphics?: Phaser.GameObjects.Graphics;

  constructor() {
    super("Game");
  }

  create() {
    this.mapSystem = new MapSystem(this);
    this.imageLayers = new ImageLayerRenderer(this, spriteRegistry);
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
    this.renderBridgeSystem = new RenderBridgeSystem(this, this.imageLayers.ySort);
    this.characters = new CharacterLoader(spriteRegistry, phaserLoaderPort(this));

    // Event runtime: state/states/interpreters + the system that decides when they start
    const maps: MapService = {
      hasMap: (id) => this.mapKeyFor(id) !== undefined,
      warp: (request) => this.warpPlayer(request),
    };
    this.runtime = new EventRuntime({
      world: this.world,
      sprites: spriteRegistry,
      ui: new BusEventUI(this.cameraEffects),
      maps,
      database: gameData.database,
      commonEvent: (id) => gameData.common.get(id),
      ensureCharacter: (id) => void this.characters.ensure([id]),
    });
    this.triggerSystem = new TriggerSystem(this.runtime);
    // `playerNear` with a line of sight: a tile hides the player when something solid stands on its centre.
    this.triggerSystem.setSightBlocker((col, row, ignore) => !this.spatialSystem.isWalkable((col + 0.5) * GAME_CONSTANTS.TILE_SIZE, (row + 0.5) * GAME_CONSTANTS.TILE_SIZE, ignore));
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
    this.installScreenPixelRounding();

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
    const { width: visibleWidth, height: visibleHeight } = settingsStore.view;
    const { integerScaling, pixelSnapping } = settingsStore.display;

    // Fit the view into the window. Any zoom keeps movement smooth; whole-number zoom keeps every pixel the same size.
    let zoom = Math.min(gameSize.width / visibleWidth, gameSize.height / visibleHeight);
    if (integerScaling) zoom = Math.max(1, Math.floor(zoom));

    const viewportWidth = Math.floor(visibleWidth * zoom);
    const viewportHeight = Math.floor(visibleHeight * zoom);
    const viewportX = Math.floor((gameSize.width - viewportWidth) / 2);
    const viewportY = Math.floor((gameSize.height - viewportHeight) / 2);

    const cam = this.cameras.main;
    cam.setViewport(viewportX, viewportY, viewportWidth, viewportHeight);
    cam.setZoom(zoom);
    cam.setRoundPixels(pixelSnapping);

    settingsStore.setRenderScale(zoom);
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
    // Characters of this map that are not loaded yet (a warp waits for them before getting here).
    void this.characters.ensure(this.charactersOf(mapKey));

    const map = this.mapSystem.loadMap(mapKey);
    const rawMapData = this.cache.tilemap.get(mapKey)?.data;
    this.currentMapKey = mapKey;
    // Pictures and sprites placed on the map's image layers (the old map's are destroyed first). Y-sorted ones draw
    // among the characters, at the player's depth.
    const mapProps = this.mapSystem.props;
    this.imageLayers.show(rawMapData, { ySortDepth: mapProps?.playerZ });

    this.spatialSystem.setMap(map);

    // Clear ECS world on map transition
    this.world.clear();
    gameState.setInputLocked(false);
    this.cameraEffects.reset();

    // Spawn the player (map centre by default), then the editor-placed entities and the entities
    // converted from legacy `interactables` object layers.
    const tileSize = GAME_CONSTANTS.TILE_SIZE;
    const spawned = spawnPlayer(this.world, map, tileSize, spawn, mapProps?.playerZ);
    this.playerEntity = spawned.entity;
    const entityDefs = [
      ...(Array.isArray(rawMapData?.entities) ? rawMapData.entities : []),
      ...legacyInteractableEntities(rawMapData),
    ];
    hydrateMapEntities(this.world, entityDefs);

    // Events of the new map: states, then no touch event fires for the tile we arrive on.
    this.runtime.onMapLoaded(mapKey);
    this.triggerSystem.resetTouchState(this.world);
    this.triggerSystem.onMapEntered(this.world);

    // Tick world with 0 delta to instantiate sprites on the render bridge immediately
    this.world.update(0);

    const playerSprite = this.renderBridgeSystem.getSprite(this.playerEntity);
    this.followSprite = playerSprite ?? null;
    if (playerSprite) {
      // The camera centres on the player's body (24 px above the feet); update() sets how fast it catches up
      // Without snapping, updateCameraLag moves the camera itself so it can stay on the screen-pixel grid
      if (settingsStore.display.pixelSnapping) this.cameras.main.startFollow(playerSprite, true, 1, 1, 0, FOLLOW_OFFSET_Y);
      else this.cameras.main.stopFollow();
      // Warps jump the camera instead of gliding across the new map
      this.cameras.main.centerOn(spawned.x, spawned.y - FOLLOW_OFFSET_Y);
      this.syncSmoothScroll();
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

  /** Game map key for an id as the editor stores it (file name) or as exported (see data/mapIds.ts). */
  private mapKeyFor(id: string): string | undefined {
    return resolveMapKey(MAPS.map((m) => m.key), id);
  }

  /** Everything a map needs on screen: the player, its entities' characters and the saved appearance overrides. */
  private charactersOf(mapKey: string): string[] {
    return charactersForMap(this.cache.tilemap.get(mapKey)?.data, this.runtime.appearance.assets());
  }

  /** `warp` command: same map = move the player, other map = load it (this cancels the running events). */
  private async warpPlayer(request: WarpRequest): Promise<void> {
    const never = new AbortController().signal;
    const spawn = { col: request.x, row: request.y, facing: request.facing };
    const mapKey = this.mapKeyFor(request.map);
    if (!mapKey) {
      console.warn(`[Game] warp: unknown map "${request.map}"`);
      return;
    }

    // Leaving for another map: the `mapLeave` states of this one run first, before the screen fades.
    if (mapKey !== this.currentMapKey) await this.runtime.runMapLeave();

    if (request.fade) await this.cameraEffects.fade("out", FADE_MS, never);

    if (mapKey === this.currentMapKey && this.playerEntity !== undefined) {
      this.teleportPlayer(spawn);
    } else {
      await this.characters.ensure(this.charactersOf(mapKey));
      this.switchMap(mapKey, spawn);
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
    this.cameras.main.centerOn(x, y - FOLLOW_OFFSET_Y);
    this.syncSmoothScroll();
  }

  /**
   * Camera follow: it covers the same share of the gap whatever the frame rate (so 60 and 144 Hz look alike).
   * `followLag` is the time it takes to close most of the gap; 0 pins the camera to the player.
   */
  private updateCameraLag(delta: number) {
    const cam = this.cameras.main;
    const target = this.followSprite;
    if (!target) return;
    const lag = settingsStore.camera.followLag;
    const dt = Math.min(delta, 100) / 1000;
    if (!settingsStore.display.pixelSnapping) {
      this.followOnScreenGrid(target, dt, lag);
      return;
    }
    // Where Phaser's follow wants the scroll to be (see Camera.preRender), to know how far the camera still has to go.
    const wantX = target.x - cam.followOffset.x - cam.width * cam.originX;
    const wantY = target.y - cam.followOffset.y - cam.height * cam.originY;
    cam.setLerp(
      followLerp(Math.abs(wantX - cam.scrollX), dt, lag, cam.zoom),
      followLerp(Math.abs(wantY - cam.scrollY), dt, lag, cam.zoom)
    );
  }

  /**
   * Smooth follow for the default (no snapping) mode. At a zoom that is not a whole number, a camera at any position
   * draws source pixels at uneven widths that change with every sub-pixel step, so the picture shimmers while it moves.
   * The eased position is kept apart, and the camera is put on the nearest screen pixel, so every frame is a whole-pixel
   * shift of the last one.
   */
  private followOnScreenGrid(target: Phaser.GameObjects.Sprite, dt: number, lag: number) {
    const cam = this.cameras.main;
    let wantX = target.x - cam.width * cam.originX;
    let wantY = target.y - FOLLOW_OFFSET_Y - cam.height * cam.originY;
    if (cam.useBounds) {
      wantX = cam.clampX(wantX);
      wantY = cam.clampY(wantY);
    }
    const s = this.smoothScroll;
    s.x += (wantX - s.x) * followLerp(Math.abs(wantX - s.x), dt, lag, cam.zoom);
    s.y += (wantY - s.y) * followLerp(Math.abs(wantY - s.y), dt, lag, cam.zoom);
    cam.setScroll(snapToScreenPixel(s.x, cam.zoom), snapToScreenPixel(s.y, cam.zoom));
  }

  private syncSmoothScroll() {
    this.smoothScroll.x = this.cameras.main.scrollX;
    this.smoothScroll.y = this.cameras.main.scrollY;
  }

  /**
   * Phaser floors the camera scroll to whole world pixels whenever `roundPixels` is on, which at a non-whole zoom is a
   * coarser and uneven grid than the screen's. Without snapping the scroll is left alone while the frame is set up (it is
   * already on the screen grid, see followOnScreenGrid) and only the drawn corners of tiles and sprites are rounded to
   * screen pixels afterwards.
   */
  private installScreenPixelRounding() {
    const cam = this.cameras.main;
    const preRender = cam.preRender.bind(cam);
    cam.preRender = () => {
      if (settingsStore.display.pixelSnapping) return preRender();
      cam.roundPixels = false;
      preRender();
      cam.roundPixels = true;
    };
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
    this.updateCameraLag(delta);
    this.redrawDebugOverlay();
  }
}
