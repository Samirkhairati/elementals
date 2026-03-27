import { Scene, GameObjects } from 'phaser';
import { MAPS } from '@/constants/assets';

export class MapSwitcherHUD {
    private container: GameObjects.Container;
    private menuText: GameObjects.Text;
    private isOpen: boolean = false;
    private selectedIndex: number = 0;
    private onSelect: (mapKey: string) => void;

    constructor(scene: Scene, onSelect: (mapKey: string) => void) {
        this.onSelect = onSelect;

        this.container = scene.add.container(20, 100);
        this.container.setScrollFactor(0);
        this.container.setVisible(false);
        this.container.setDepth(1000); // Always on top

        this.menuText = scene.add.text(0, 0, '', {
            fontFamily: '"Press Start 2P"',
            fontSize: '10px',
            color: '#ffffff',
            backgroundColor: 'rgba(0,0,0,0.8)',
            padding: { x: 10, y: 10 },
            lineSpacing: 10
        });
        
        this.container.add(this.menuText);

        // Fix font loading race condition
        if (document.fonts) {
            document.fonts.ready.then(() => {
                if (this.menuText.active) {
                    this.menuText.setFontFamily('"Press Start 2P"');
                }
            });
        }
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
    }

    get isVisible() {
        return this.isOpen;
    }
}
