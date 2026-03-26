import { Scene } from 'phaser';
import { CONFIG } from '../config';

export class Game extends Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    debug_text?: Phaser.GameObjects.Text;

    constructor() {
        super('Game');
    }

    private pressedKeys: Set<string> = new Set();

    create() {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0xffffff);

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

    private updateDebugText() {
        if (this.debug_text) {
            const keysString = Array.from(this.pressedKeys).join(', ');
            this.debug_text.setText(`Keys: ${keysString}`);
        }
    }
}
