import { Scene, GameObjects } from 'phaser';
import { CONFIG } from '../config';
import { Player } from '../entities/Player';

export class DebugHUD {
    private text: GameObjects.Text;
    private scene: Scene;
    private player: Player;
    private pressedKeys: Set<string> = new Set();

    constructor(scene: Scene, player: Player) {
        this.scene = scene;
        this.player = player;

        this.text = scene.add.text(20, 20, '', {
            fontFamily: '"Press Start 2P"',
            fontSize: '12px',
            color: '#ffffff',
            backgroundColor: 'rgba(0,0,0,0.5)',
            padding: { x: 10, y: 10 }
        });
        this.text.setScrollFactor(0);

        // Track keys
        this.scene.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
            this.pressedKeys.add(event.key);
        });
        this.scene.input.keyboard?.on('keyup', (event: KeyboardEvent) => {
            this.pressedKeys.delete(event.key);
        });

        // Initialize display immediately
        this.update();
    }

    update() {
        if (!CONFIG.debug.enabled) {
            this.text.setVisible(false);
            return;
        }

        this.text.setVisible(true);
        const lines: string[] = [];

        if (CONFIG.debug.showKeys) {
            const keysString = Array.from(this.pressedKeys).join(', ') || 'None';
            lines.push(`DEBUG: Keys: ${keysString}`);
        }

        if (CONFIG.debug.showCoords) {
            const grid = this.player.getGridPosition();
            lines.push(`DEBUG: Pos: (${Math.round(this.player.x)}, ${Math.round(this.player.y)}) [${grid.x}, ${grid.y}]`);
        }

        if (CONFIG.debug.showGrid) {
            lines.push(`DEBUG: Grid: ON`);
        }

        this.text.setText(lines.join('\n'));
    }
}
