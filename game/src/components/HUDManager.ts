import { Scene } from 'phaser';
import { Player } from '@/entities/Player';
import { DebugHUD } from '@/components/DebugHUD';
import { MapSwitcherHUD } from '@/components/MapSwitcherHUD';
import { DialogueHUD } from '@/components/DialogueHUD';
import { CONFIG } from '@/config';
import { EventBus, Events } from '@/utils/EventBus';

export class HUDManager {
    private scene: Scene;
    private debugHUD?: DebugHUD;
    private mapSwitcherHUD!: MapSwitcherHUD;
    private dialogueHUD!: DialogueHUD;
    private player?: Player;

    constructor(scene: Scene, player?: Player) {
        this.scene = scene;
        this.player = player;
        this.initializeHUDs();
        
        // Bind events
        this.onMenuToggled = this.onMenuToggled.bind(this);
        this.onInputUIDirection = this.onInputUIDirection.bind(this);
        this.onInputAction = this.onInputAction.bind(this);
        this.onShowDialogue = this.onShowDialogue.bind(this);
        this.onHideDialogue = this.onHideDialogue.bind(this);
        
        EventBus.on(Events.MENU_TOGGLED, this.onMenuToggled);
        EventBus.on(Events.INPUT_UI_DIRECTION, this.onInputUIDirection);
        EventBus.on(Events.INPUT_ACTION, this.onInputAction);
        EventBus.on(Events.SHOW_DIALOGUE, this.onShowDialogue);
        EventBus.on(Events.DIALOGUE_CLOSED, this.onHideDialogue);
        
        this.scene.events.on('destroy', this.cleanup, this);
    }

    private cleanup() {
        EventBus.off(Events.MENU_TOGGLED, this.onMenuToggled);
        EventBus.off(Events.INPUT_UI_DIRECTION, this.onInputUIDirection);
        EventBus.off(Events.INPUT_ACTION, this.onInputAction);
        EventBus.off(Events.SHOW_DIALOGUE, this.onShowDialogue);
        EventBus.off(Events.DIALOGUE_CLOSED, this.onHideDialogue);
    }

    private initializeHUDs() {
        if (CONFIG.debug.enabled && this.player) {
            this.debugHUD = new DebugHUD(this.scene, this.player);
        }

        this.mapSwitcherHUD = new MapSwitcherHUD(this.scene, (mapKey) => {
            EventBus.emit(Events.MAP_SWITCH_REQUEST, mapKey);
        });

        this.dialogueHUD = new DialogueHUD(this.scene);
    }

    public update() {
        this.debugHUD?.update();
    }

    public setPlayer(player: Player) {
        this.player = player;
        this.debugHUD?.setPlayer(player);
    }

    private onMenuToggled() {
        if (this.dialogueHUD.isVisible) return; // Don't open map menu if dialogue is open
        
        this.mapSwitcherHUD.toggle();
        // Lock player movement if map switcher is open
        if (this.player) {
            this.player.setMovementLocked(this.mapSwitcherHUD.isVisible);
        }
    }

    private onShowDialogue(message: string) {
        this.dialogueHUD.show(message);
        if (this.player) {
            this.player.setMovementLocked(true);
        }
    }

    private onHideDialogue() {
        this.dialogueHUD.hide();
        if (this.player && !this.mapSwitcherHUD.isVisible) {
            this.player.setMovementLocked(false);
        }
    }

    private onInputUIDirection(key: string) {
        if (!this.mapSwitcherHUD.isVisible) return;

        if (key === 'ARROWUP') this.mapSwitcherHUD.moveSelection(-1);
        if (key === 'ARROWDOWN') this.mapSwitcherHUD.moveSelection(1);
    }
    
    private onInputAction() {
        if (this.mapSwitcherHUD.isVisible) {
            this.mapSwitcherHUD.confirm();
        }
    }

    get isMapMenuOpen() {
        return this.mapSwitcherHUD.isVisible;
    }
}
