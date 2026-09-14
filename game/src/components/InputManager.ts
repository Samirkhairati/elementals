import { Scene, Input, type Types } from 'phaser';
import { EventBus, Events } from '@/utils/EventBus';
import { settingsStore } from '@/core/SettingsStore';
import { Direction } from '@/utils/AnimationManager';
import type { InputSnapshot } from '@/input/InputSnapshot';

export class InputManager {
    private scene: Scene;
    private cursors: Types.Input.Keyboard.CursorKeys;
    private runKey: Input.Keyboard.Key;
    private currentSnapshot: InputSnapshot = {
        direction: null,
        vector: { x: 0, y: 0 },
        isRunning: false,
        holdDuration: 0,
    };

    constructor(scene: Scene) {
        this.scene = scene;
        this.cursors = scene.input.keyboard!.createCursorKeys();
        this.runKey = scene.input.keyboard!.addKey(settingsStore.controls.run);

        this.setupGlobalListeners();
    }

    private setupGlobalListeners() {
        this.scene.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
            const key = event.key.toUpperCase();
            
            if (key === settingsStore.controls.menu) {
                if (event.repeat) return;
                EventBus.emit(Events.MENU_TOGGLED);
            } else if (
                key === settingsStore.controls.action ||
                key === ' ' ||
                key === 'SPACE' ||
                key === 'SPACEBAR' ||
                key === 'ENTER' ||
                key === 'RETURN' ||
                key === 'E' ||
                key === 'Z'
            ) {
                if (event.repeat) return;
                EventBus.emit(Events.INPUT_ACTION);
            } else if (['ARROWUP', 'ARROWDOWN', 'ARROWLEFT', 'ARROWRIGHT'].includes(key)) {
                // Let the HUD Manager know for navigation
                EventBus.emit(Events.INPUT_UI_DIRECTION, key);
            } else if (key === 'T') {
                if (event.repeat) return;
                settingsStore.toggleTileBasedMovement();
            }
        });
    }

    public update() {
        const activeMapping = this.getKeyboardMapping();
        const { left, right, up, down } = this.cursors;
        const vector = {
            x: (right.isDown ? 1 : 0) - (left.isDown ? 1 : 0),
            y: (down.isDown ? 1 : 0) - (up.isDown ? 1 : 0),
        };

        this.currentSnapshot = {
            direction: activeMapping ? activeMapping.direction : null,
            vector,
            isRunning: this.runKey.isDown,
            holdDuration: activeMapping ? activeMapping.key.getDuration() : 0,
        };
    }

    public getSnapshot(): InputSnapshot {
        return this.currentSnapshot;
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
