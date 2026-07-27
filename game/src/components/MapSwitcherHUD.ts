import { Scene, GameObjects } from 'phaser';
import { MAPS } from '@/constants/assets';

export class MapSwitcherHUD {
    private container: GameObjects.Container;
    private background: GameObjects.Graphics;
    private headerText: GameObjects.BitmapText;
    private menuItems: GameObjects.BitmapText[] = [];
    private isOpen: boolean = false;
    private selectedIndex: number = 0;
    private onSelect: (mapKey: string) => void;

    constructor(scene: Scene, onSelect: (mapKey: string) => void) {
        this.onSelect = onSelect;

        this.container = scene.add.container(40, 40);
        this.container.setScrollFactor(0);
        this.container.setVisible(false);
        this.container.setDepth(1000); // Always on top

        this.background = scene.add.graphics();
        this.container.add(this.background);

        this.headerText = scene.add.bitmapText(20, 20, 'PokemonFont', 'SELECT MAP:\n----------', 72);
        this.container.add(this.headerText);

        const startY = 20 + this.headerText.height;
        MAPS.forEach((map, index) => {
            const item = scene.add.bitmapText(20, startY + (index * 72), 'PokemonFont', map.name, 72);
            item.setInteractive({ useHandCursor: true });
            
            item.on('pointerover', () => {
                this.selectedIndex = index;
                this.updateMenu();
            });

            item.on('pointerdown', () => {
                this.selectedIndex = index;
                this.confirm();
            });

            this.menuItems.push(item);
            this.container.add(item);
        });
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
        let maxWidth = this.headerText.width;
        let totalHeight = this.headerText.height;

        this.menuItems.forEach((item, index) => {
            const isSelected = index === this.selectedIndex;
            // Using '*' because '>' is missing from PokemonFont2
            item.setText(isSelected ? `* ${MAPS[index].name}` : `  ${MAPS[index].name}`);
            
            if (item.width > maxWidth) maxWidth = item.width;
            totalHeight += 72; // Approximate height per line
        });
        
        // Redraw background
        this.background.clear();
        this.background.fillStyle(0x000000, 0.8);
        this.background.fillRect(0, 0, maxWidth + 40, totalHeight + 40);
    }

    get isVisible() {
        return this.isOpen;
    }
}
