import { Scene } from 'phaser';
import { CONFIG } from '../config';

export class Game extends Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    debug_text?: Phaser.GameObjects.Text;

    constructor() {
        super('Game');
    }

    private player: Phaser.GameObjects.Sprite;
    private cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
    private pressedKeys: Set<string> = new Set();

    // Movement state
    private isMoving: boolean = false;
    private targetX: number = 0;
    private targetY: number = 0;


    create() {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x1B3022); // Dark base color

        this.createBackground();

        // Add the player character - bottom-aligned to the tile
        const startX = Math.floor(CONFIG.mapWidth / 2) * CONFIG.tileSize + CONFIG.tileSize / 2;
        const startY = (Math.floor(CONFIG.mapHeight / 2) + 1) * CONFIG.tileSize;
        
        this.player = this.add.sprite(startX, startY, 'player');
        this.player.setOrigin(0.5, 1); // Set origin to bottom-center
        
        // Initialize target to starting position
        this.targetX = startX;
        this.targetY = startY;

        // Setup arrow key inputs
        this.cursors = this.input.keyboard?.createCursorKeys();

        if (CONFIG.debug.enabled) {
            this.debug_text = this.add.text(20, 20, '', {
                fontFamily: '"Press Start 2P"',
                fontSize: '12px',
                color: '#ffffff',
                backgroundColor: 'rgba(0,0,0,0.5)',
                padding: { x: 10, y: 10 }
            });
            this.debug_text.setScrollFactor(0);
        }

        this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
            this.pressedKeys.add(event.key);
        });

        this.input.keyboard?.on('keyup', (event: KeyboardEvent) => {
            this.pressedKeys.delete(event.key);
        });
    }

    update(_time: number, delta: number) {
        if (!this.cursors || !this.player) return;

        if (this.isMoving) {
            this.handleMovement(delta);
        } else {
            this.handleInput();
        }

        if (CONFIG.debug.enabled) {
            this.updateDebugText();
        }
    }

    private handleInput() {
        if (!this.cursors) return;

        const { tileSize } = CONFIG;
        let direction = { x: 0, y: 0 };

        // Prioritize inputs like GBA games (one direction at a time)
        if (this.cursors.left.isDown) {
            direction.x = -1;
        } else if (this.cursors.right.isDown) {
            direction.x = 1;
        } else if (this.cursors.up.isDown) {
            direction.y = -1;
        } else if (this.cursors.down.isDown) {
            direction.y = 1;
        }

        if (direction.x !== 0 || direction.y !== 0) {
            this.targetX = this.player.x + direction.x * tileSize;
            this.targetY = this.player.y + direction.y * tileSize;

            // Check if within bounds (X: 0 to width, Y: tileSize to height since origin is bottom)
            if (this.targetX >= 0 && this.targetX <= CONFIG.width &&
                this.targetY >= CONFIG.tileSize && this.targetY <= CONFIG.height) {
                this.isMoving = true;

            } else {
                // If out of bounds, reset targets to current position
                this.targetX = this.player.x;
                this.targetY = this.player.y;
            }
        }
    }

    private handleMovement(delta: number) {
        const speed = CONFIG.playerSpeed * (delta / 1000);
        
        // Move towards target
        const dx = this.targetX - this.player.x;
        const dy = this.targetY - this.player.y;

        if (Math.abs(dx) <= speed && Math.abs(dy) <= speed) {
            // Arrived at target
            this.player.x = this.targetX;
            this.player.y = this.targetY;
            this.isMoving = false;

            // If key is still held, keep moving immediately for fluid grid movement
            this.handleInput(); 
        } else {
            // Interpolate position
            if (dx !== 0) this.player.x += Math.sign(dx) * speed;
            if (dy !== 0) this.player.y += Math.sign(dy) * speed;
        }
    }

    private createBackground() {
        const graphics = this.add.graphics();
        const { width, height, tileSize } = CONFIG;

        // Dark and Light green shades for a "grassy" feel
        const darkColor = 0x2e8b57;  // SeaGreen
        const lightColor = 0x3cb371; // MediumSeaGreen

        for (let y = 0; y < height; y += tileSize) {
            for (let x = 0; x < width; x += tileSize) {
                // Alternating colors based on grid position
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

    private updateDebugText() {
        if (!this.debug_text) return;

        const lines: string[] = [];

        if (CONFIG.debug.showKeys) {
            const keysString = Array.from(this.pressedKeys).join(', ') || 'None';
            lines.push(`DEBUG: Keys: ${keysString}`);
        }

        if (CONFIG.debug.showCoords) {
            const gridX = Math.floor(this.player.x / CONFIG.tileSize);
            const gridY = Math.floor((this.player.y - CONFIG.tileSize) / CONFIG.tileSize);
            lines.push(`DEBUG: Pos: (${Math.round(this.player.x)}, ${Math.round(this.player.y)}) [${gridX}, ${gridY}]`);
        }

        if (CONFIG.debug.showGrid) {
            lines.push(`DEBUG: Grid: ON`);
        }

        this.debug_text.setText(lines.join('\n'));
    }
}
