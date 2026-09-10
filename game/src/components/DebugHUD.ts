import { Scene, GameObjects } from 'phaser';
import { settingsStore } from '@/core/SettingsStore';
import { Player } from '@/entities/Player';

export class DebugHUD {
    private text: GameObjects.BitmapText;
    private background: GameObjects.Graphics;
    private scene: Scene;
    private player?: Player;
    private pressedKeys: Set<string> = new Set();

    constructor(scene: Scene, player?: Player) {
        this.scene = scene;
        this.player = player;

        this.background = scene.add.graphics();
        this.background.setScrollFactor(0);
        this.background.setDepth(1001);

        this.text = scene.add.bitmapText(30, 30, 'PokemonFont', '', 72);
        this.text.setScrollFactor(0);
        this.text.setDepth(1002);

        const MODIFIERS = ['Meta', 'Shift', 'Control', 'Alt'];

        // Track keys
        this.scene.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
            if (!MODIFIERS.includes(event.key)) {
                this.pressedKeys.add(event.key);
            }
        });
        this.scene.input.keyboard?.on('keyup', (event: KeyboardEvent) => {
            this.pressedKeys.delete(event.key);
        });

        // Clear keys when switching back to the game to prevent "stuck" keys (like Meta)
        this.scene.game.events.on('focus', () => this.pressedKeys.clear());
        this.scene.events.on('resume', () => this.pressedKeys.clear());

        // Initialize display immediately
        this.update();
    }

    setPlayer(player: Player) {
        this.player = player;
    }

    update() {
        if (!settingsStore.debug.enabled) {
            this.text.setVisible(false);
            this.background.setVisible(false);
            return;
        }

        this.text.setVisible(true);
        this.background.setVisible(true);
        const lines: string[] = [];

        if (settingsStore.debug.showKeys) {
            const keysString = Array.from(this.pressedKeys).join(', ') || 'None';
            lines.push(`DEBUG: Keys: ${keysString}`);
        }

        if (settingsStore.debug.showCoords && this.player) {
            const grid = this.player.getGridPosition();
            lines.push(`DEBUG: Pos: (${Math.round(this.player.x)}, ${Math.round(this.player.y)}) [${grid.x}, ${grid.y}]`);
        }

        if (settingsStore.debug.showGrid) {
            lines.push(`DEBUG: Grid: ON`);
        }

        lines.push(`DEBUG: Movement: ${settingsStore.tileBasedMovement ? 'Tile-Based' : 'Continuous'} (Press 'T' to toggle)`);

        this.text.setText(lines.join('\n'));
        
        // Redraw background
        this.background.clear();
        this.background.fillStyle(0xffffff, 0.9);
        this.background.fillRect(20, 20, this.text.width + 20, this.text.height + 20);
    }
}
