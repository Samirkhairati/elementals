import { Scene } from 'phaser';
import { CONFIG } from '../config';

export class Game extends Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    msg_text: Phaser.GameObjects.Text;
    debug_text?: Phaser.GameObjects.Text;

    constructor() {
        super('Game');
    }

    private pressedKeys: Set<string> = new Set();

    create() {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x00ff00);

        this.add.image(512, 384, 'background').setAlpha(0.5);

        this.msg_text = this.add.text(512, 384, 'Phaser + TypeScript + Vite', {
            fontFamily: 'Arial Black', fontSize: 38, color: '#ffffff',
            stroke: '#000000', strokeThickness: 8,
            align: 'center'
        });
        this.msg_text.setOrigin(0.5);

        if (CONFIG.debug) {
            this.debug_text = this.add.text(10, 10, 'Keys: ', {
                fontFamily: 'Courier',
                fontSize: 24,
                color: '#00ff00',
                stroke: '#000000',
                strokeThickness: 4
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
