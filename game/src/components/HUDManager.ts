import { Scene } from 'phaser';
import { DebugHUD } from '@/components/DebugHUD';
import { MapSwitcherHUD } from '@/components/MapSwitcherHUD';
import { DialogueHUD } from '@/components/DialogueHUD';
import { ChoiceMenuHUD } from '@/components/ChoiceMenuHUD';
import type { DialoguePayload } from '@/components/dialogueText';
import { settingsStore } from '@/core/SettingsStore';
import { gameState } from '@/core/GameState';
import { EventBus, Events } from '@/utils/EventBus';

export interface ShowChoicesRequest {
    id: number;
    options: string[];
    allowCancel: boolean;
}

export class HUDManager {
    private scene: Scene;
    private debugHUD?: DebugHUD;
    private mapSwitcherHUD!: MapSwitcherHUD;
    private dialogueHUD!: DialogueHUD;
    private choiceMenuHUD!: ChoiceMenuHUD;
    private activeChoiceId: number | null = null;

    constructor(scene: Scene) {
        this.scene = scene;
        this.initializeHUDs();
        
        // Bind events
        this.onMenuToggled = this.onMenuToggled.bind(this);
        this.onInputUIDirection = this.onInputUIDirection.bind(this);
        this.onInputAction = this.onInputAction.bind(this);
        this.onInputCancel = this.onInputCancel.bind(this);
        this.onShowDialogue = this.onShowDialogue.bind(this);
        this.onHideDialogue = this.onHideDialogue.bind(this);
        this.onShowChoices = this.onShowChoices.bind(this);
        this.onHideChoices = this.onHideChoices.bind(this);
        
        EventBus.on(Events.MENU_TOGGLED, this.onMenuToggled);
        EventBus.on(Events.INPUT_UI_DIRECTION, this.onInputUIDirection);
        EventBus.on(Events.INPUT_ACTION, this.onInputAction);
        EventBus.on(Events.INPUT_CANCEL, this.onInputCancel);
        EventBus.on(Events.SHOW_DIALOGUE, this.onShowDialogue);
        EventBus.on(Events.DIALOGUE_CLOSED, this.onHideDialogue);
        EventBus.on(Events.SHOW_CHOICES, this.onShowChoices);
        EventBus.on(Events.HIDE_CHOICES, this.onHideChoices);
        
        this.scene.events.on('destroy', this.cleanup, this);
    }

    private cleanup() {
        EventBus.off(Events.MENU_TOGGLED, this.onMenuToggled);
        EventBus.off(Events.INPUT_UI_DIRECTION, this.onInputUIDirection);
        EventBus.off(Events.INPUT_ACTION, this.onInputAction);
        EventBus.off(Events.INPUT_CANCEL, this.onInputCancel);
        EventBus.off(Events.SHOW_DIALOGUE, this.onShowDialogue);
        EventBus.off(Events.DIALOGUE_CLOSED, this.onHideDialogue);
        EventBus.off(Events.SHOW_CHOICES, this.onShowChoices);
        EventBus.off(Events.HIDE_CHOICES, this.onHideChoices);
    }

    private initializeHUDs() {
        if (settingsStore.debug.enabled) {
            this.debugHUD = new DebugHUD(this.scene);
        }

        this.mapSwitcherHUD = new MapSwitcherHUD(this.scene, (mapKey) => {
            EventBus.emit(Events.MAP_SWITCH_REQUEST, mapKey);
        });

        this.dialogueHUD = new DialogueHUD(this.scene);
        this.choiceMenuHUD = new ChoiceMenuHUD(this.scene, (index) => this.onChoiceResult(index));
    }

    public update() {
        this.debugHUD?.update();
    }

    private onMenuToggled() {
        // Don't open the map menu over a dialogue or a choice menu
        if (this.dialogueHUD.isVisible || this.choiceMenuHUD.isVisible) return;
        
        this.mapSwitcherHUD.toggle();
        gameState.setInputLocked(this.mapSwitcherHUD.isVisible, 'menu');
    }

    private onShowDialogue(payload: DialoguePayload) {
        this.dialogueHUD.show(payload);
        gameState.setInputLocked(true, 'dialogue');
    }

    private onHideDialogue() {
        this.dialogueHUD.hide();
        gameState.setInputLocked(false, 'dialogue');
    }

    private onShowChoices(request: ShowChoicesRequest) {
        this.activeChoiceId = request.id;
        this.choiceMenuHUD.show(request.options, request.allowCancel);
    }

    private onHideChoices() {
        this.activeChoiceId = null;
        this.choiceMenuHUD.hide();
    }

    private onChoiceResult(index: number) {
        const id = this.activeChoiceId;
        this.activeChoiceId = null;
        if (id !== null) EventBus.emit(Events.CHOICE_SELECTED, id, index);
    }

    private onInputUIDirection(key: string) {
        const delta = key === 'ARROWUP' ? -1 : key === 'ARROWDOWN' ? 1 : 0;
        if (delta === 0) return;
        if (this.choiceMenuHUD.isVisible) return this.choiceMenuHUD.moveSelection(delta);
        if (this.mapSwitcherHUD.isVisible) this.mapSwitcherHUD.moveSelection(delta);
    }
    
    private onInputAction() {
        if (this.choiceMenuHUD.isVisible) {
            this.choiceMenuHUD.confirm();
        } else if (this.dialogueHUD.isVisible) {
            // Next page, or close after the last one
            if (!this.dialogueHUD.advance()) EventBus.emit(Events.DIALOGUE_CLOSED);
        } else if (this.mapSwitcherHUD.isVisible) {
            this.mapSwitcherHUD.confirm();
        }
    }

    private onInputCancel() {
        this.choiceMenuHUD.cancel();
    }

    get isMapMenuOpen() {
        return this.mapSwitcherHUD.isVisible;
    }
}
