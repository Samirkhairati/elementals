import { Scene, GameObjects } from 'phaser';
import { MAPS } from '@/constants/assets';

export class MapSwitcherHUD {
    private container: GameObjects.Container;
    private menuText: GameObjects.BitmapText;
    private background: GameObjects.Graphics;
    private isOpen: boolean = false;
    private selectedIndex: number = 0;
    private onSelect: (mapKey: string) => void;

    constructor(scene: Scene, onSelect: (mapKey: string) => void) {
        this.onSelect = onSelect;

        this.container = scene.add.container(20, 100);
        this.container.setScrollFactor(0);
        this.container.setVisible(false);
        this.container.setDepth(1000); // Always on top

        this.background = scene.add.graphics();
        this.container.add(this.background);

        this.menuText = scene.add.bitmapText(10, 10, 'PokemonFont', '', 72);
        this.container.add(this.menuText);
    }

    toggle() {
        this.isOpen = !this.isOpen;
        this.container.setVisible(this.isOpen);
        if (this.isOpen) {
            this.updateMenu();
        }
    }

    moveSelection(delta: number) {
        if (!this.isOpen) return;
        this.selectedIndex = (this.selectedIndex + delta + MAPS.length) % MAPS.length;
        this.updateMenu();
    }

    confirm() {
        if (!this.isOpen) return;
        this.onSelect(MAPS[this.selectedIndex].key);
        this.toggle();
    }

    private updateMenu() {
        const lines = MAPS.map((m, i) => {
            const prefix = i === this.selectedIndex ? '> ' : '  ';
            return `${prefix}${m.name}`;
        });
        this.menuText.setText(['SELECT MAP:', '----------', ...lines].join('\n'));
        
        // Redraw background
        this.background.clear();
        this.background.fillStyle(0x000000, 0.8);
        this.background.fillRect(0, 0, this.menuText.width + 20, this.menuText.height + 20);
    }

    get isVisible() {
        return this.isOpen;
    }
}
