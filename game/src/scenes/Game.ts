import { Scene } from 'phaser';
import { CONFIG } from '../config';
import { Player } from '../entities/Player';
import { DebugHUD } from '../components/DebugHUD';

export class Game extends Scene {
    private player!: Player;
    private debugHUD?: DebugHUD;

    constructor() {
        super('Game');
    }

    create() {
        this.cameras.main.setBackgroundColor(0x1B3022);
        
        this.createBackground();

        // Calculate starting position
        const startX = Math.floor(CONFIG.mapWidth / 2) * CONFIG.tileSize + CONFIG.tileSize / 2;
        const startY = (Math.floor(CONFIG.mapHeight / 2) + 1) * CONFIG.tileSize;
        
        // Initialize Player
        this.player = new Player(this, startX, startY);
        
        // Initialize HUD if debug mode is enabled
        if (CONFIG.debug.enabled) {
            this.debugHUD = new DebugHUD(this, this.player);
        }
    }

    update(_time: number, delta: number) {
        if (this.player) {
            this.player.update(delta);
        }

        if (this.debugHUD) {
            this.debugHUD.update();
        }
    }

    private createBackground() {
        const graphics = this.add.graphics();
        const { width, height, tileSize } = CONFIG;

        // Dark and Light green shades for a "grassy" feel
        const darkColor = 0x2e8b57;
        const lightColor = 0x3cb371;

        for (let y = 0; y < height; y += tileSize) {
            for (let x = 0; x < width; x += tileSize) {
                const isEven = (x / tileSize + y / tileSize) % 2 === 0;
                graphics.fillStyle(isEven ? lightColor : darkColor);
                graphics.fillRect(x, y, tileSize, tileSize);
            }
        }

        if (CONFIG.debug.enabled && CONFIG.debug.showGrid) {
            graphics.lineStyle(1, 0xffffff, 0.1);
            for (let x = 0; x <= width; x += tileSize) {
                graphics.lineBetween(x, 0, x, height);
            }
            for (let y = 0; y <= height; y += tileSize) {
                graphics.lineBetween(0, y, width, y);
            }
        }
    }
}
