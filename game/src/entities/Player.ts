import { Scene, GameObjects, Types } from 'phaser';
import { CONFIG } from '../config';

export class Player extends GameObjects.Sprite {
    private cursors: Types.Input.Keyboard.CursorKeys;
    private isMoving: boolean = false;
    private targetX: number = 0;
    private targetY: number = 0;

    constructor(scene: Scene, x: number, y: number) {
        super(scene, x, y, 'player');
        
        scene.add.existing(this);
        this.setOrigin(0.5, 1);
        
        this.targetX = x;
        this.targetY = y;
        this.cursors = scene.input.keyboard!.createCursorKeys();
    }

    update(delta: number) {
        if (this.isMoving) {
            this.handleMovement(delta);
        } else {
            this.handleInput();
        }
    }

    private handleInput() {
        const { tileSize } = CONFIG;
        let direction = { x: 0, y: 0 };

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
            const nextX = this.x + direction.x * tileSize;
            const nextY = this.y + direction.y * tileSize;

            // Check if within bounds
            if (nextX >= 0 && nextX <= CONFIG.width &&
                nextY >= CONFIG.tileSize && nextY <= CONFIG.height) {
                this.targetX = nextX;
                this.targetY = nextY;
                this.isMoving = true;
            }
        }
    }

    private handleMovement(delta: number) {
        const speed = CONFIG.playerSpeed * (delta / 1000);
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;

        if (Math.abs(dx) <= speed && Math.abs(dy) <= speed) {
            this.x = this.targetX;
            this.y = this.targetY;
            this.isMoving = false;
            
            // For fluid movement, check input again immediately
            this.handleInput();
        } else {
            if (dx !== 0) this.x += Math.sign(dx) * speed;
            if (dy !== 0) this.y += Math.sign(dy) * speed;
        }
    }

    getGridPosition() {
        return {
            x: Math.floor(this.x / CONFIG.tileSize),
            y: Math.floor((this.y - CONFIG.tileSize) / CONFIG.tileSize)
        };
    }
}
