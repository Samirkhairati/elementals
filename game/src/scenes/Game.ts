import { Scene } from "phaser";
import { CONFIG } from "@/config";
import { Player } from "@/entities/Player";
import { MapSystem } from "@/world/MapSystem";
import { InteractionSystem } from "@/world/InteractionSystem";
import { InputManager } from "@/components/InputManager";
import { InteractionManager } from "@/components/InteractionManager";
import { MAPS } from "@/constants/assets";
import { EventBus, Events } from "@/utils/EventBus";

export class Game extends Scene {
  private player!: Player;
  private mapSystem!: MapSystem;
  private interactionSystem!: InteractionSystem;
  private inputManager!: InputManager;
  private interactionManager!: InteractionManager;

  constructor() {
    super("Game");
  }

  create() {
    this.mapSystem = new MapSystem(this);
    this.interactionSystem = new InteractionSystem(this);
    this.inputManager = new InputManager(this);
    this.interactionManager = new InteractionManager(this.interactionSystem);
    
    // Wire up events
    this.switchMap = this.switchMap.bind(this);
    this.handleResize = this.handleResize.bind(this);
    
    EventBus.on(Events.MAP_SWITCH_REQUEST, this.switchMap);
    this.scale.on('resize', this.handleResize);
    
    // Initial map load
    this.switchMap(MAPS[0].key);
    
    // Launch UI Scene
    this.scene.launch("UIScene");
    
    // Apply initial zoom
    this.handleResize({ width: this.scale.width, height: this.scale.height });
    
    this.events.on('destroy', this.cleanup, this);
  }

  private handleResize(gameSize: { width: number, height: number }) {
    const visibleWidth = CONFIG.visibleTilesX * CONFIG.tileSize;
    const visibleHeight = CONFIG.visibleTilesY * CONFIG.tileSize;

    // Calculate integer zoom factor to fit the visible area into the game size
    const zoomX = Math.max(1, Math.floor(gameSize.width / visibleWidth));
    const zoomY = Math.max(1, Math.floor(gameSize.height / visibleHeight));
    const zoom = Math.min(zoomX, zoomY);
    
    const scaledWidth = visibleWidth * zoom;
    const scaledHeight = visibleHeight * zoom;

    this.cameras.main.setSize(scaledWidth, scaledHeight);
    this.cameras.main.setZoom(zoom);
    
    // Center the camera viewport on the screen (letterboxing), avoiding sub-pixel offsets
    this.cameras.main.setPosition(
        Math.floor((gameSize.width - scaledWidth) / 2),
        Math.floor((gameSize.height - scaledHeight) / 2)
    );
  }

  private cleanup() {
      EventBus.off(Events.MAP_SWITCH_REQUEST, this.switchMap);
      this.scale.off('resize', this.handleResize);
      this.interactionManager.destroy();
  }

  private switchMap(mapKey: string) {
    const map = this.mapSystem.loadMap(mapKey);
    
    // Load interactions for this map
    this.interactionSystem.setMap(map);
    
    // Position at the center of the map
    const { tileSize } = CONFIG;
    const spawnX = Math.floor(map.width / 2) * tileSize + tileSize / 2;
    const spawnY = (Math.floor(map.height / 2) + 1) * tileSize;

    if (this.player) {
      this.player.destroy();
    }
    
    this.player = new Player(
      this, 
      spawnX, 
      spawnY, 
      (x, y) => this.mapSystem.collisions.isWalkable(x, y)
    );
    this.cameras.main.startFollow(this.player, true, 1, 1);

    // If map was switched while menu was open, ensure new player is unlocked
    this.player.setMovementLocked(false);
    this.interactionManager.setPlayer(this.player);
    
    // Notify UIScene of the new player
    EventBus.emit(Events.PLAYER_READY, this.player);
  }

  update(_time: number, _delta: number) {
    this.inputManager?.update();
    this.player?.update();
  }

  getPlayer(): Player | undefined {
    return this.player;
  }
}
