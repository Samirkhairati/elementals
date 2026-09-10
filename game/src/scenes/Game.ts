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
    
    // Calculate initial scale before loading map and spawning player
    this.handleResize({ width: this.scale.width, height: this.scale.height });

    // Initial map load
    this.switchMap(MAPS[0].key);
    
    // Launch UI Scene
    this.scene.launch("UIScene");
    
    this.events.on('destroy', this.cleanup, this);
  }

  private handleResize(gameSize: { width: number, height: number }) {
    const visibleWidth = CONFIG.visibleTilesX * CONFIG.tileSize;
    const visibleHeight = CONFIG.visibleTilesY * CONFIG.tileSize;

    // Calculate integer scale factor to fit the visible area into the game size
    const scaleX = Math.max(1, Math.floor(gameSize.width / visibleWidth));
    const scaleY = Math.max(1, Math.floor(gameSize.height / visibleHeight));
    const newScale = Math.min(scaleX, scaleY);
    
    const scaledWidth = visibleWidth * newScale;
    const scaledHeight = visibleHeight * newScale;

    this.cameras.main.setSize(scaledWidth, scaledHeight);
    this.cameras.main.setZoom(1); // Assets are scaled directly; camera zoom stays 1
    
    // Center the camera viewport on the screen (letterboxing), avoiding sub-pixel offsets
    this.cameras.main.setPosition(
        Math.floor((gameSize.width - scaledWidth) / 2),
        Math.floor((gameSize.height - scaledHeight) / 2)
    );

    if (CONFIG.renderScale !== newScale) {
        const oldScale = CONFIG.renderScale;
        CONFIG.renderScale = newScale;
        EventBus.emit(Events.RENDER_SCALE_CHANGED, newScale, oldScale);
    }
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
    
    // Position at the center of the map using scaled tile size
    const scaledTileSize = CONFIG.tileSize * CONFIG.renderScale;
    const spawnX = Math.floor(map.width / 2) * scaledTileSize + scaledTileSize / 2;
    const spawnY = (Math.floor(map.height / 2) + 1) * scaledTileSize;

    if (this.player) {
      this.player.destroy();
    }
    
    this.player = new Player(
      this, 
      spawnX, 
      spawnY, 
      (x, y) => this.mapSystem.collisions.isWalkable(x, y)
    );
    if (CONFIG.camera.smoothFollow) {
      this.cameras.main.startFollow(this.player, false, 0.05, 0.05);
    } else {
      this.cameras.main.startFollow(this.player, true, 1, 1);
    }

    // If map was switched while menu was open, ensure new player is unlocked
    this.player.setMovementLocked(false);
    this.interactionManager.setPlayer(this.player);
    
    // Notify UIScene of the new player
    EventBus.emit(Events.PLAYER_READY, this.player);
  }

  update(_time: number, delta: number) {
    this.inputManager?.update();
    this.player?.update(delta);
  }

  getPlayer(): Player | undefined {
    return this.player;
  }
}
