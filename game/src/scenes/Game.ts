import { Scene } from "phaser";
import { CONFIG } from "@/config";
import { Player } from "@/entities/Player";
import { MapSystem } from "@/world/MapSystem";
import { HUDManager } from "@/components/HUDManager";
import { MAPS } from "@/constants/assets";

export class Game extends Scene {
  private player!: Player;
  private mapSystem!: MapSystem;
  private hudManager!: HUDManager;

  constructor() {
    super("Game");
  }

  create() {
    this.mapSystem = new MapSystem(this);
    
    // Initial map load
    this.switchMap(MAPS[0].key);
    
    this.hudManager = new HUDManager(this, this.player, (key) => this.switchMap(key));
    this.setupGlobalControls();
  }

  private switchMap(mapKey: string) {
    const map = this.mapSystem.loadMap(mapKey);
    
    // Position at the center of the map
    const { tileSize } = CONFIG;
    const spawnX = Math.floor(map.width / 2) * tileSize + tileSize / 2;
    const spawnY = (Math.floor(map.height / 2) + 1) * tileSize;

    if (this.player) {
      this.player.destroy();
    }
    
    this.player = new Player(this, spawnX, spawnY, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // If map was switched while menu was open, ensure new player is unlocked
    this.player.setMovementLocked(false);
    this.hudManager?.setPlayer(this.player);
  }

  private setupGlobalControls() {
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      const key = event.key.toUpperCase();
      
      if (key === CONFIG.controls.menu) {
        this.hudManager.toggleMapMenu(this.player);
      } else {
        this.hudManager.handleInput(event);
      }
    });
  }

  update(_time: number, _delta: number) {
    this.player?.update();
    this.hudManager?.update();
  }
}
