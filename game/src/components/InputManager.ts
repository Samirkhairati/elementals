import { Scene, Input, type Types } from 'phaser';
import { EventBus, Events } from '@/utils/EventBus';
import { CONFIG } from '@/config';
import { Direction } from '@/utils/AnimationManager';

export class InputManager {
    private scene: Scene;
    private cursors: Types.Input.Keyboard.CursorKeys;
    private runKey: Input.Keyboard.Key;

    constructor(scene: Scene) {
        this.scene = scene;
        this.cursors = scene.input.keyboard!.createCursorKeys();
        this.runKey = scene.input.keyboard!.addKey(CONFIG.controls.run);

        this.setupGlobalListeners();
    }

    private setupGlobalListeners() {
        this.scene.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
            const key = event.key.toUpperCase();
            
            if (key === CONFIG.controls.menu) {
                EventBus.emit(Events.MENU_TOGGLED);
            } else if (key === CONFIG.controls.action) {
                EventBus.emit(Events.INPUT_ACTION);
            } else if (['ARROWUP', 'ARROWDOWN', 'ARROWLEFT', 'ARROWRIGHT'].includes(key)) {
                // Let the HUD Manager know for navigation
                EventBus.emit(Events.INPUT_UI_DIRECTION, key);
            }
        });
    }

    public update() {
        const activeMapping = this.getKeyboardMapping();

        if (activeMapping) {
            EventBus.emit(Events.INPUT_DIRECTION, activeMapping.direction, this.runKey.isDown, activeMapping.key.getDuration());
        } else {
            EventBus.emit(Events.INPUT_DIRECTION, null, false, 0);
        }
    }

    private getKeyboardMapping() {
        const { left, right, up, down } = this.cursors;
        const keys = [
            { direction: Direction.LEFT, key: left },
            { direction: Direction.RIGHT, key: right },
            { direction: Direction.UP, key: up },
            { direction: Direction.DOWN, key: down },
        ];

        // Filter for pressed keys and find the most recently pressed one
        return (
            keys
                .filter((k) => k.key.isDown)
                .sort((a, b) => b.key.timeDown - a.key.timeDown)[0] || null
        );
    }
}
