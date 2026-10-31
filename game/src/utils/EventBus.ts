import { Events as PhaserEvents } from 'phaser';

// Global Event Bus
export const EventBus = new PhaserEvents.EventEmitter();

// Centralized event names to avoid typos
export const Events = {
    // Input Events
    INPUT_UI_DIRECTION: 'input-ui-direction',
    INPUT_ACTION: 'input-action',
    INPUT_CANCEL: 'input-cancel',
    MENU_TOGGLED: 'menu-toggled',
    
    // Game State Events
    MAP_SWITCH_REQUEST: 'map-switch-request',
    PLAYER_MOVED: 'player-moved',
    RENDER_SCALE_CHANGED: 'render-scale-changed',
    MOVEMENT_MODE_CHANGED: 'movement-mode-changed',
    INPUT_LOCK_CHANGED: 'input-lock-changed',
    
    // UI Events
    /** Payload: a plain string (legacy) or `{ speaker?: string; text: string }`. */
    SHOW_DIALOGUE: 'show-dialogue',
    DIALOGUE_CLOSED: 'dialogue-closed',
    /** Payload: `{ id: number; options: string[]; allowCancel: boolean }`. */
    SHOW_CHOICES: 'show-choices',
    /** Payload: `(id: number, index: number)`; index -1 = cancelled. Closes the menu when emitted by the runtime on abort. */
    CHOICE_SELECTED: 'choice-selected',
    HIDE_CHOICES: 'hide-choices',

    // Event runtime
    /** Payload: `{ kind: 'switch' | 'variable' | 'selfSwitch' | 'reset'; id: string }`. */
    EVENT_STATE_CHANGED: 'event-state-changed',
    /** Payload: `{ entity: string; map: string; pageId: string; blocking: boolean }`. */
    EVENT_STARTED: 'event-started',
    EVENT_ENDED: 'event-ended',
} as const;
