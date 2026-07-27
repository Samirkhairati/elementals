import { Scene } from "phaser";
import { HUDManager } from "@/components/HUDManager";
import { EventBus, Events } from "@/utils/EventBus";

export class UIScene extends Scene {
  private hudManager!: HUDManager;

  constructor() {
    super("UIScene");
  }

  create() {
    // We do NOT pass the player initially because it is managed by the Game scene.
    // The HUDManager will listen for player updates.
    this.hudManager = new HUDManager(this);
    
    // Fetch initial player if it exists
    const gameScene = this.scene.get("Game") as import('./Game').Game;
    if (gameScene) {
      const player = gameScene.getPlayer();
      if (player) {
          EventBus.emit(Events.PLAYER_READY, player);
      }
    }
  }

  update(_time: number, _delta: number) {
    this.hudManager?.update();
  }
}
