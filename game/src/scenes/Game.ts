import { Scene } from "phaser";
import { CONFIG } from "@/config";
import { Player } from "@/entities/Player";
import { MapSystem } from "@/world/MapSystem";
import { InteractionSystem } from "@/world/InteractionSystem";
import { HUDManager } from "@/components/HUDManager";
import { InputManager } from "@/components/InputManager";
import { InteractionManager } from "@/components/InteractionManager";
import { MAPS } from "@/constants/assets";
import { EventBus, Events } from "@/utils/EventBus";

export class Game extends Scene {
  private player!: Player;
  private mapSystem!: MapSystem;
  private interactionSystem!: InteractionSystem;
  private hudManager!: HUDManager;
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
    EventBus.on(Events.MAP_SWITCH_REQUEST, this.switchMap);
    
    // Initial map load
    this.switchMap(MAPS[0].key);
    
    this.hudManager = new HUDManager(this, this.player);
    
    this.events.on('destroy', this.cleanup, this);
  }

  private cleanup() {
      EventBus.off(Events.MAP_SWITCH_REQUEST, this.switchMap);
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
    this.hudManager?.setPlayer(this.player);
    this.interactionManager.setPlayer(this.player);
  }

  update(_time: number, _delta: number) {
    this.inputManager?.update();
    this.player?.update();
    this.hudManager?.update();
  }
}
