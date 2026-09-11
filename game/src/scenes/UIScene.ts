import { Scene } from "phaser";
import { HUDManager } from "@/components/HUDManager";

export class UIScene extends Scene {
  private hudManager!: HUDManager;

  constructor() {
    super("UIScene");
  }

  create() {
    this.hudManager = new HUDManager(this);
  }

  update(_time: number, _delta: number) {
    this.hudManager?.update();
  }
}
