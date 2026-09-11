import { Scene } from "phaser";
import { GAME_CONSTANTS } from "@/constants/game";
import { settingsStore } from "@/core/SettingsStore";
import { gameState } from "@/core/GameState";
import { MapSystem } from "@/world/MapSystem";
import { InteractionSystem } from "@/world/InteractionSystem";
import { InputManager } from "@/components/InputManager";
import { InteractionManager } from "@/components/InteractionManager";
import { MAPS } from "@/constants/assets";
import { EventBus, Events } from "@/utils/EventBus";
import { Direction } from "@/utils/AnimationManager";
import {
  World,
  SpatialSystem,
  InputSystem,
  MovementSystem,
  AnimationSystem,
  RenderBridgeSystem,
  PlayerPrefab,
  type Entity,
} from "@/ecs";

export class Game extends Scene {
  private mapSystem!: MapSystem;
  private interactionSystem!: InteractionSystem;
  private inputManager!: InputManager;
  private interactionManager!: InteractionManager;
  private world!: World;
  private spatialSystem!: SpatialSystem;
  private inputSystem!: InputSystem;
  private movementSystem!: MovementSystem;
  private animationSystem!: AnimationSystem;
  private renderBridgeSystem!: RenderBridgeSystem;
  private playerEntity?: Entity;

  constructor() {
    super("Game");
  }

  create() {
    this.mapSystem = new MapSystem(this);
    this.interactionSystem = new InteractionSystem(this);
    this.inputManager = new InputManager(this);
    this.interactionManager = new InteractionManager(this.interactionSystem);
    
    // Initialize ECS World and Systems
    this.world = new World();
    this.spatialSystem = new SpatialSystem(this.mapSystem.collisions);
    this.inputSystem = new InputSystem();
    this.movementSystem = new MovementSystem(this.spatialSystem);
    this.animationSystem = new AnimationSystem();
    this.renderBridgeSystem = new RenderBridgeSystem(this);

    this.world.addSystem(this.spatialSystem);
    this.world.addSystem(this.inputSystem);
    this.world.addSystem(this.movementSystem);
    this.world.addSystem(this.animationSystem);
    this.world.addSystem(this.renderBridgeSystem);
    
    // Wire up events
    this.switchMap = this.switchMap.bind(this);
    this.handleResize = this.handleResize.bind(this);
    
    EventBus.on(Events.MAP_SWITCH_REQUEST, this.switchMap);
    this.scale.on('resize', this.handleResize);
    
    // Calculate initial scale before loading map and spawning player
    this.handleResize({ width: this.scale.width, height: this.scale.height });

    // Initial map load
    this.switchMap(MAPS[0].key);
    
    // Launch UI Scene
    this.scene.launch("UIScene");
    
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
      this.interactionManager.destroy();
      this.world?.destroy();
  }

  private switchMap(mapKey: string) {
    const map = this.mapSystem.loadMap(mapKey);
    
    // Load interactions for this map
    this.interactionSystem.setMap(map);
    this.spatialSystem.setMap(map);
    
    // Position at the center of the map using logical tile size (32px)
    const tileSize = GAME_CONSTANTS.TILE_SIZE;
    const spawnX = Math.floor(map.width / 2) * tileSize + tileSize / 2;
    const spawnY = (Math.floor(map.height / 2) + 1) * tileSize;

    // Clear ECS world on map transition
    this.world.clear();

    // Spawn player entity declaratively via ECS
    this.playerEntity = this.world.spawnPrefab(PlayerPrefab, {
      x: spawnX,
      y: spawnY,
    });

    // Tick world with 0 delta to instantiate sprites on the render bridge immediately
    this.world.update(0);

    const playerSprite = this.renderBridgeSystem.getSprite(this.playerEntity);
    if (playerSprite) {
      if (settingsStore.camera.smoothFollow) {
        this.cameras.main.startFollow(playerSprite, false, 0.05, 0.05);
      } else {
        this.cameras.main.startFollow(playerSprite, true, 1, 1);
      }
    }

    // Ensure player position is synced to GameState on spawn
    gameState.updatePlayerPosition(
      spawnX,
      spawnY,
      Math.floor(spawnX / tileSize),
      Math.floor((spawnY - 1) / tileSize),
      Direction.DOWN
    );

    // If map was switched while menu was open, ensure new player is unlocked
    gameState.setInputLocked(false);
  }

  update(_time: number, delta: number) {
    this.inputManager?.update();
    const input = this.inputManager?.getSnapshot();
    if (input) {
      this.inputSystem?.setSnapshot(input);
    }
    this.world?.update(delta);
  }
}
