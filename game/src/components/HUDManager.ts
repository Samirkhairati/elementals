import { Scene } from 'phaser';
import { Player } from '@/entities/Player';
import { DebugHUD } from '@/components/DebugHUD';
import { MapSwitcherHUD } from '@/components/MapSwitcherHUD';
import { CONFIG } from '@/config';

export class HUDManager {
    private scene: Scene;
    private debugHUD?: DebugHUD;
    private mapSwitcherHUD!: MapSwitcherHUD;

    constructor(scene: Scene, player: Player, onMapSelect: (mapKey: string) => void) {
        this.scene = scene;
        this.initializeHUDs(player, onMapSelect);
    }

    private initializeHUDs(player: Player, onMapSelect: (mapKey: string) => void) {
        if (CONFIG.debug.enabled) {
            this.debugHUD = new DebugHUD(this.scene, player);
        }

        this.mapSwitcherHUD = new MapSwitcherHUD(this.scene, (mapKey) => {
            onMapSelect(mapKey);
        });
    }

    public update() {
        this.debugHUD?.update();
    }

    public setPlayer(player: Player) {
        this.debugHUD?.setPlayer(player);
    }

    public toggleMapMenu(player: Player) {
        this.mapSwitcherHUD.toggle();
        player.setMovementLocked(this.mapSwitcherHUD.isVisible);
    }

    public handleInput(event: KeyboardEvent) {
        if (!this.mapSwitcherHUD.isVisible) return false;

        if (event.key === 'ArrowUp') this.mapSwitcherHUD.moveSelection(-1);
        if (event.key === 'ArrowDown') this.mapSwitcherHUD.moveSelection(1);
        if (event.key.toUpperCase() === CONFIG.controls.action) {
            this.mapSwitcherHUD.confirm();
        }
        return true;
    }

    get isMapMenuOpen() {
        return this.mapSwitcherHUD.isVisible;
    }
}
