import { Scene } from "phaser";
import { CONFIG } from "../config";
import { Player } from "../entities/Player";
import { DebugHUD } from "../components/DebugHUD";

export class Game extends Scene {
  private player!: Player;
  private debugHUD?: DebugHUD;

  constructor() {
    super("Game");
  }

  create() {
    this.createWorld();
    this.spawnPlayer();
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.initializeDebugTools();
  }

  private createWorld() {
    const graphics = this.add.graphics();
    const { width, height, tileSize } = CONFIG;

    // Grass pattern (checkered)
    const colors = { dark: 0x2e8b57, light: 0x3cb371 };

    for (let y = 0; y < height; y += tileSize) {
      for (let x = 0; x < width; x += tileSize) {
        const isEven = (x / tileSize + y / tileSize) % 2 === 0;
        graphics.fillStyle(isEven ? colors.light : colors.dark);
        graphics.fillRect(x, y, tileSize, tileSize);
      }
    }

    // Optional Grid Overlay
    if (CONFIG.debug.enabled && CONFIG.debug.showGrid) {
      graphics.lineStyle(1, 0xffffff, 0.1);
      for (let x = 0; x <= width; x += tileSize)
        graphics.lineBetween(x, 0, x, height);
      for (let y = 0; y <= height; y += tileSize)
        graphics.lineBetween(0, y, width, y);
    }
  }

  private spawnPlayer() {
    const { mapWidth, mapHeight, tileSize } = CONFIG;
    const startX = Math.floor(mapWidth / 2) * tileSize + tileSize / 2;
    const startY = (Math.floor(mapHeight / 2) + 1) * tileSize;

    this.player = new Player(this, startX, startY);
  }

  private initializeDebugTools() {
    if (CONFIG.debug.enabled) {
      this.debugHUD = new DebugHUD(this, this.player);
    }
  }

  update(_time: number, _delta: number) {
    this.player?.update();
    this.debugHUD?.update();
  }
}
