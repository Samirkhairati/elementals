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

    create() {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0xffffff);

        // Add the player character in the center
        this.player = this.add.sprite(CONFIG.width / 2, CONFIG.height / 2, 'player');

        // Setup arrow key inputs
        this.cursors = this.input.keyboard?.createCursorKeys();

        if (CONFIG.debug) {
            this.debug_text = this.add.text(20, 20, 'Keys: ', {
                fontFamily: 'system-ui, -apple-system, Arial, sans-serif',
                fontSize: '24px',
                color: '#333333'
            });
        }

        this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
            this.pressedKeys.add(event.key);
            this.updateDebugText();
        });

        this.input.keyboard?.on('keyup', (event: KeyboardEvent) => {
            this.pressedKeys.delete(event.key);
            this.updateDebugText();
        });
    }

    update(_time: number, delta: number) {
        if (!this.cursors || !this.player) return;

        const speed = CONFIG.playerSpeed * (delta / 1000); // Speed per second

        if (this.cursors.left.isDown) {
            this.player.x -= speed;
        }
        if (this.cursors.right.isDown) {
            this.player.x += speed;
        }

        if (this.cursors.up.isDown) {
            this.player.y -= speed;
        }
        if (this.cursors.down.isDown) {
            this.player.y += speed;
        }
    }

    private updateDebugText() {
        if (this.debug_text) {
            const keysString = Array.from(this.pressedKeys).join(', ');
            this.debug_text.setText(`Keys: ${keysString}`);
        }
    }
}
